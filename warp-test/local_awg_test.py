#!/usr/bin/env python3
"""
本机 WARP AWG 端点极速测速与配置生成工具
专门针对本机真实网络环境，测试并筛选延迟最低、稳定性最好的 Cloudflare WARP 端点。
"""

import concurrent.futures
import json
import os
import socket
import sys
import time
import urllib.request

# 解决 Windows 编码
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# 导入生成函数
sys.path.insert(0, os.path.dirname(__file__))
try:
    import gen_awg
except ImportError:
    print("错误: 未找到 gen_awg.py", file=sys.stderr)
    sys.exit(1)

CF_V4_PREFIXES = gen_awg.CF_V4_PREFIXES
WARP_PORTS = gen_awg.WARP_PORTS
CF_PROBE_PACKET = gen_awg.CF_PROBE_PACKET


def check_current_network():
    print("[1/4] 检查当前网络出站状态...")
    try:
        req = urllib.request.Request("http://ip-api.com/json/?lang=zh-CN", headers={"User-Agent": "curl/7.88.1"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            ip = data.get("query", "未知")
            country = data.get("country", "")
            isp = data.get("isp", "")
            print(f"      当前外网 IP : {ip}")
            print(f"      地理与运营商: {country} {isp}")
            if country in ["中国", "China"]:
                print("      [状态确认] 当前为中国大陆物理网络直连，测速数据完全真实有效！")
            else:
                print("      [提示] 当前外网 IP 识别为境外，可能正通过代理出站。")
                print("             如果希望测试纯国内宽带直连，可先在客户端暂停代理后再测。")
    except Exception:
        print("      外网归属查询超时（不影响后续测速）。")


def probe_endpoint_multi(target, rounds=3, timeout=0.8):
    ip, port = target
    rtts = []
    sock = None
    try:
        is_v6 = ":" in ip
        family = socket.AF_INET6 if is_v6 else socket.AF_INET
        sock = socket.socket(family, socket.SOCK_DGRAM)
        sock.settimeout(timeout)

        for _ in range(rounds):
            start = time.perf_counter()
            sock.sendto(CF_PROBE_PACKET, (ip, port))
            data, _ = sock.recvfrom(256)
            rtt = (time.perf_counter() - start) * 1000
            if len(data) >= 5 and data[0] == 0xCF and data[1] == 0 and data[2] == 0 and data[3] == 0 and data[4] == 0:
                rtts.append(rtt)
            time.sleep(0.01)
    except Exception:
        pass
    finally:
        if sock:
            sock.close()

    if len(rtts) == 0:
        return (ip, port, 9999, 1.0, 999)  # 全部失败

    loss = (rounds - len(rtts)) / rounds
    avg_rtt = sum(rtts) / len(rtts)
    jitter = max(rtts) - min(rtts) if len(rtts) > 1 else 0
    return (ip, port, avg_rtt, loss, jitter)


def run_benchmark(mode="fast", workers=48):
    print(f"[2/4] 从 xiaohe 优质网段池提取候选端点 (模式: {mode})...")
    candidates = []

    # 经典固定入口
    candidates.append(("162.159.192.1", 2408))
    candidates.append(("162.159.193.1", 2408))
    candidates.append(("162.159.195.1", 2408))
    candidates.append(("162.159.198.1", 2408))
    candidates.append(("162.159.199.1", 2408))

    port_count = len(WARP_PORTS)

    if mode == "full":
        # 全量模式: 15 个 /24 的全部 254 个主机 (3810 个 IP)
        print("      [模式说明] 全量模式：扫描 15 个 /24 全部 3,810 个主机 IP...")
        for prefix in CF_V4_PREFIXES:
            for host in range(1, 255):
                port = WARP_PORTS[host % port_count]
                candidates.append((f"{prefix}.{host}", port))
    elif mode == "max":
        # 极限量模式: 全部 3810 个主机测试 4 个经典端口 (2408, 500, 4500, 1701)
        print("      [模式说明] 极致压测模式：扫描 15 个 /24 全部 3,810 个 IP x 4 个关键端口 (15,240 个端点)...")
        for prefix in CF_V4_PREFIXES:
            for host in range(1, 255):
                for p in [2408, 500, 4500, 1701]:
                    candidates.append((f"{prefix}.{host}", p))
    else:
        # 快速模式 (fast): 每个段抽样 13 个代表性 host x 4 端口 (约 770 端点)
        print("      [模式说明] 快速模式：精选代表性端点 (约 770 个)...")
        for p_idx, prefix in enumerate(CF_V4_PREFIXES):
            for host in [1, 2, 7, 10, 25, 50, 70, 99, 100, 128, 171, 200, 214]:
                candidates.append((f"{prefix}.{host}", 2408))
                candidates.append((f"{prefix}.{host}", 500))
                candidates.append((f"{prefix}.{host}", 4500))
                cand_port = WARP_PORTS[(host * 3 + p_idx) % port_count]
                candidates.append((f"{prefix}.{host}", cand_port))

    # 去重
    seen = set()
    pool = []
    for ep in candidates:
        if ep not in seen:
            seen.add(ep)
            pool.append(ep)

    print(f"      候选目标去重后总数: {len(pool)} 个，使用 {workers} 线程并发 3 轮 UDP 握手包探测...")

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(probe_endpoint_multi, ep): ep for ep in pool}
        for f in concurrent.futures.as_completed(futures):
            res = f.result()
            if res[3] < 1.0:  # 丢包率小于 100%
                results.append(res)

    # 排序：丢包率升序 -> 平均延迟升序
    results.sort(key=lambda x: (x[3], x[2]))

    print(f"[3/4] 测速完成！共发现 {len(results)} 个存活端点。")
    print("\n" + "=" * 65)
    print(f"{'排名':<4} {'端点 (IP:Port)':<24} {'平均延迟':<10} {'丢包率':<8} {'抖动':<8}")
    print("-" * 65)

    top20 = results[:20]
    for idx, (ip, port, rtt, loss, jitter) in enumerate(top20, 1):
        loss_pct = f"{int(loss * 100)}%"
        print(f"#{idx:<3} {f'{ip}:{port}':<24} {f'{rtt:.1f} ms':<10} {loss_pct:<8} {f'{jitter:.1f} ms':<8}")
    print("=" * 65 + "\n")

    return results


def main():
    import argparse
    parser = argparse.ArgumentParser(description="WARP AWG 测速优选工具")
    parser.add_argument("--mode", choices=["fast", "full", "max"], default="fast", help="扫描模式: fast(精选~770个), full(全量3810个IP), max(全量IPx4关键端口)")
    parser.add_argument("--workers", type=int, default=48, help="并发探测线程数 (默认 48)")
    args = parser.parse_args()

    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "local_results")
    os.makedirs(out_dir, exist_ok=True)

    check_current_network()
    results = run_benchmark(mode=args.mode, workers=args.workers)

    if not results:
        print("未探测到存活端点，请检查网络连接！")
        return

    # 生成本地测试报告
    report_file = os.path.join(out_dir, "local_test_report.txt")
    with open(report_file, "w", encoding="utf-8") as f:
        f.write("WARP AWG 本机测速优选报告\n")
        f.write(f"测试时间: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write(f"{'排名':<4} {'端点 (IP:Port)':<24} {'平均延迟':<10} {'丢包率':<8} {'抖动':<8}\n")
        f.write("-" * 65 + "\n")
        for idx, (ip, port, rtt, loss, jitter) in enumerate(results[:50], 1):
            f.write(f"#{idx:<3} {f'{ip}:{port}':<24} {f'{rtt:.1f} ms':<10} {int(loss*100)}%    {f'{jitter:.1f} ms':<8}\n")

    print(f"[4/4] 自动为本机生成专属的最优 AWG 配置文件...")
    # 获取或注册账号
    acc_file = os.path.join(out_dir, "awg-account.json")
    if os.path.exists(acc_file):
        with open(acc_file, "r", encoding="utf-8") as f:
            acc = json.load(f)
    else:
        acc = gen_awg.register_account("my-pc-awg")
        with open(acc_file, "w", encoding="utf-8") as f:
            json.dump(acc, f, indent=2, ensure_ascii=False)

    top_endpoints = [(r[0], r[1]) for r in results[:40]]

    # 生成 Mihomo 订阅与 AWG 客户端配置
    yaml_text, count = gen_awg.build_mihomo_yaml(acc, top_endpoints, jc=4, jmin=40, jmax=70)
    yaml_path = os.path.join(out_dir, "warp-awg-local.yaml")
    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write(yaml_text)

    best_ep = top_endpoints[0]
    conf_text = gen_awg.build_awg_conf(acc, best_ep, jc=4, jmin=40, jmax=70)
    conf_path = os.path.join(out_dir, "warp-awg-local.conf")
    with open(conf_path, "w", encoding="utf-8") as f:
        f.write(conf_text)

    print("\n" + "*" * 60)
    print("【测试完毕！已为您就绪以下专属产物】")
    print(f"1. 测速详细排名报告 : {report_file}")
    print(f"2. 本机专属Mihomo配置: {yaml_path} (收录 {count} 个极速节点)")
    print(f"3. 本机专属AWG配置   : {conf_path} (首选: {best_ep[0]}:{best_ep[1]})")
    print("*" * 60)


if __name__ == "__main__":
    main()
