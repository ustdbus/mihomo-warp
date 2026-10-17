// 生成 mihomo 配置：支持 WireGuard (AmneziaWG) 或 MASQUE 专属协议与多落地组合。

// 优选 20 个 Cloudflare AWG/WireGuard 默认前置接入点（保底与预设）
export const AWG_OPTIMIZED_ENDPOINTS = [
  { ip: "8.35.211.50", port: 4500, tag: "AWG-优选01" },
  { ip: "8.35.211.10", port: 500, tag: "AWG-优选02" },
  { ip: "8.39.125.2", port: 2408, tag: "AWG-优选03" },
  { ip: "8.39.125.171", port: 1180, tag: "AWG-优选04" },
  { ip: "8.39.125.99", port: 1180, tag: "AWG-优选05" },
  { ip: "8.39.125.10", port: 2408, tag: "AWG-优选06" },
  { ip: "8.39.125.10", port: 2371, tag: "AWG-优选07" },
  { ip: "8.39.125.70", port: 2408, tag: "AWG-优选08" },
  { ip: "8.35.211.100", port: 500, tag: "AWG-优选09" },
  { ip: "8.39.125.50", port: 2408, tag: "AWG-优选10" },
  { ip: "8.39.125.7", port: 4500, tag: "AWG-优选11" },
  { ip: "8.35.211.7", port: 500, tag: "AWG-优选12" },
  { ip: "8.39.125.50", port: 4500, tag: "AWG-优选13" },
  { ip: "8.39.125.128", port: 891, tag: "AWG-优选14" },
  { ip: "8.39.125.214", port: 500, tag: "AWG-优选15" },
  { ip: "8.35.211.2", port: 2408, tag: "AWG-优选16" },
  { ip: "8.39.125.25", port: 4500, tag: "AWG-优选17" },
  { ip: "8.39.125.171", port: 4500, tag: "AWG-优选18" },
  { ip: "8.35.211.70", port: 500, tag: "AWG-优选19" },
  { ip: "8.35.211.50", port: 7103, tag: "AWG-优选20" },
];

// xiaohe (Aether Core) 提供的 Cloudflare 存活 IP 段池
export const XIAOHE_SEED_RANGES = [
  "162.159.196.0/24",
  "162.159.195.0/24",
  "162.159.192.0/24",
  "162.159.193.0/24",
  "162.159.204.0/24",
  "162.159.197.0/24",
  "162.159.198.0/24",
  "172.65.251.0/24",
  "188.114.96.0/24",
  "188.114.97.0/24",
  "188.114.98.0/24",
  "188.114.99.0/24",
  "162.159.36.0/24",
  "162.159.46.0/24",
  "8.35.211.0/24",
  "8.39.125.0/24",
];

// Cloudflare WireGuard 高连通抗阻断常用端口
export const XIAOHE_PORTS = [500, 1701, 2408, 4500, 1180, 2371, 7103, 891];

/** 从 xiaohe 提供的 IP 段中动态组合采样 count 个不重复的 IP:Port 前置接入点 */
export function sampleXiaoheEndpoints(count = 20) {
  const result = [];
  const used = new Set();
  const ranges = [...XIAOHE_SEED_RANGES].sort(() => Math.random() - 0.5);

  let attempts = 0;
  while (result.length < count && attempts < 500) {
    attempts++;
    const cidr = ranges[result.length % ranges.length];
    const base = cidr.replace(".0/24", "");
    const host = Math.floor(Math.random() * 253) + 1;
    const ip = `${base}.${host}`;
    const port = XIAOHE_PORTS[Math.floor(Math.random() * XIAOHE_PORTS.length)];
    const key = `${ip}:${port}`;
    if (!used.has(key)) {
      used.add(key);
      const idx = String(result.length + 1).padStart(2, "0");
      result.push({ ip, port, tag: `AWG-优选${idx}` });
    }
  }

  // 若采样不足则用静态优选池补齐
  if (result.length < count) {
    for (const ep of AWG_OPTIMIZED_ENDPOINTS) {
      if (result.length >= count) break;
      const key = `${ep.ip}:${ep.port}`;
      if (!used.has(key)) {
        used.add(key);
        const idx = String(result.length + 1).padStart(2, "0");
        result.push({ ...ep, tag: `AWG-优选${idx}` });
      }
    }
  }
  return result;
}

const V4 = ["162.159.198.1", "162.159.198.2", "162.159.199.1", "162.159.199.2"];
const V6 = ["2606:4700:103::1", "2606:4700:103::2",
            "2606:4700:104::1", "2606:4700:104::2"];
const PORTS = [443, 500, 1701, 4500, 4443, 8443, 8095];

const OFFICIAL_SNI = "zt-masque.cloudflareclient.com";
const SNI_NODE = ["162.159.198.1", 443];

const RS = "https://raw.githubusercontent.com";
const RULESETS = [
  ["🎯 全球直连", RS + "/cmliu/ACL4SSR/refs/heads/main/Clash/CFnat.list"],
  ["🎯 全球直连", RS + "/ACL4SSR/ACL4SSR/master/Clash/LocalAreaNetwork.list"],
  ["🎯 全球直连", RS + "/ACL4SSR/ACL4SSR/master/Clash/UnBan.list"],
  ["🛑 全球拦截", RS + "/ACL4SSR/ACL4SSR/master/Clash/BanAD.list"],
  ["🍃 应用净化", RS + "/ACL4SSR/ACL4SSR/master/Clash/BanProgramAD.list"],
  ["🍃 应用净化", RS + "/cmliu/ACL4SSR/main/Clash/adobe.list"],
  ["🍃 应用净化", RS + "/cmliu/ACL4SSR/main/Clash/IDM.list"],
  ["📢 谷歌FCM", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/GoogleFCM.list"],
  ["🎯 全球直连", RS + "/ACL4SSR/ACL4SSR/master/Clash/GoogleCN.list"],
  ["🎯 全球直连", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/SteamCN.list"],
  ["Ⓜ️ 微软服务", RS + "/ACL4SSR/ACL4SSR/master/Clash/Microsoft.list"],
  ["🍎 苹果服务", RS + "/ACL4SSR/ACL4SSR/master/Clash/Apple.list"],
  ["📲 电报信息", RS + "/ACL4SSR/ACL4SSR/master/Clash/Telegram.list"],
  ["🤖 AI服务", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/OpenAi.list"],
  ["🤖 AI服务", RS + "/juewuy/ShellClash/master/rules/ai.list"],
  ["🤖 AI服务", RS + "/cmliu/ACL4SSR/main/Clash/Copilot.list"],
  ["🤖 AI服务", RS + "/cmliu/ACL4SSR/main/Clash/GithubCopilot.list"],
  ["🤖 AI服务", RS + "/cmliu/ACL4SSR/main/Clash/Claude.list"],
  ["🤖 AI服务", RS + "/cmliu/ACL4SSR/main/Clash/Gemini.list"],
  ["📹 油管视频", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/YouTube.list"],
  ["🎥 奈飞视频", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Netflix.list"],
  ["🌍 国外媒体", RS + "/ACL4SSR/ACL4SSR/master/Clash/ProxyMedia.list"],
  ["🌍 国外媒体", RS + "/cmliu/ACL4SSR/main/Clash/Emby.list"],
  ["🚀 节点选择", RS + "/ACL4SSR/ACL4SSR/master/Clash/ProxyLite.list"],
  ["🚀 节点选择", RS + "/cmliu/ACL4SSR/main/Clash/CMBlog.list"],
  ["🎯 全球直连", RS + "/ACL4SSR/ACL4SSR/master/Clash/ChinaDomain.list"],
  ["🎯 全球直连", RS + "/ACL4SSR/ACL4SSR/master/Clash/ChinaCompanyIp.list"]
];

function entryName(ip, port) {
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `v6-${parts[2]}-${parts[parts.length - 1]}-${port}`;
  }
  return `${ip.split(".").slice(2).join(".")}-${port}`;
}

function masqueNode(name, ip, port, priv, pub, v4, v6, sni) {
  const srv = ip.includes(":") ? `"${ip}"` : ip;
  const extra = sni ? `\n    sni: ${sni}` : "";
  return `  - name: ${name}
    type: masque
    server: ${srv}
    port: ${port}${extra}
    private-key: ${priv}
    public-key: ${pub}
    ip: ${v4}
    ipv6: ${v6}
    mtu: 1280
    udp: true
    remote-dns-resolve: true
    dns: [1.1.1.1, 2606:4700:4700::1111]`;
}

function awgNode(name, ip, port, priv, pub, v4, v6, reserved, opt = {}) {
  const srv = ip.includes(":") ? `"${ip}"` : ip;
  const resStr = JSON.stringify(reserved);
  return `  - name: "${name}"
    type: wireguard
    server: ${srv}
    port: ${port}
    ip: ${v4}
    ipv6: ${v6}
    private-key: ${priv}
    public-key: ${pub}
    reserved: ${resStr}
    udp: true
    mtu: 1280
    amnezia-wg-option:
      jc: ${opt.jc || 4}
      jmin: ${opt.jmin || 40}
      jmax: ${opt.jmax || 70}`;
}

export function parseCustomEndpoints(raw, prefix = "AWG") {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const lines = String(raw).split(/\r?\n/);
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
    let [target, customTag] = trimmed.split("#");
    target = target.trim();
    let ip = target, port = 500;
    const lastColon = target.lastIndexOf(":");
    if (lastColon > 0) {
      const p = parseInt(target.slice(lastColon + 1), 10);
      if (!isNaN(p) && p > 0 && p <= 65535) {
        port = p;
        ip = target.slice(0, lastColon).replace(/^\[|\]$/g, "").trim();
      }
    }
    if (ip) {
      const tag = customTag ? `${prefix}-${customTag.trim()}` : `${prefix}-自选-${ip}:${port}`;
      result.push({ ip, port, tag });
    }
  }
  return result;
}

export function buildAwgEntries(warp, customEndpoints = null) {
  if (!warp) return { awgEntries: [], awgProxies: [], awgIps: [] };
  const priv = warp.privateKey;
  const pub = warp.peerPublicKey || "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=";
  const res = warp.reserved || [13, 86, 243];
  const v4 = warp.ipv4 || "172.16.0.2";
  const v6 = warp.ipv6 || "2606:4700:110:8ea3:8c9c:bede:a871:1963";

  const endpoints = (customEndpoints && customEndpoints.length > 0)
    ? customEndpoints
    : sampleXiaoheEndpoints(20);

  const awgEntries = [];
  const awgProxies = [];
  const awgIps = [];
  for (const ep of endpoints) {
    awgEntries.push(ep.tag);
    awgIps.push(ep.ip);
    awgProxies.push(awgNode(ep.tag, ep.ip, ep.port, priv, pub, v4, v6, res));
  }
  return { awgEntries, awgProxies, awgIps };
}

/** 生成 MASQUE 接入点。若有自选端点则优先使用。 */
function buildEntries(warp, customMasqueEndpoints = null) {
  const { privateKey: priv, peerPublicKey: pub, ipv4: v4, ipv6: v6 } = warp;
  const entries = [], proxies = [];
  const v4Entries = [];
  const ips = [];

  if (customMasqueEndpoints && customMasqueEndpoints.length > 0) {
    for (const ep of customMasqueEndpoints) {
      const n = ep.tag.startsWith("MASQUE-") ? ep.tag : `MASQUE-${ep.ip}:${ep.port}`;
      entries.push(n);
      ips.push(ep.ip);
      if (!ep.ip.includes(":")) v4Entries.push(n);
      proxies.push(masqueNode(n, ep.ip, ep.port, priv, pub, v4, v6));
    }
  } else {
    for (const ip of [...V4, ...V6]) {
      ips.push(ip);
      for (const port of PORTS) {
        const n = entryName(ip, port);
        entries.push(n);
        if (!ip.includes(":")) v4Entries.push(n);
        proxies.push(masqueNode(n, ip, port, priv, pub, v4, v6));
      }
    }
  }
  entries.push("官方域名");
  v4Entries.push("官方域名");
  ips.push(SNI_NODE[0]);
  proxies.push(masqueNode("官方域名", SNI_NODE[0], SNI_NODE[1],
                          priv, pub, v4, v6, OFFICIAL_SNI));
  return { entries, proxies, v4Entries, ips };
}

const AI_DOMAINS = [
  "openai.fm", "operator.chatgpt.com", "chat.com",
  "anthropic.com", "claude.ai", "claudeusercontent.com",
  "gemini.google.com", "aistudio.google.com", "generativelanguage.googleapis.com",
  "notebooklm.google.com", "notebooklm.google", "labs.google", "deepmind.com",
  "x.ai", "grok.com",
  "meta.ai",
  "perplexity.ai", "pplx.ai", "perplexity.com",
  "mistral.ai", "chat.mistral.ai",
  "cohere.com", "cohere.ai", "ai21.com", "together.ai", "together.xyz",
  "fireworks.ai", "groq.com",
  "huggingface.co", "hf.co", "huggingface.js.org",
  "replicate.com", "replicate.delivery", "runpod.io", "modal.com",
  "openrouter.ai", "poe.com", "quora.com",
  "cursor.com", "cursor.sh", "codeium.com", "windsurf.com",
  "tabnine.com", "sourcegraph.com", "phind.com", "v0.dev", "v0.app",
  "bolt.new", "lovable.dev", "devin.ai", "cognition.ai",
  "midjourney.com", "stability.ai", "stablediffusionweb.com",
  "leonardo.ai", "runwayml.com", "pika.art", "lumalabs.ai",
  "ideogram.ai", "recraft.ai", "krea.ai", "civitai.com",
  "elevenlabs.io", "eleven-labs.com", "play.ht", "suno.com", "suno.ai",
  "udio.com", "assemblyai.com", "deepgram.com",
  "you.com", "kagi.com", "exa.ai", "tavily.com",
  "jasper.ai", "copy.ai", "writesonic.com", "notion.so",
  "langchain.com", "langsmith.com", "wandb.ai", "weightsandbiases.com",
  "pinecone.io", "weaviate.io", "qdrant.tech", "chromadb.com",
  "deepseek.com", "moonshot.cn", "moonshotai.com", "kimi.com",
  "bigmodel.cn", "zhipuai.cn", "z.ai",
  "minimaxi.com", "minimax.io", "hailuoai.com",
  "siliconflow.cn", "dashscope.aliyuncs.com",
];

const q = (a, n = 6) => a.map((x) => " ".repeat(n) + `- "${x}"`).join("\n");
const p = (a, n = 6) => a.map((x) => " ".repeat(n) + `- ${x}`).join("\n");

const indentBlock = (text, n = 6) => {
  if (!text) return "";
  const pad = " ".repeat(n);
  return text.split(/\r?\n/).map((l) => pad + l.trim()).join("\n");
};

function buildRules(directIps = []) {
  const prov = [], rules = [];

  // 防环路核心：前置与落地节点物理 IP 强制直连，防止 TUN 模式无限死循环递归 (70MB/s 流量风暴)
  const uniqueIps = [...new Set(directIps.filter(Boolean))];
  for (const ip of uniqueIps) {
    const cleanIp = ip.replace(/^\[|\]$/g, "").trim();
    if (cleanIp) {
      const cidr = cleanIp.includes(":") ? `${cleanIp}/128` : `${cleanIp}/32`;
      rules.push(`  - IP-CIDR,${cidr},DIRECT,no-resolve`);
    }
  }

  const ai = AI_DOMAINS.map((d) => `  - DOMAIN-SUFFIX,${d},🤖 AI服务`);
  rules.push(...ai);

  RULESETS.forEach(([group, url], i) => {
    const pn = `rule${String(i).padStart(2, "0")}`;
    prov.push(`  ${pn}:
    type: http
    behavior: classical
    format: text
    interval: 86400
    url: ${url}
    path: ./ruleset/${pn}.list`);
    rules.push(`  - RULE-SET,${pn},${group}`);
  });

  return { prov: prov.join("\n"), rules: rules.join("\n") };
}

function head(ipv6) {
  return `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: ${ipv6}
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
  ipv6: ${ipv6}
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
    - 223.5.5.5
    - 119.29.29.29
    - https://223.5.5.5/dns-query
    - https://1.12.12.12/dns-query
  proxy-server-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  nameserver-policy:
    'geosite:cn,private':
      - 223.5.5.5
      - 119.29.29.29
      - https://223.5.5.5/dns-query
    'geosite:geolocation-!cn':
      - 223.5.5.5
      - 119.29.29.29`;
}

function tailGroups(picks) {
  return `  - name: 📹 油管视频
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🔄 故障转移
${p(picks)}

  - name: 🎥 奈飞视频
    type: select
    proxies:
      - 🚀 节点选择
      - ♻️ 自动选择
      - 🔄 故障转移
${p(picks)}

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
${p(picks)}

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
      - ♻️ 自动选择`;
}

export const PROTON_CC_MAP = {
  JP: "日本", SG: "新加坡", US: "美国", CA: "加拿大",
  NL: "荷兰", CH: "瑞士", PL: "波兰", RO: "罗马尼亚",
  NO: "挪威", MX: "墨西哥",
};

export function getProtonRegion(srv) {
  if (srv.cc && PROTON_CC_MAP[srv.cc.toUpperCase()]) {
    return PROTON_CC_MAP[srv.cc.toUpperCase()];
  }
  const match = (srv.name || "").match(/^[\u4e00-\u9fa5]+/);
  if (match) return match[0];
  return (srv.name || "").replace(/\d+$/, "").trim();
}

export function getProtonIndex(srv) {
  const match = (srv.name || "").match(/\d+$/);
  return match ? parseInt(match[0], 10) : 999;
}

export const REGION_ORDER = [
  "日本", "新加坡", "美国", "加拿大", "荷兰",
  "瑞士", "挪威", "波兰", "罗马尼亚", "墨西哥"
];

export function buildConfig(warp, opera, proton, wind, arg5 = {}, arg6 = {}) {
  let vpngate = null;
  let options = {};

  const isVpnGate = (obj) => Boolean(obj && (Array.isArray(obj.servers) || obj.regions));

  if (isVpnGate(arg5)) {
    vpngate = arg5;
    options = arg6 || {};
  } else if (isVpnGate(arg6)) {
    vpngate = arg6;
    options = arg5 || {};
  } else if (arg5 && (arg5.protocolMode !== undefined || arg5.enableOpera !== undefined || arg5.enableVpnGate !== undefined || arg5.vpngateRegions !== undefined)) {
    options = arg5;
    if (arg5.vpngate) vpngate = arg5.vpngate;
    if (arg6 && arg6.vpngate) vpngate = arg6.vpngate;
  } else {
    options = arg5 || {};
    if (arg6 && typeof arg6 === "object") {
      options = { ...options, ...arg6 };
    }
    if (options.vpngate) vpngate = options.vpngate;
  }

  const protocolMode = options.protocolMode === "wg" ? "wg" : (options.protocolMode === "masque" ? "masque" : (options.protocolMode ? options.protocolMode : "masque"));
  const enableOpera = options.enableOpera !== false;
  const enableProton = options.enableProton !== false;
  const enableWarpDirect = options.enableWarpDirect !== false;
  const enableWind = options.enableWind !== false;
  const enableVpnGate = options.enableVpnGate !== false;
  const customWgEndpoints = options.customWgEndpoints || null;
  const customMsEndpoints = options.customMsEndpoints || null;
  const protonRegions = options.protonRegions || null;
  const protonServers = options.protonServers || null;
  const vpngateRegions = Array.isArray(options.vpngateRegions) ? options.vpngateRegions : ["日本", "韩国"];

  let entries = [];
  let proxies = [];
  let v4Entries = [];
  let directIps = [];

  if (protocolMode === "wg") {
    const { awgEntries, awgProxies, awgIps } = buildAwgEntries(warp, customWgEndpoints);
    entries = awgEntries;
    proxies = [...awgProxies];
    v4Entries = awgEntries;
    directIps = [...awgIps];
  } else {
    const res = buildEntries(warp, customMsEndpoints);
    entries = res.entries;
    proxies = [...res.proxies];
    v4Entries = res.v4Entries;
    directIps = [...(res.ips || [])];
  }

  // Opera 落地组合（笛卡尔积）
  const byLoc = {};
  if (enableOpera && opera && opera.landings && opera.landings.length) {
    for (const land of opera.landings) {
      for (const ent of entries) {
        const name = `${land.tag}@${ent}`;
        (byLoc[land.loc] ||= []).push(name);
        proxies.push(
          `  - {name: "${name}", type: http, server: ${land.ip}, port: ${land.port}, ` +
          `username: ${opera.username}, password: ${opera.password}, tls: true, ` +
          `sni: ${land.host}, skip-cert-verify: false, dialer-proxy: ${ent}}`);
      }
    }
  }
  const combos = Object.values(byLoc).reduce((a, b) => a + b.length, 0);

  // Proton 落地 (支持用户在 Worker 面板自由勾选具体落地服务器或国家/地区)
  let protonNames = [];
  const protonByServer = {};
  const protonByCC = {};

  // 严格按用户所选落地服务器或国家及内部序号排序，确保分类准确、整洁、不穿插
  const targetProtonServers = [];
  if (enableProton && proton && Array.isArray(proton.servers)) {
    if (Array.isArray(protonServers)) {
      // 精准服务器模式：仅保留用户选中的具体服务器
      const allowed = new Set(protonServers);
      for (const s of proton.servers) {
        const reg = getProtonRegion(s);
        const cc = (s.cc || "").toUpperCase();
        if (allowed.has(s.name) || allowed.has(s.ip) || allowed.has(reg) || allowed.has(cc)) {
          targetProtonServers.push(s);
        }
      }
    } else {
      // 地区模式
      const selectedRegions = Array.isArray(protonRegions)
        ? protonRegions
        : ["日本", "新加坡"]; // 默认亚太优选: 日本与新加坡
      for (const reg of selectedRegions) {
        const matched = proton.servers.filter((s) => {
          const r = getProtonRegion(s);
          const cc = (s.cc || "").toUpperCase();
          return r === reg || cc === reg.toUpperCase() || (s.name || "").includes(reg);
        });
        targetProtonServers.push(...matched);
      }
    }

    // 稳定排序：按 REGION_ORDER 地区顺序，同地区按序号递增
    targetProtonServers.sort((a, b) => {
      const regA = getProtonRegion(a);
      const regB = getProtonRegion(b);
      if (regA !== regB) {
        const idxA = REGION_ORDER.indexOf(regA);
        const idxB = REGION_ORDER.indexOf(regB);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return regA.localeCompare(regB, "zh-CN");
      }
      return getProtonIndex(a) - getProtonIndex(b);
    });
  }

  if (targetProtonServers.length) {
    directIps.push(...targetProtonServers.map((s) => s.ip));
    const dialerList = protocolMode === "wg" ? entries : v4Entries;
    for (const srv of targetProtonServers) {
      protonByServer[srv.name] = [];
      const reg = getProtonRegion(srv);
      protonByCC[reg] = protonByCC[reg] || [];

      for (const ent of dialerList) {
        const name = `${srv.name}@${ent}`;
        protonNames.push(name);
        protonByServer[srv.name].push(name);
        protonByCC[reg].push(name);

        proxies.push(`  - name: "${name}"
    type: wireguard
    server: ${srv.ip}
    port: ${srv.port}
    ip: 10.2.0.2
    private-key: ${proton.privateKey}
    public-key: ${srv.pub}
    udp: true
    mtu: 1120
    keepalive: 25
    dialer-proxy: ${ent}`);
      }
    }
  }

  // Windscribe 落地 (轮询接入点)
  const windNames = [];
  const windByLoc = {};
  if (enableWind && wind && wind.servers && wind.servers.length) {
    const dialerList = protocolMode === "wg" ? entries : v4Entries;
    if (dialerList.length) {
      wind.servers.forEach((srv, i) => {
        const ent = dialerList[i % dialerList.length];
        const name = `WS-${srv.tag}`;
        windNames.push(name);
        (windByLoc[srv.loc] = windByLoc[srv.loc] || []).push(name);
        proxies.push(
          `  - {name: "${name}", type: http, server: ${srv.host}, port: ${srv.port}, ` +
          `username: ${wind.username}, password: ${wind.password}, tls: true, ` +
          `sni: ${srv.host}, skip-cert-verify: false, dialer-proxy: ${ent}}`);
      });
    }
  }

  const locNames = Object.keys(byLoc).map((l) => `${l}线路`);
  const locDefs = Object.entries(byLoc).map(([loc, tags]) => `  - name: ${loc}线路
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 80
    lazy: true
    proxies:
${q(tags)}`).join("\n\n");

  // 核心保护：Proton 官方免费账号严格限制单设备会话，禁止任何 url-test 并发测速轰炸。
  // 策略组仅保留 Proton-国家/地区，直接包含该国家选中的落地节点
  const protonCCNames = Object.keys(protonByCC).map((c) => `Proton-${c}`);
  const protonCCDefs = Object.entries(protonByCC).map(([cc, names]) =>
    `  - name: Proton-${cc}
    type: select
    proxies:
${p(names)}`
  ).join("\n\n");

  const windLocNames = Object.keys(windByLoc).map((l) => `WS-${l}`);
  const windLocDefs = Object.entries(windByLoc).map(([loc, names]) =>
    `  - name: WS-${loc}
    type: url-test
    url: http://cp.cloudflare.com/generate_204
    interval: 300
    tolerance: 100
    lazy: true
    proxies:
${q(names)}`).join("\n\n");

  // VPN Gate 落地 (OpenVPN，支持用户勾选国家/地区)
  const vgNames = [];
  const vgByCountry = {};
  const targetVgServers = [];

  if (enableVpnGate && vpngate && Array.isArray(vpngate.servers)) {
    const selectedRegions = new Set(vpngateRegions);
    for (const s of vpngate.servers) {
      if (selectedRegions.has(s.country) || selectedRegions.has(s.cc)) {
        targetVgServers.push(s);
      }
    }
  }

  if (targetVgServers.length) {
    const dialerList = protocolMode === "wg" ? entries : v4Entries;
    if (dialerList.length) {
      targetVgServers.forEach((srv, i) => {
        const ent = dialerList[i % dialerList.length];
        const name = `${srv.name}@${ent}`;
        vgNames.push(name);
        (vgByCountry[srv.country] = vgByCountry[srv.country] || []).push(name);
        if (srv.ip) directIps.push(srv.ip);

        proxies.push(`  - name: "${name}"
    type: openvpn
    server: ${srv.ip}
    port: ${srv.port}
    proto: ${srv.proto}
    username: vpn
    password: vpn
    cipher: ${srv.cipher || "AES-128-CBC"}
    auth: ${srv.auth || "SHA1"}
    udp: ${srv.proto === "udp"}
    dialer-proxy: ${ent}
    ca: |
${indentBlock(srv.ca, 6)}
    cert: |
${indentBlock(srv.cert, 6)}
    key: |
${indentBlock(srv.key, 6)}`);
      });
    }
  }

  // 策略组：跟 VPN Gate 相关的仅保留 VPNGate-国家/地区
  const vgCCNames = Object.keys(vgByCountry).map((c) => `VPNGate-${c}`);
  const vgCCDefs = Object.entries(vgByCountry).map(([cc, names]) =>
    `  - name: VPNGate-${cc}
    type: select
    proxies:
${p(names)}`
  ).join("\n\n");

  // 整理叶子节点：供 ♻️ 自动选择 与 🔄 故障转移 使用（绝不包含策略组名）
  // 核心保护：Proton 官方免费凭据严格限制单设备会话，绝不塞进后台频繁轮询的自动测速组，防止客户端后台频繁踢线导致崩溃
  const leafProxies = [];
  for (const tags of Object.values(byLoc)) {
    leafProxies.push(...tags);
  }
  if (windNames.length) leafProxies.push(...windNames);
  if (vgNames.length) leafProxies.push(...vgNames);
  if (enableWarpDirect) leafProxies.push(...entries);
  if (leafProxies.length === 0) leafProxies.push(...entries);

  // 整理 🚀 节点选择 包含的组与直连：Proton 与 VPNGate 相关仅保留国家/地区策略组
  const picks = [];
  if (locNames.length) picks.push(...locNames);
  if (enableWarpDirect) picks.push("WARP直连");
  if (protonNames.length) picks.push(...protonCCNames);
  if (windNames.length) picks.push("Windscribe线路", ...windLocNames);
  if (vgNames.length) picks.push(...vgCCNames);

  const { prov, rules } = buildRules(directIps);

  const yaml = `# Opera VPN over Cloudflare WARP (${protocolMode.toUpperCase()})
# 由 Cloudflare Worker 生成于 ${new Date().toISOString()}

${head(true)}

proxies:
${proxies.join("\n")}

proxy-groups:
  - name: 🚀 节点选择
    type: select
    proxies:
      - ♻️ 自动选择
${p(picks)}
      - 🔄 故障转移

  - name: ♻️ 自动选择
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    lazy: true
    proxies:
${q(leafProxies)}

  - name: 🔄 故障转移
    type: fallback
    url: http://www.gstatic.com/generate_204
    interval: 180
    lazy: true
    proxies:
${q(leafProxies)}

${locDefs}

${enableWarpDirect ? `  - name: WARP直连
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    lazy: true
    proxies:
${q(entries)}
` : ""}${protonNames.length ? `
${protonCCDefs}
` : ""}${windNames.length ? `
  - name: Windscribe线路
    type: select
    proxies:
      - WS-自动
${p(windLocNames)}

  - name: WS-自动
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 80
    lazy: true
    proxies:
${q(windNames)}

${windLocDefs}
` : ""}${vgNames.length ? `
${vgCCDefs}
` : ""}
${tailGroups(picks)}

rule-providers:
${prov}

rules:
${rules}
  - GEOIP,LAN,🎯 全球直连,no-resolve
  - GEOIP,CN,🎯 全球直连
  - MATCH,🐟 漏网之鱼
`;

  const operaCombos = combos;
  const protonCombos = protonNames.length;
  const windCombos = windNames.length;
  const vpngateCombos = vgNames.length;
  const totalCombos = operaCombos + protonCombos + windCombos + vpngateCombos;

  return {
    yaml,
    protocolMode,
    entries: entries.length,
    wgEntries: protocolMode === "wg" ? entries.length : 0,
    msEntries: protocolMode === "masque" ? entries.length : 0,
    landings: (enableOpera && opera?.landings) ? opera.landings.length : 0,
    combos,
    totalCombos,
    proton: protonCombos,
    wind: windCombos,
    vpngate: vpngateCombos,
    protonServers: targetProtonServers.length,
    windServers: (enableWind && wind?.servers) ? wind.servers.length : 0,
    vpngateServers: targetVgServers.length,
    enableOpera,
    enableProton,
    enableWarpDirect,
    enableWind,
    enableVpnGate,
  };
}
