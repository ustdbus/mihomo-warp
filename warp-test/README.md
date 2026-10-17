# Cloudflare WARP AWG 测速与优选工具 (warp-test)

本项目是独立的 Cloudflare WARP (AmneziaWG / WireGuard) 边缘端点高并发测速与配置文件生成工具。

## 目录结构
```text
warp-test/
├── run_awg_benchmark.bat   # 交互式控制台菜单启动脚本
├── local_awg_test.py       # UDP 并发探活、测速排序主程序
├── gen_awg.py              # Cloudflare WARP 账号注册与 Mihomo / AWG 配置生成
├── local_results/          # 测速报告与生成配置输出目录
│   ├── local_test_report.txt  # 本机测速详细排名报告
│   ├── warp-awg-local.yaml    # 本机专属 Mihomo (Clash Meta) 配置文件
│   ├── warp-awg-local.conf    # 本机专属 WireGuard / Amnezia 官方客户端配置
│   ├── awg-account.json       # 本机 WARP 账号与密钥凭据
│   └── gz_huawei_report.txt   # 华为云 VPS 远程测速对照报告
└── README.md
```

## 使用方法
1. **桌面快捷运行**：直接双击桌面上的 `run_awg_benchmark.bat`。
2. **命令行执行**：
   - 快速测速 (~770 端点, 约 10 秒)：`python local_awg_test.py --mode fast`
   - 全量测速 (3,810 端点, 约 35 秒)：`python local_awg_test.py --mode full --workers 64`
   - 极致压测 (15,240 端点)：`python local_awg_test.py --mode max --workers 64`
