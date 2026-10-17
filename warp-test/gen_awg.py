#!/usr/bin/env python3
"""
注册 Cloudflare WARP (WireGuard/AWG) 设备并生成包含 AmneziaWG 单边混淆的 Mihomo 订阅配置。

特性：
1. 自动调用 Cloudflare 官方 API 注册 Curve25519 (X25519) 密钥对与 WARP 账号。
2. 提取 client_id 前 3 字节作为 WireGuard 的 reserved 标识。
3. 内置从 xiaohe (Aether) 项目实测验证的 15 个优质 /24 网段及 54 个官方 UDP 端口。
4. 集成无状态 UDP 探活（cfProbePacket 握手探测），并发筛选低延迟存活端点。
5. 配置 One-Sided AmneziaWG 混淆参数（Jc/Jmin/Jmax），突破针对 WireGuard 的 DPI 阻断。
6. 输出完整的 Mihomo 分流配置 (warp-awg.yaml)、标准 AWG 客户端配置 (warp-awg.conf) 及凭据 (awg-account.json)。
"""

import argparse
import base64
import concurrent.futures
from datetime import datetime, timezone
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# 解决 Windows 控制台默认 gbk 导致的输出编码异常
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import x25519
except ImportError:
    print("错误: 需要 cryptography 库，请先运行: pip install cryptography", file=sys.stderr)
    sys.exit(1)

# 来自 xiaohe/internal/wgtun/endpoints.go 实测存活段
CF_V4_PREFIXES = [
    "8.6.112", "8.34.70", "8.34.146", "8.35.211",
    "8.39.125", "8.39.204", "8.39.214", "8.47.69",
    "162.159.192", "162.159.193", "162.159.195",
    "188.114.96", "188.114.97", "188.114.98", "188.114.99",
]

# WARP 官方 54 端口
WARP_PORTS = [
    2408, 4500, 500, 1701,
    854, 859, 864, 878, 880, 890, 891, 894, 903, 908, 928, 934, 939, 942,
    943, 945, 946, 955, 968, 987, 988, 1002, 1010, 1014, 1018, 1070, 1074,
    1180, 1387, 1843, 2371, 2506, 3138, 3476, 3581, 3854, 4177, 4198, 4233,
    5279, 5956, 7103, 7152, 7156, 7281, 7559, 8319, 8742, 8854, 8886,
]

# IPv6 端点候选
CF_V6_ENDPOINTS = [
    "2606:4700:103::1", "2606:4700:103::2",
    "2606:4700:104::1", "2606:4700:104::2",
]

# xiaohe/internal/wgtun/endpoints.go 中的 64 字节无状态探活包
CF_PROBE_PACKET = bytes([
    0x04, 0x67, 0x27, 0x31, 0x72, 0x3f, 0x14, 0x62, 0xbc, 0xf5, 0xb7, 0x28, 0xae, 0xca, 0x31, 0x13,
    0x63, 0xf8, 0xd0, 0xc3, 0x49, 0x97, 0x4a, 0x6c, 0x70, 0x48, 0x11, 0xbe, 0x99, 0x70, 0x19, 0x1d,
    0x31, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xb6, 0xed, 0x1b,
    0xed, 0x21, 0x65, 0x69, 0x02, 0xb9, 0xd8, 0xf3, 0xc2, 0xbd, 0x7d, 0x98, 0xda,
])

RS = "https://raw.githubusercontent.com"
RULESETS = [
    ("🎯 全球直连", f"{RS}/cmliu/ACL4SSR/refs/heads/main/Clash/CFnat.list"),
    ("🎯 全球直连", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/LocalAreaNetwork.list"),
    ("🎯 全球直连", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/UnBan.list"),
    ("🛑 全球拦截", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/BanAD.list"),
    ("🍃 应用净化", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/BanProgramAD.list"),
    ("🍃 应用净化", f"{RS}/cmliu/ACL4SSR/main/Clash/adobe.list"),
    ("🍃 应用净化", f"{RS}/cmliu/ACL4SSR/main/Clash/IDM.list"),
    ("📢 谷歌FCM", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Ruleset/GoogleFCM.list"),
    ("🎯 全球直连", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/GoogleCN.list"),
    ("🎯 全球直连", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Ruleset/SteamCN.list"),
    ("Ⓜ️ 微软服务", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Microsoft.list"),
    ("🍎 苹果服务", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Apple.list"),
    ("📲 电报信息", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Telegram.list"),
    ("🤖 AI服务", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Ruleset/OpenAi.list"),
    ("🤖 AI服务", f"{RS}/juewuy/ShellClash/master/rules/ai.list"),
    ("🤖 AI服务", f"{RS}/cmliu/ACL4SSR/main/Clash/Copilot.list"),
    ("🤖 AI服务", f"{RS}/cmliu/ACL4SSR/main/Clash/GithubCopilot.list"),
    ("🤖 AI服务", f"{RS}/cmliu/ACL4SSR/main/Clash/Claude.list"),
    ("🤖 AI服务", f"{RS}/cmliu/ACL4SSR/main/Clash/Gemini.list"),
    ("📹 油管视频", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Ruleset/YouTube.list"),
    ("🎥 奈飞视频", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Netflix.list"),
    ("🌍 国外媒体", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/ProxyMedia.list"),
    ("🌍 国外媒体", f"{RS}/cmliu/ACL4SSR/main/Clash/Emby.list"),
    ("🚀 节点选择", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/ProxyLite.list"),
    ("🚀 节点选择", f"{RS}/cmliu/ACL4SSR/main/Clash/CMBlog.list"),
    ("🎯 全球直连", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/ChinaDomain.list"),
    ("🎯 全球直连", f"{RS}/ACL4SSR/ACL4SSR/master/Clash/ChinaCompanyIp.list"),
]

AI_DOMAINS = [
    "openai.fm", "operator.chatgpt.com", "chat.com", "anthropic.com",
    "claude.ai", "claudeusercontent.com", "gemini.google.com", "aistudio.google.com",
    "generativelanguage.googleapis.com", "notebooklm.google.com", "notebooklm.google", "labs.google",
    "deepmind.com", "x.ai", "grok.com", "meta.ai",
    "perplexity.ai", "pplx.ai", "perplexity.com", "mistral.ai",
    "chat.mistral.ai", "cohere.com", "cohere.ai", "ai21.com",
    "together.ai", "together.xyz", "fireworks.ai", "groq.com",
    "huggingface.co", "hf.co", "huggingface.js.org", "replicate.com",
    "replicate.delivery", "runpod.io", "modal.com", "openrouter.ai",
    "poe.com", "quora.com", "cursor.com", "cursor.sh",
    "codeium.com", "windsurf.com", "tabnine.com", "sourcegraph.com",
    "phind.com", "v0.dev", "v0.app", "bolt.new",
    "lovable.dev", "devin.ai", "cognition.ai", "midjourney.com",
    "stability.ai", "stablediffusionweb.com", "leonardo.ai", "runwayml.com",
    "pika.art", "lumalabs.ai", "ideogram.ai", "recraft.ai",
    "krea.ai", "civitai.com", "elevenlabs.io", "eleven-labs.com",
    "play.ht", "suno.com", "suno.ai", "udio.com",
    "assemblyai.com", "deepgram.com", "you.com", "kagi.com",
    "exa.ai", "tavily.com", "jasper.ai", "copy.ai",
    "writesonic.com", "notion.so", "langchain.com", "langsmith.com",
    "wandb.ai", "weightsandbiases.com", "pinecone.io", "weaviate.io",
    "qdrant.tech", "chromadb.com", "deepseek.com", "moonshot.cn",
    "moonshotai.com", "kimi.com", "bigmodel.cn", "zhipuai.cn",
    "z.ai", "minimaxi.com", "minimax.io", "hailuoai.com",
    "siliconflow.cn", "dashscope.aliyuncs.com",
]


def generate_keypair():
    priv = x25519.X25519PrivateKey.generate()
    pub = priv.public_key()
    priv_b64 = base64.b64encode(
        priv.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption(),
        )
    ).decode("utf-8")
    pub_b64 = base64.b64encode(
        pub.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
    ).decode("utf-8")
    return priv_b64, pub_b64


def register_account(device_name="gh-actions-awg"):
    print("[1/4] 正在向 Cloudflare 注册 WARP (WireGuard) 账号...")
    priv_b64, pub_b64 = generate_keypair()

    url = "https://api.cloudflareclient.com/v0a3371/reg"
    headers = {
        "User-Agent": "okhttp/3.12.1",
        "Content-Type": "application/json; charset=UTF-8",
    }
    now_str = (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
    payload = {
        "key": pub_b64,
        "install_id": "",
        "fcm_token": "",
        "tos": now_str,
        "model": "PC",
        "type": "Android",
        "locale": "zh_CN",
        "name": device_name,
    }

    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"WARP 注册失败 HTTP {e.code}: {err_msg}")
    except Exception as e:
        raise RuntimeError(f"WARP 注册网络异常: {e}")

    cfg = data.get("config", {})
    client_id = cfg.get("client_id", "")
    reserved = [0, 0, 0]
    if client_id:
        try:
            raw_cid = base64.b64decode(client_id)
            if len(raw_cid) >= 3:
                reserved = [int(x) for x in raw_cid[:3]]
        except Exception:
            pass

    peer_pub = ""
    peers = cfg.get("peers", [])
    if peers and "public_key" in peers[0]:
        peer_pub = peers[0]["public_key"]
    else:
        peer_pub = "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo="

    v4 = cfg.get("interface", {}).get("addresses", {}).get("v4", "172.16.0.2/32").split("/")[0]
    v6 = cfg.get("interface", {}).get("addresses", {}).get("v6", "")

    acc_info = {
        "account_id": data.get("id"),
        "token": data.get("token"),
        "private_key": priv_b64,
        "public_key": pub_b64,
        "peer_public_key": peer_pub,
        "ipv4": v4,
        "ipv6": v6,
        "reserved": reserved,
        "registered_at": now_str,
    }
    print(f"      注册成功! 账号 ID: {acc_info['account_id']}")
    print(f"      内网 IP: {v4} / {v6}")
    print(f"      Reserved 字节: {reserved}")
    return acc_info


def probe_single_endpoint(target, timeout=0.8):
    ip, port = target
    sock = None
    try:
        is_v6 = ":" in ip
        family = socket.AF_INET6 if is_v6 else socket.AF_INET
        sock = socket.socket(family, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        start = time.perf_counter()
        sock.sendto(CF_PROBE_PACKET, (ip, port))
        data, _ = sock.recvfrom(256)
        rtt_ms = int((time.perf_counter() - start) * 1000)
        if len(data) >= 5 and data[0] == 0xCF and data[1] == 0 and data[2] == 0 and data[3] == 0 and data[4] == 0:
            return (ip, port, rtt_ms, True)
    except Exception:
        pass
    finally:
        if sock:
            sock.close()
    return (ip, port, 9999, False)


def discover_live_endpoints(max_nodes=60, do_probe=True):
    print("[2/4] 构建端点池并执行存活探测...")
    candidates = []

    # 1. 精选官方默认节点与高可用入口
    candidates.append(("162.159.192.1", 2408))
    candidates.append(("162.159.193.1", 2408))
    candidates.append(("162.159.195.1", 2408))
    candidates.append(("162.159.198.1", 2408))
    candidates.append(("162.159.199.1", 2408))

    # 2. 从 xiaohe 的 15 个 /24 段中采样优质主机
    port_count = len(WARP_PORTS)
    for p_idx, prefix in enumerate(CF_V4_PREFIXES):
        # 每个段取若干代表性 host
        for host in [1, 2, 6, 7, 10, 25, 50, 70, 99, 100, 128, 150, 171, 200, 214, 250]:
            port = WARP_PORTS[(host + p_idx) % port_count]
            candidates.append((f"{prefix}.{host}", port))
            # 加上经典 2408 / 500 / 4500 端口
            if host in [1, 7, 99]:
                candidates.append((f"{prefix}.{host}", 2408))
                candidates.append((f"{prefix}.{host}", 500))

    # 3. 加入 IPv6 候选
    for v6 in CF_V6_ENDPOINTS:
        for p in [2408, 4500, 500]:
            candidates.append((v6, p))

    # 去重
    seen = set()
    unique_candidates = []
    for ep in candidates:
        if ep not in seen:
            seen.add(ep)
            unique_candidates.append(ep)

    print(f"      候选端点总数: {len(unique_candidates)}")

    if not do_probe:
        print("      跳过探活，直接按预设采样排序...")
        return unique_candidates[:max_nodes]

    print(f"      正在并发探测 UDP 握手包 (cfProbePacket)...")
    live_results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=32) as executor:
        futures = {executor.submit(probe_single_endpoint, ep): ep for ep in unique_candidates}
        for f in concurrent.futures.as_completed(futures):
            res = f.result()
            if res[3]:  # is_live
                live_results.append(res)

    print(f"      探测完成! 存活端点数: {len(live_results)}")

    if len(live_results) < 10:
        print("      ⚠️ 存活节点较少（可能本地网络受限），混入保底优质预设节点...")
        existing = {f"{r[0]}:{r[1]}" for r in live_results}
        for ep in unique_candidates:
            if f"{ep[0]}:{ep[1]}" not in existing:
                live_results.append((ep[0], ep[1], 300, True))
            if len(live_results) >= max_nodes:
                break

    # 按 RTT 升序排序
    live_results.sort(key=lambda x: x[2])
    selected = [(r[0], r[1]) for r in live_results[:max_nodes]]
    return selected


def format_node_name(ip, port):
    if ":" in ip:
        parts = [p for p in ip.split(":") if p]
        tag = parts[-1] if parts else "v6"
        return f"AWG6-{tag}-{port}"
    parts = ip.split(".")
    short_ip = f"{parts[-2]}.{parts[-1]}" if len(parts) >= 2 else ip
    return f"AWG-{short_ip}-{port}"


def build_mihomo_yaml(acc, endpoints, jc=4, jmin=40, jmax=70):
    priv = acc["private_key"]
    pub = acc["peer_public_key"]
    v4 = acc["ipv4"]
    v6 = acc["ipv6"]
    reserved = acc["reserved"]

    proxies_yaml = []
    node_names = []

    for ip, port in endpoints:
        name = format_node_name(ip, port)
        # 防止重名
        if name in node_names:
            idx = 2
            while f"{name}-{idx}" in node_names:
                idx += 1
            name = f"{name}-{idx}"
        node_names.append(name)

        srv_val = f'"{ip}"' if ":" in ip else ip
        v6_line = f"\n    ipv6: {v6}" if v6 else ""

        proxy_block = f"""  - name: {name}
    type: wireguard
    server: {srv_val}
    port: {port}
    ip: {v4}{v6_line}
    private-key: {priv}
    public-key: {pub}
    reserved: {reserved}
    udp: true
    mtu: 1280
    remote-dns-resolve: true
    dns: [1.1.1.1, 2606:4700:4700::1111]
    amnezia-wg-option:
      jc: {jc}
      jmin: {jmin}
      jmax: {jmax}"""
        proxies_yaml.append(proxy_block)

    # 官方域名保底节点
    node_names.append("AWG-官方端点")
    proxies_yaml.append(f"""  - name: AWG-官方端点
    type: wireguard
    server: engage.cloudflareclient.com
    port: 2408
    ip: {v4}
    private-key: {priv}
    public-key: {pub}
    reserved: {reserved}
    udp: true
    mtu: 1280
    remote-dns-resolve: true
    dns: [1.1.1.1, 2606:4700:4700::1111]
    amnezia-wg-option:
      jc: {jc}
      jmin: {jmin}
      jmax: {jmax}""")

    ind = lambda lst, n=6: "\n".join(" " * n + f"- {x}" for x in lst)

    prov, rules = [], []
    for i, (group, url) in enumerate(RULESETS):
        pn = f"rule{i:02d}"
        prov.append(f"""  {pn}:
    type: http
    behavior: classical
    format: text
    interval: 86400
    url: {url}
    path: ./ruleset/{pn}.list""")
        rules.append(f"  - RULE-SET,{pn},{group}")

    rules = [f"  - DOMAIN-SUFFIX,{d},🤖 AI服务" for d in AI_DOMAINS] + rules

    content = f"""# Cloudflare WARP over AmneziaWG (AWG) - mihomo 配置
# 由 GitHub Actions 自动化生成，适配 Mihomo / Clash Meta 稳定版与 Alpha 版
# 支持 One-Sided AmneziaWG 反 DPI 混淆 (jc={jc}, jmin={jmin}, jmax={jmax})
#
# 节点数: {len(node_names)} 个
# 账号 ID: {acc.get('account_id', 'unknown')}

mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: true
unified-delay: true
tcp-concurrent: true
find-process-mode: 'off'
external-controller: 127.0.0.1:9090

profile:
  store-selected: true
  store-fake-ip: true

sniffer:
  enable: true
  sniff:
    HTTP:
      ports: [80, 8080-8880]
      override-destination: true
    TLS:
      ports: [443, 8443]
    QUIC:
      ports: [443, 8443]
  skip-domain:
    - '+.push.apple.com'
    - '+.apple.com'

dns:
  enable: true
  listen: 0.0.0.0:1053
  ipv6: true
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  fake-ip-filter:
    - '+.lan'
    - '+.local'
    - '*.msftconnecttest.com'
    - '*.msftncsi.com'
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  nameserver:
    - https://223.5.5.5/dns-query
    - https://1.12.12.12/dns-query
  proxy-server-nameserver:
    - https://223.5.5.5/dns-query
  nameserver-policy:
    'geosite:cn,private':
      - https://223.5.5.5/dns-query
      - https://1.12.12.12/dns-query
    'geosite:geolocation-!cn':
      - https://1.1.1.1/dns-query
      - https://8.8.8.8/dns-query

proxies:
{chr(10).join(proxies_yaml)}

proxy-groups:
  - name: 🚀 节点选择
    type: select
    proxies:
      - ♻️ 自动选择
      - 🔄 故障转移
      - ☑️ 手动切换
      - DIRECT

  - name: ☑️ 手动切换
    type: select
    proxies:
{ind(node_names)}

  - name: ♻️ 自动选择
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    lazy: false
    proxies:
{ind(node_names)}

  - name: 🔄 故障转移
    type: fallback
    url: http://www.gstatic.com/generate_204
    interval: 180
    proxies:
{ind(node_names)}

  - name: 📹 油管视频
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🔄 故障转移
      - ☑️ 手动切换
      - DIRECT

  - name: 🎥 奈飞视频
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🔄 故障转移
      - ☑️ 手动切换
      - DIRECT

  - name: 🌍 国外媒体
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🔄 故障转移
      - 🎯 全球直连

  - name: 📲 电报信息
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🎯 全球直连

  - name: 🤖 AI服务
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🔄 故障转移
      - ☑️ 手动切换
      - DIRECT

  - name: Ⓜ️ 微软服务
    type: select
    proxies:
      - 🎯 全球直连
      - 🚀 节点选择
      - ♻️ 自动选择

  - name: 🍎 苹果服务
    type: select
    proxies:
      - 🎯 全球直连
      - 🚀 节点选择
      - ♻️ 自动选择

  - name: 📢 谷歌FCM
    type: select
    proxies:
      - 🚀 节点选择
      - 🎯 全球直连
      - ♻️ 自动选择

  - name: 🎯 全球直连
    type: select
    proxies:
      - DIRECT
      - 🚀 节点选择
      - ♻️ 自动选择

  - name: 🛑 全球拦截
    type: select
    proxies:
      - REJECT
      - DIRECT

  - name: 🍃 应用净化
    type: select
    proxies:
      - REJECT
      - DIRECT

  - name: 🐟 漏网之鱼
    type: select
    proxies:
      - 🚀 节点选择
      - 🎯 全球直连
      - ♻️ 自动选择

rule-providers:
{chr(10).join(prov)}

rules:
{chr(10).join(rules)}
  - GEOIP,LAN,🎯 全球直连,no-resolve
  - GEOIP,CN,🎯 全球直连
  - MATCH,🐟 漏网之鱼
"""
    return content, len(node_names)


def build_awg_conf(acc, best_endpoint, jc=4, jmin=40, jmax=70):
    priv = acc["private_key"]
    pub = acc["peer_public_key"]
    v4 = acc["ipv4"]
    v6 = acc["ipv6"]
    addr_line = f"{v4}/32" + (f", {v6}/128" if v6 else "")
    res = ",".join(str(x) for x in acc["reserved"])
    ep_str = f"{best_endpoint[0]}:{best_endpoint[1]}"

    conf = f"""[Interface]
PrivateKey = {priv}
Address = {addr_line}
DNS = 1.1.1.1, 2606:4700:4700::1111
MTU = 1280
Jc = {jc}
Jmin = {jmin}
Jmax = {jmax}

[Peer]
PublicKey = {pub}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = {ep_str}
PersistentKeepalive = 25
Reserved = {res}
"""
    return conf


def main():
    parser = argparse.ArgumentParser(description="生成 Cloudflare WARP AmneziaWG (AWG) Mihomo 配置")
    parser.add_argument("--output-dir", default="dist", help="输出目录 (默认 dist)")
    parser.add_argument("--device-name", default="gh-actions-awg", help="注册设备名称")
    parser.add_argument("--max-nodes", type=int, default=60, help="最多生成节点数量")
    parser.add_argument("--no-probe", action="store_true", help="跳过 UDP 握手包并发探活")
    parser.add_argument("--jc", type=int, default=4, help="AWG 垃圾包数量 (Jc)")
    parser.add_argument("--jmin", type=int, default=40, help="AWG 垃圾包最小字节 (Jmin)")
    parser.add_argument("--jmax", type=int, default=70, help="AWG 垃圾包最大字节 (Jmax)")
    parser.add_argument("--account-file", default=None, help="复用已有账号 JSON 文件")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    # 1. 账号获取
    if args.account_file and os.path.exists(args.account_file):
        print(f"从 {args.account_file} 加载已有账号...")
        with open(args.account_file, "r", encoding="utf-8") as f:
            acc = json.load(f)
    else:
        acc = register_account(args.device_name)
        acc_path = os.path.join(args.output_dir, "awg-account.json")
        with open(acc_path, "w", encoding="utf-8") as f:
            json.dump(acc, f, indent=2, ensure_ascii=False)
        print(f"      账号凭据已保存至: {acc_path}")

    # 2. 端点探测
    endpoints = discover_live_endpoints(max_nodes=args.max_nodes, do_probe=not args.no_probe)

    # 3. 生成 Mihomo 配置
    print("[3/4] 正在组装 Mihomo (Clash Meta) 配置文件...")
    yaml_text, count = build_mihomo_yaml(acc, endpoints, jc=args.jc, jmin=args.jmin, jmax=args.jmax)
    yaml_path = os.path.join(args.output_dir, "warp-awg.yaml")
    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write(yaml_text)

    # 4. 生成通用 AmneziaWG .conf
    print("[4/4] 正在生成标准 AmneziaWG 客户端配置文件 (.conf)...")
    best_ep = endpoints[0] if endpoints else ("162.159.192.1", 2408)
    conf_text = build_awg_conf(acc, best_ep, jc=args.jc, jmin=args.jmin, jmax=args.jmax)
    conf_path = os.path.join(args.output_dir, "warp-awg.conf")
    with open(conf_path, "w", encoding="utf-8") as f:
        f.write(conf_text)

    print("\n" + "=" * 50)
    print("[OK] 配置生成完成!")
    print(f"  • Mihomo 订阅配置: {yaml_path} (节点数: {count})")
    print(f"  • AWG 客户端配置: {conf_path} (默认首选: {best_ep[0]}:{best_ep[1]})")
    print(f"  • 账号凭据备份:   {os.path.join(args.output_dir, 'awg-account.json')}")
    print("=" * 50)


if __name__ == "__main__":
    main()
