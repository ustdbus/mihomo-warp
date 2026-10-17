// VPN Gate (筑波大学学术开源项目) 节点抓取与 OpenVPN 解析
// 移植自 sout 项目 (sout/cmd/sout-server/vpngate.go)

const VPNGATE_DIRECT = "https://www.vpngate.net/api/iphone/";
const VPNGATE_MIRROR = "https://p.xy.kg/vpngate";
const MIRROR_KEY = "8rhIFzFKRJMFAe-xP5OQPclDEvSjKlHo";

export function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return "🌐";
  try {
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map((c) => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  } catch {
    return "🌐";
  }
}

export const COUNTRY_FLAG_MAP = {
  "日本": "🇯🇵",
  "韩国": "🇰🇷",
  "美国": "🇺🇸",
  "新加坡": "🇸🇬",
  "泰国": "🇹🇭",
  "台湾": "🇹🇼",
  "香港": "🇭🇰",
  "英国": "🇬🇧",
  "德国": "🇩🇪",
  "法国": "🇫🇷",
  "加拿大": "🇨🇦",
  "澳大利亚": "🇦🇺",
  "俄罗斯": "🇷🇺",
  "越南": "🇻🇳",
  "菲律宾": "🇵🇭",
  "马来西亚": "🇲🇾",
  "印度": "🇮🇳",
  "克罗地亚": "🇭🇷",
  "巴西": "🇧🇷",
};

export const COUNTRY_NAME_MAP = {
  JP: "日本",
  KR: "韩国",
  US: "美国",
  SG: "新加坡",
  TH: "泰国",
  TW: "台湾",
  HK: "香港",
  GB: "英国",
  DE: "德国",
  FR: "法国",
  CA: "加拿大",
  AU: "澳大利亚",
  RU: "俄罗斯",
  VN: "越南",
  PH: "菲律宾",
  MY: "马来西亚",
  ID: "印尼",
  IN: "印度",
  HR: "克罗地亚",
  BR: "巴西",
  NL: "荷兰",
  CH: "瑞士",
  UA: "乌克兰",
  IT: "意大利",
  ES: "西班牙",
  MX: "墨西哥",
  SE: "瑞典",
  NO: "挪威",
  PL: "波兰",
  RO: "罗马尼亚",
  TR: "土耳其",
  AR: "阿根廷",
  CL: "智利",
  CO: "哥伦比亚",
  ZA: "南非",
  NZ: "新西兰",
};

/**
 * 从 VPN Gate CSV 文本中解析出合格的 OpenVPN 节点列表
 */
export function parseVpnGateCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => {
    const t = l.trim();
    return t && !t.startsWith("*");
  });

  if (lines.length < 2) {
    throw new Error("VPN Gate 数据行不足");
  }

  const header = lines[0].replace(/^#/, "").split(",").map((s) => s.trim());
  const idxB64 = header.indexOf("OpenVPN_ConfigData_Base64");
  const idxCountry = header.indexOf("CountryLong");
  const idxCC = header.indexOf("CountryShort");
  const idxIP = header.indexOf("IP");
  const idxSpeed = header.indexOf("Speed");
  const idxPing = header.indexOf("Ping");
  const idxHost = header.indexOf("HostName");

  if (idxB64 === -1 || idxIP === -1) {
    throw new Error("VPN Gate 数据缺少必要字段");
  }

  const nodes = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row || !row.includes(",")) continue;

    const parts = row.split(",");
    if (parts.length <= idxB64) continue;

    const b64 = parts[idxB64]?.trim();
    const ip = parts[idxIP]?.trim();
    if (!b64 || !ip) continue;

    let ovpn;
    try {
      ovpn = atob(b64);
    } catch {
      continue;
    }

    // 提取 remote 和 proto
    const remoteMatch = ovpn.match(/^remote\s+(\S+)\s+(\d+)/m);
    const protoMatch = ovpn.match(/^proto\s+(\S+)/m);
    const cipherMatch = ovpn.match(/^cipher\s+(\S+)/m);
    const authMatch = ovpn.match(/^auth\s+(\S+)/m);

    const caMatch = ovpn.match(/<ca>([\s\S]*?)<\/ca>/);
    const certMatch = ovpn.match(/<cert>([\s\S]*?)<\/cert>/);
    const keyMatch = ovpn.match(/<key>([\s\S]*?)<\/key>/);

    if (!caMatch || !certMatch || !keyMatch) continue;

    const port = remoteMatch ? parseInt(remoteMatch[2], 10) : 443;
    const proto = (protoMatch ? protoMatch[1].toLowerCase() : "udp").startsWith("tcp") ? "tcp" : "udp";
    const cipher = cipherMatch ? cipherMatch[1].trim() : "AES-128-CBC";
    const auth = authMatch ? authMatch[1].trim() : "SHA1";

    const cc = (parts[idxCC] || "").trim().toUpperCase();
    const countryLong = (parts[idxCountry] || "").trim();
    const cleanLong = countryLong.replace(/\s*\([^)]*\)/g, "").trim();
    const countryZh = COUNTRY_NAME_MAP[cc] || COUNTRY_NAME_MAP[cleanLong.toUpperCase()] || cleanLong || "其他";
    const speed = parseInt(parts[idxSpeed] || "0", 10);
    const ping = parseInt(parts[idxPing] || "0", 10);
    const host = (parts[idxHost] || "").trim();

    nodes.push({
      host,
      ip,
      port,
      proto,
      cc,
      country: countryZh,
      countryZh,
      countryRaw: countryLong,
      speed,
      ping,
      cipher,
      auth,
      ca: caMatch[1].trim(),
      cert: certMatch[1].trim(),
      key: keyMatch[1].trim(),
    });
  }

  // 按带宽降序排列
  nodes.sort((a, b) => b.speed - a.speed);
  return nodes;
}

/**
 * 获取并整理 VPN Gate 节点数据
 */
export async function fetchVpnGate() {
  let csvText = null;
  let lastErr = null;

  // 1. 优先尝试直连官方 API (Worker 在海外网络环境下直连通常极快)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4500);
    const res = await fetch(VPNGATE_DIRECT, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });
    clearTimeout(timer);
    if (res.ok) {
      const text = await res.text();
      if (text.includes("OpenVPN_ConfigData_Base64")) {
        csvText = text;
      }
    }
  } catch (e) {
    lastErr = e;
  }

  // 2. 直连超时或失败则切换反代镜像 (参考 sout/cmd/sout-server/vpngate.go)
  if (!csvText) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(VPNGATE_MIRROR, {
        signal: ctrl.signal,
        headers: {
          "X-Fanout-Key": MIRROR_KEY,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      });
      clearTimeout(timer);
      if (res.ok) {
        const text = await res.text();
        if (text.includes("OpenVPN_ConfigData_Base64")) {
          csvText = text;
        }
      }
    } catch (e) {
      lastErr = e;
    }
  }

  if (!csvText) {
    throw new Error("拉取 VPN Gate 列表失败: " + (lastErr ? lastErr.message : "未知错误"));
  }

  const allNodes = parseVpnGateCSV(csvText);
  if (!allNodes.length) {
    throw new Error("VPN Gate 列表无可用有效节点");
  }

  // 统计每个国家的真实总节点列表（已按速度降序排列）
  const allByCountry = {};
  for (const n of allNodes) {
    const reg = n.country;
    (allByCountry[reg] = allByCountry[reg] || []).push(n);
  }

  const servers = [];
  const regionsSummary = {};

  for (const [reg, allList] of Object.entries(allByCountry)) {
    // 每个国家按测速最高优选 1 台顶级落地出口（对应生成 20 个套娃节点）
    const best = allList[0];
    const cc = best?.cc || "";
    const flag = COUNTRY_FLAG_MAP[reg] || getFlagEmoji(cc);

    regionsSummary[reg] = {
      country: reg,
      cc,
      flag,
      count: allList.length,        // 该国可用节点总数（如日本 58 台）
      totalCount: allList.length,
      selectedCount: 1,             // 优选出口台数（1台）
      maxSpeedMbps: +(best?.speed / 1e6 || 0).toFixed(1),
    };

    servers.push({
      name: `VG-${reg}`,
      country: reg,
      cc: best.cc,
      ip: best.ip,
      port: best.port,
      proto: best.proto,
      speedMbps: +(best.speed / 1e6).toFixed(1),
      ping: best.ping,
      cipher: best.cipher,
      auth: best.auth,
      ca: best.ca,
      cert: best.cert,
      key: best.key,
    });
  }

  return {
    servers,
    regions: regionsSummary,
    totalParsed: allNodes.length,
    fetchedAt: new Date().toISOString(),
  };
}
