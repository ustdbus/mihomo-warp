// Opera VPN over Cloudflare WARP (MASQUE) —— 单文件版\n// 由 src/ 打包而成，网页部署用。改代码请改 src/ 后重新 npm run build。\n// 仓库 https://github.com/byJoey/warp-masque-actions\n

// src/warp.js
var API = "https://api.cloudflareclient.com/v0a4471";
var H = {
  "User-Agent": "WARP for Android",
  "CF-Client-Version": "a-6.35-4471",
  "Content-Type": "application/json; charset=UTF-8"
};
var b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
function randB64(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a));
}
function randHex(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function cfTime() {
  return (/* @__PURE__ */ new Date()).toISOString().replace("Z", "+00:00");
}
async function registerWireGuard(deviceName = "cf-worker") {
  const xkp = await crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveKey", "deriveBits"]
  );
  const wgPubRaw = await crypto.subtle.exportKey("raw", xkp.publicKey);
  const wgPub = b64(wgPubRaw);
  const wgPkcs8 = await crypto.subtle.exportKey("pkcs8", xkp.privateKey);
  const wgPriv = b64(new Uint8Array(wgPkcs8).slice(-32));
  const reg = await fetch(`${API}/reg`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      key: wgPub,
      install_id: "",
      fcm_token: "",
      tos: cfTime(),
      model: "PC",
      serial_number: randHex(8),
      os_version: "",
      key_type: "curve25519",
      tunnel_type: "wireguard",
      locale: "en-US"
    })
  });
  if (!reg.ok) {
    throw new Error(`WARP WireGuard\u6CE8\u518C\u5931\u8D25 ${reg.status}: ${(await reg.text()).slice(0, 200)}`);
  }
  const acc = await reg.json();
  let reserved = [0, 0, 0];
  if (acc.config?.client_id) {
    try {
      const rawCid = atob(acc.config.client_id);
      reserved = [...rawCid].map((c) => c.charCodeAt(0));
    } catch (_) {
    }
  }
  const wgPeerPub = acc.config?.peers?.[0]?.public_key || "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=";
  return {
    protocol: "wg",
    deviceId: acc.id,
    token: acc.token,
    privateKey: wgPriv,
    peerPublicKey: wgPeerPub,
    reserved,
    ipv4: acc.config?.interface?.addresses?.v4 || "172.16.0.2",
    ipv6: acc.config?.interface?.addresses?.v6 || "2606:4700:110:8ea3:8c9c:bede:a871:1963",
    registeredAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function registerMasque(deviceName = "cf-worker") {
  const reg = await fetch(`${API}/reg`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      key: randB64(32),
      install_id: "",
      fcm_token: "",
      tos: cfTime(),
      model: "PC",
      serial_number: randHex(8),
      os_version: "",
      key_type: "curve25519",
      tunnel_type: "wireguard",
      locale: "en-US"
    })
  });
  if (!reg.ok) {
    throw new Error(`WARP \u6CE8\u518C\u5931\u8D25 ${reg.status}: ${(await reg.text()).slice(0, 200)}`);
  }
  const acc = await reg.json();
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const spki = b64(await crypto.subtle.exportKey("spki", kp.publicKey));
  const pkcs8 = b64(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const sec1 = pkcs8ToSec1(pkcs8);
  const patch = await fetch(`${API}/reg/${acc.id}`, {
    method: "PATCH",
    headers: { ...H, Authorization: `Bearer ${acc.token}` },
    body: JSON.stringify({
      key: spki,
      key_type: "secp256r1",
      tunnel_type: "masque",
      name: deviceName
    })
  });
  if (!patch.ok) {
    throw new Error(`MASQUE enroll \u5931\u8D25 ${patch.status}: ${(await patch.text()).slice(0, 200)}`);
  }
  const up = await patch.json();
  const pem = up.config?.peers?.[0]?.public_key || "";
  const peerPub = pem.includes("-----") ? pem.split("\n").filter((l) => l && !l.startsWith("-----")).join("") : pem;
  return {
    protocol: "masque",
    deviceId: acc.id,
    token: acc.token,
    privateKey: sec1,
    peerPublicKey: peerPub,
    ipv4: up.config?.interface?.addresses?.v4 || acc.config?.interface?.addresses?.v4 || "172.16.0.2",
    ipv6: up.config?.interface?.addresses?.v6 || acc.config?.interface?.addresses?.v6 || "2606:4700:110:8ea3:8c9c:bede:a871:1963",
    registeredAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function registerWarp(protocol = "wg", deviceName = "cf-worker") {
  if (protocol === "masque") {
    return registerMasque(deviceName);
  }
  return registerWireGuard(deviceName);
}
function pkcs8ToSec1(b64pkcs8) {
  const der = Uint8Array.from(atob(b64pkcs8), (c) => c.charCodeAt(0));
  const tlv = (pos) => {
    const tag2 = der[pos];
    let len2 = der[pos + 1];
    let p2 = pos + 2;
    if (len2 & 128) {
      const n = len2 & 127;
      len2 = 0;
      for (let k = 0; k < n; k++) len2 = len2 << 8 | der[p2 + k];
      p2 += n;
    }
    return [tag2, p2, len2, p2 + len2];
  };
  let i = tlv(0)[1];
  i = tlv(i)[3];
  i = tlv(i)[3];
  const [tag, start, len] = tlv(i);
  if (tag !== 4) throw new Error("PKCS8 \u7ED3\u6784\u4E0D\u7B26\u5408\u9884\u671F");
  const inner = der.subarray(start, start + len);
  let j = tlv2(inner, 0)[1];
  j = tlv2(inner, j)[3];
  const [ptag, pstart, plen] = tlv2(inner, j);
  if (ptag !== 4) throw new Error("SEC1 \u7ED3\u6784\u4E0D\u7B26\u5408\u9884\u671F");
  const rawKey = inner.subarray(pstart, pstart + plen);
  const oid = [6, 8, 42, 134, 72, 206, 61, 3, 1, 7];
  const body = [
    2,
    1,
    1,
    // version = 1
    4,
    rawKey.length,
    ...rawKey,
    // privateKey
    160,
    oid.length,
    ...oid
    // [0] namedCurve
  ];
  const out = [48, ...derLen(body.length), ...body];
  return btoa(String.fromCharCode(...out));
}
function tlv2(buf, pos) {
  const tag = buf[pos];
  let len = buf[pos + 1];
  let p2 = pos + 2;
  if (len & 128) {
    const n = len & 127;
    len = 0;
    for (let k = 0; k < n; k++) len = len << 8 | buf[p2 + k];
    p2 += n;
  }
  return [tag, p2, len, p2 + len];
}
function derLen(n) {
  if (n < 128) return [n];
  if (n < 256) return [129, n];
  return [130, n >> 8, n & 255];
}

// src/md5.js
function md5Hex(str) {
  const msg = new TextEncoder().encode(str);
  const S = [
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21
  ];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  const len = msg.length;
  const withOne = len + 1;
  const padLen = withOne + 8 + 63 & ~63;
  const buf = new Uint8Array(padLen);
  buf.set(msg);
  buf[len] = 128;
  const dv = new DataView(buf.buffer);
  dv.setUint32(padLen - 8, len << 3 >>> 0, true);
  dv.setUint32(padLen - 4, Math.floor(len / 536870912), true);
  let a0 = 1732584193, b0 = 4023233417, c0 = 2562383102, d0 = 271733878;
  const rol = (x, c) => x << c | x >>> 32 - c;
  for (let off = 0; off < padLen; off += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) {
        F = B & C | ~B & D;
        g = i;
      } else if (i < 32) {
        F = D & B | ~D & C;
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = 7 * i % 16;
      }
      F = F + A + K[i] + M[g] >>> 0;
      A = D;
      D = C;
      C = B;
      B = B + rol(F, S[i]) >>> 0;
    }
    a0 = a0 + A >>> 0;
    b0 = b0 + B >>> 0;
    c0 = c0 + C >>> 0;
    d0 = d0 + D >>> 0;
  }
  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, a0, true);
  odv.setUint32(4, b0, true);
  odv.setUint32(8, c0, true);
  odv.setUint32(12, d0, true);
  return [...out].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// src/opera.js
var EP = "https://api2.sec-tunnel.com/v4";
var API_USER = "se0316";
var API_PASS = "SILrMEPBmJuhomxWkfm3JalqHX2Eheg1YhlEZiMh8II";
var CLIENT_TYPE = "se0316";
var H2 = {
  "SE-Client-Version": "Stable 114.0.5282.21",
  "SE-Operating-System": "Windows",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/114.0.0.0",
  "Content-Type": "application/x-www-form-urlencoded",
  "Accept": "application/json"
};
var REGIONS = { AS: "\u4E9A\u6D32", EU: "\u6B27\u6D32", AM: "\u7F8E\u6D32" };
async function digestHash(algo, s) {
  if (/^md5$/i.test(algo)) return md5Hex(s);
  const name = /512/.test(algo) ? "SHA-512" : "SHA-256";
  const d = await crypto.subtle.digest(name, new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha1Upper(s) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function randHex2(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
var Session = class {
  constructor() {
    this.jar = "";
  }
  _absorb(r) {
    const sc = r.headers.getSetCookie?.() || [];
    if (sc.length) this.jar = sc.map((c) => c.split(";")[0]).join("; ");
  }
  async rpc(path, params) {
    const url = `${EP}/${path}`;
    const body = new URLSearchParams(params).toString();
    const base = () => ({ ...H2, ...this.jar ? { Cookie: this.jar } : {} });
    let r = await fetch(url, { method: "POST", headers: base(), body });
    if (r.status === 401) {
      const wa = r.headers.get("www-authenticate") || "";
      const g = (k) => (wa.match(new RegExp(`${k}="([^"]*)"`)) || [])[1] || "";
      const realm = g("realm"), nonce = g("nonce"), qop = g("qop"), opaque = g("opaque");
      const algo = g("algorithm") || (wa.match(/algorithm=([\w-]+)/) || [])[1] || "MD5";
      const uri = new URL(url).pathname;
      const cnonce = randHex2(8), nc = "00000001";
      const H1 = await digestHash(algo, `${API_USER}:${realm}:${API_PASS}`);
      const H22 = await digestHash(algo, `POST:${uri}`);
      const q2 = qop ? qop.split(",")[0].trim() : "";
      const resp = q2 ? await digestHash(algo, `${H1}:${nonce}:${nc}:${cnonce}:${q2}:${H22}`) : await digestHash(algo, `${H1}:${nonce}:${H22}`);
      let a = `Digest username="${API_USER}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${resp}", algorithm=${algo}`;
      if (q2) a += `, qop=${q2}, nc=${nc}, cnonce="${cnonce}"`;
      if (opaque) a += `, opaque="${opaque}"`;
      this._absorb(r);
      r = await fetch(url, {
        method: "POST",
        headers: { ...base(), Authorization: a },
        body
      });
    }
    this._absorb(r);
    if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
    const j = await r.json();
    if (j.status && j.status.code !== 0) {
      throw new Error(`${path} code=${j.status.code} ${j.status.message || ""}`);
    }
    return j;
  }
};
async function fetchOpera() {
  const s = new Session();
  const email = `${randHex2(10)}@${CLIENT_TYPE}.best.vpn`;
  await s.rpc("register_subscriber", { email, password: await sha1Upper(email) });
  const dev = await s.rpc("register_device", {
    client_type: CLIENT_TYPE,
    device_hash: randHex2(20).toUpperCase(),
    device_name: "Opera-Browser-Client"
  });
  const deviceId = dev.data.device_id;
  const idHash = await sha1Upper(deviceId);
  const gp = await s.rpc("device_generate_password", { device_id: deviceId });
  const password = gp.data.device_password;
  const landings = [];
  for (const [code, loc] of Object.entries(REGIONS)) {
    let disc;
    try {
      disc = await s.rpc("discover", { serial_no: idHash, requested_geo: code });
    } catch {
      continue;
    }
    let seq = 0;
    for (const x of disc.data.ips || []) {
      seq += 1;
      landings.push({
        tag: `${loc}${seq}`,
        loc,
        ip: x.ip,
        port: x.port && x.port[0] || 443,
        host: `${code.toLowerCase()}${seq - 1}.sec-tunnel.com`
      });
    }
  }
  return { username: idHash, password, landings, fetchedAt: (/* @__PURE__ */ new Date()).toISOString() };
}

// src/config.js
var AWG_OPTIMIZED_ENDPOINTS = [
  { ip: "188.114.99.214", port: 4500, tag: "AWG-\u4E1C\u4EAC1" },
  { ip: "188.114.98.171", port: 2408, tag: "AWG-\u4E1C\u4EAC2" },
  { ip: "188.114.97.25", port: 1701, tag: "AWG-\u4E1C\u4EAC3" },
  { ip: "188.114.99.171", port: 2408, tag: "AWG-\u4E1C\u4EAC4" },
  { ip: "188.114.97.9", port: 4500, tag: "AWG-\u4E1C\u4EAC5" },
  { ip: "188.114.99.99", port: 4500, tag: "AWG-\u4E1C\u4EAC6" },
  { ip: "188.114.97.214", port: 2408, tag: "AWG-\u4E1C\u4EAC7" },
  { ip: "188.114.96.99", port: 500, tag: "AWG-\u4E1C\u4EAC8" },
  { ip: "188.114.96.15", port: 1701, tag: "AWG-\u9999\u6E2F1" },
  { ip: "188.114.99.20", port: 4500, tag: "AWG-\u9999\u6E2F2" },
  { ip: "188.114.96.171", port: 4500, tag: "AWG-\u9999\u6E2F3" },
  { ip: "188.114.97.128", port: 4500, tag: "AWG-\u9999\u6E2F4" },
  { ip: "188.114.99.7", port: 500, tag: "AWG-\u9999\u6E2F5" },
  { ip: "188.114.98.70", port: 1701, tag: "AWG-\u9999\u6E2F6" },
  { ip: "188.114.99.9", port: 4500, tag: "AWG-\u65B0\u52A0\u57611" },
  { ip: "188.114.97.70", port: 500, tag: "AWG-\u65B0\u52A0\u57612" },
  { ip: "188.114.97.99", port: 1701, tag: "AWG-\u65B0\u52A0\u57613" },
  { ip: "188.114.96.8", port: 4500, tag: "AWG-\u65B0\u52A0\u57614" },
  { ip: "188.114.96.6", port: 1701, tag: "AWG-\u65B0\u52A0\u57615" },
  { ip: "188.114.99.25", port: 4500, tag: "AWG-\u65B0\u52A0\u57616" }
];
var V4 = ["162.159.198.1", "162.159.198.2", "162.159.199.1", "162.159.199.2"];
var V6 = [
  "2606:4700:103::1",
  "2606:4700:103::2",
  "2606:4700:104::1",
  "2606:4700:104::2"
];
var PORTS = [443, 500, 1701, 4500, 4443, 8443, 8095];
var OFFICIAL_SNI = "zt-masque.cloudflareclient.com";
var SNI_NODE = ["162.159.198.1", 443];
var RS = "https://raw.githubusercontent.com";
var RULESETS = [
  ["\u{1F3AF} \u5168\u7403\u76F4\u8FDE", RS + "/cmliu/ACL4SSR/refs/heads/main/Clash/CFnat.list"],
  ["\u{1F3AF} \u5168\u7403\u76F4\u8FDE", RS + "/ACL4SSR/ACL4SSR/master/Clash/LocalAreaNetwork.list"],
  ["\u{1F3AF} \u5168\u7403\u76F4\u8FDE", RS + "/ACL4SSR/ACL4SSR/master/Clash/UnBan.list"],
  ["\u{1F6D1} \u5168\u7403\u62E6\u622A", RS + "/ACL4SSR/ACL4SSR/master/Clash/BanAD.list"],
  ["\u{1F343} \u5E94\u7528\u51C0\u5316", RS + "/ACL4SSR/ACL4SSR/master/Clash/BanProgramAD.list"],
  ["\u{1F343} \u5E94\u7528\u51C0\u5316", RS + "/cmliu/ACL4SSR/main/Clash/adobe.list"],
  ["\u{1F343} \u5E94\u7528\u51C0\u5316", RS + "/cmliu/ACL4SSR/main/Clash/IDM.list"],
  ["\u{1F4E2} \u8C37\u6B4CFCM", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/GoogleFCM.list"],
  ["\u{1F3AF} \u5168\u7403\u76F4\u8FDE", RS + "/ACL4SSR/ACL4SSR/master/Clash/GoogleCN.list"],
  ["\u{1F3AF} \u5168\u7403\u76F4\u8FDE", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/SteamCN.list"],
  ["\u24C2\uFE0F \u5FAE\u8F6F\u670D\u52A1", RS + "/ACL4SSR/ACL4SSR/master/Clash/Microsoft.list"],
  ["\u{1F34E} \u82F9\u679C\u670D\u52A1", RS + "/ACL4SSR/ACL4SSR/master/Clash/Apple.list"],
  ["\u{1F4F2} \u7535\u62A5\u4FE1\u606F", RS + "/ACL4SSR/ACL4SSR/master/Clash/Telegram.list"],
  ["\u{1F916} AI\u670D\u52A1", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/OpenAi.list"],
  ["\u{1F916} AI\u670D\u52A1", RS + "/juewuy/ShellClash/master/rules/ai.list"],
  ["\u{1F916} AI\u670D\u52A1", RS + "/cmliu/ACL4SSR/main/Clash/Copilot.list"],
  ["\u{1F916} AI\u670D\u52A1", RS + "/cmliu/ACL4SSR/main/Clash/GithubCopilot.list"],
  ["\u{1F916} AI\u670D\u52A1", RS + "/cmliu/ACL4SSR/main/Clash/Claude.list"],
  ["\u{1F916} AI\u670D\u52A1", RS + "/cmliu/ACL4SSR/main/Clash/Gemini.list"],
  ["\u{1F4F9} \u6CB9\u7BA1\u89C6\u9891", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/YouTube.list"],
  ["\u{1F3A5} \u5948\u98DE\u89C6\u9891", RS + "/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Netflix.list"],
  ["\u{1F30D} \u56FD\u5916\u5A92\u4F53", RS + "/ACL4SSR/ACL4SSR/master/Clash/ProxyMedia.list"],
  ["\u{1F30D} \u56FD\u5916\u5A92\u4F53", RS + "/cmliu/ACL4SSR/main/Clash/Emby.list"],
  ["\u{1F680} \u8282\u70B9\u9009\u62E9", RS + "/ACL4SSR/ACL4SSR/master/Clash/ProxyLite.list"],
  ["\u{1F680} \u8282\u70B9\u9009\u62E9", RS + "/cmliu/ACL4SSR/main/Clash/CMBlog.list"],
  ["\u{1F3AF} \u5168\u7403\u76F4\u8FDE", RS + "/ACL4SSR/ACL4SSR/master/Clash/ChinaDomain.list"],
  ["\u{1F3AF} \u5168\u7403\u76F4\u8FDE", RS + "/ACL4SSR/ACL4SSR/master/Clash/ChinaCompanyIp.list"]
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
  const extra = sni ? `
    sni: ${sni}` : "";
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
function parseCustomEndpoints(raw, prefix = "AWG") {
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
      const p2 = parseInt(target.slice(lastColon + 1), 10);
      if (!isNaN(p2) && p2 > 0 && p2 <= 65535) {
        port = p2;
        ip = target.slice(0, lastColon).replace(/^\[|\]$/g, "").trim();
      }
    }
    if (ip) {
      const tag = customTag ? `${prefix}-${customTag.trim()}` : `${prefix}-\u81EA\u9009-${ip}:${port}`;
      result.push({ ip, port, tag });
    }
  }
  return result;
}
function buildAwgEntries(warp, customEndpoints = null) {
  if (!warp) return { awgEntries: [], awgProxies: [], awgIps: [] };
  const priv = warp.privateKey;
  const pub = warp.peerPublicKey || "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=";
  const res = warp.reserved || [13, 86, 243];
  const v4 = warp.ipv4 || "172.16.0.2";
  const v6 = warp.ipv6 || "2606:4700:110:8ea3:8c9c:bede:a871:1963";
  const endpoints = customEndpoints && customEndpoints.length > 0 ? customEndpoints : AWG_OPTIMIZED_ENDPOINTS;
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
  entries.push("\u5B98\u65B9\u57DF\u540D");
  v4Entries.push("\u5B98\u65B9\u57DF\u540D");
  ips.push(SNI_NODE[0]);
  proxies.push(masqueNode(
    "\u5B98\u65B9\u57DF\u540D",
    SNI_NODE[0],
    SNI_NODE[1],
    priv,
    pub,
    v4,
    v6,
    OFFICIAL_SNI
  ));
  return { entries, proxies, v4Entries, ips };
}
var AI_DOMAINS = [
  "openai.fm",
  "operator.chatgpt.com",
  "chat.com",
  "anthropic.com",
  "claude.ai",
  "claudeusercontent.com",
  "gemini.google.com",
  "aistudio.google.com",
  "generativelanguage.googleapis.com",
  "notebooklm.google.com",
  "notebooklm.google",
  "labs.google",
  "deepmind.com",
  "x.ai",
  "grok.com",
  "meta.ai",
  "perplexity.ai",
  "pplx.ai",
  "perplexity.com",
  "mistral.ai",
  "chat.mistral.ai",
  "cohere.com",
  "cohere.ai",
  "ai21.com",
  "together.ai",
  "together.xyz",
  "fireworks.ai",
  "groq.com",
  "huggingface.co",
  "hf.co",
  "huggingface.js.org",
  "replicate.com",
  "replicate.delivery",
  "runpod.io",
  "modal.com",
  "openrouter.ai",
  "poe.com",
  "quora.com",
  "cursor.com",
  "cursor.sh",
  "codeium.com",
  "windsurf.com",
  "tabnine.com",
  "sourcegraph.com",
  "phind.com",
  "v0.dev",
  "v0.app",
  "bolt.new",
  "lovable.dev",
  "devin.ai",
  "cognition.ai",
  "midjourney.com",
  "stability.ai",
  "stablediffusionweb.com",
  "leonardo.ai",
  "runwayml.com",
  "pika.art",
  "lumalabs.ai",
  "ideogram.ai",
  "recraft.ai",
  "krea.ai",
  "civitai.com",
  "elevenlabs.io",
  "eleven-labs.com",
  "play.ht",
  "suno.com",
  "suno.ai",
  "udio.com",
  "assemblyai.com",
  "deepgram.com",
  "you.com",
  "kagi.com",
  "exa.ai",
  "tavily.com",
  "jasper.ai",
  "copy.ai",
  "writesonic.com",
  "notion.so",
  "langchain.com",
  "langsmith.com",
  "wandb.ai",
  "weightsandbiases.com",
  "pinecone.io",
  "weaviate.io",
  "qdrant.tech",
  "chromadb.com",
  "deepseek.com",
  "moonshot.cn",
  "moonshotai.com",
  "kimi.com",
  "bigmodel.cn",
  "zhipuai.cn",
  "z.ai",
  "minimaxi.com",
  "minimax.io",
  "hailuoai.com",
  "siliconflow.cn",
  "dashscope.aliyuncs.com"
];
var q = (a, n = 6) => a.map((x) => " ".repeat(n) + `- "${x}"`).join("\n");
var p = (a, n = 6) => a.map((x) => " ".repeat(n) + `- ${x}`).join("\n");
function buildRules(directIps = []) {
  const prov = [], rules = [];
  const uniqueIps = [...new Set(directIps.filter(Boolean))];
  for (const ip of uniqueIps) {
    const cleanIp = ip.replace(/^\[|\]$/g, "").trim();
    if (cleanIp) {
      const cidr = cleanIp.includes(":") ? `${cleanIp}/128` : `${cleanIp}/32`;
      rules.push(`  - IP-CIDR,${cidr},DIRECT,no-resolve`);
    }
  }
  const ai = AI_DOMAINS.map((d) => `  - DOMAIN-SUFFIX,${d},\u{1F916} AI\u670D\u52A1`);
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
  return `  - name: \u{1F4F9} \u6CB9\u7BA1\u89C6\u9891
    type: select
    proxies:
      - \u{1F680} \u8282\u70B9\u9009\u62E9
      - \u267B\uFE0F \u81EA\u52A8\u9009\u62E9
      - \u{1F504} \u6545\u969C\u8F6C\u79FB
${p(picks)}

  - name: \u{1F3A5} \u5948\u98DE\u89C6\u9891
    type: select
    proxies:
      - \u{1F680} \u8282\u70B9\u9009\u62E9
      - \u267B\uFE0F \u81EA\u52A8\u9009\u62E9
      - \u{1F504} \u6545\u969C\u8F6C\u79FB
${p(picks)}

  - name: \u{1F30D} \u56FD\u5916\u5A92\u4F53
    type: select
    proxies:
      - \u{1F680} \u8282\u70B9\u9009\u62E9
      - \u267B\uFE0F \u81EA\u52A8\u9009\u62E9
      - \u{1F504} \u6545\u969C\u8F6C\u79FB
      - \u{1F3AF} \u5168\u7403\u76F4\u8FDE

  - name: \u{1F4F2} \u7535\u62A5\u4FE1\u606F
    type: select
    proxies:
      - \u{1F680} \u8282\u70B9\u9009\u62E9
      - \u267B\uFE0F \u81EA\u52A8\u9009\u62E9
      - \u{1F3AF} \u5168\u7403\u76F4\u8FDE

  - name: \u{1F916} AI\u670D\u52A1
    type: select
    proxies:
      - \u{1F680} \u8282\u70B9\u9009\u62E9
      - \u267B\uFE0F \u81EA\u52A8\u9009\u62E9
      - \u{1F504} \u6545\u969C\u8F6C\u79FB
${p(picks)}

  - name: \u24C2\uFE0F \u5FAE\u8F6F\u670D\u52A1
    type: select
    proxies:
      - \u{1F3AF} \u5168\u7403\u76F4\u8FDE
      - \u{1F680} \u8282\u70B9\u9009\u62E9
      - \u267B\uFE0F \u81EA\u52A8\u9009\u62E9

  - name: \u{1F34E} \u82F9\u679C\u670D\u52A1
    type: select
    proxies:
      - \u{1F3AF} \u5168\u7403\u76F4\u8FDE
      - \u{1F680} \u8282\u70B9\u9009\u62E9
      - \u267B\uFE0F \u81EA\u52A8\u9009\u62E9

  - name: \u{1F4E2} \u8C37\u6B4CFCM
    type: select
    proxies:
      - \u{1F680} \u8282\u70B9\u9009\u62E9
      - \u{1F3AF} \u5168\u7403\u76F4\u8FDE
      - \u267B\uFE0F \u81EA\u52A8\u9009\u62E9

  - name: \u{1F3AF} \u5168\u7403\u76F4\u8FDE
    type: select
    proxies:
      - DIRECT

  - name: \u{1F6D1} \u5168\u7403\u62E6\u622A
    type: select
    proxies:
      - REJECT
      - DIRECT

  - name: \u{1F343} \u5E94\u7528\u51C0\u5316
    type: select
    proxies:
      - REJECT
      - DIRECT

  - name: \u{1F41F} \u6F0F\u7F51\u4E4B\u9C7C
    type: select
    proxies:
      - \u{1F680} \u8282\u70B9\u9009\u62E9
      - \u{1F3AF} \u5168\u7403\u76F4\u8FDE
      - \u267B\uFE0F \u81EA\u52A8\u9009\u62E9`;
}
var PROTON_CC_MAP = {
  JP: "\u65E5\u672C",
  SG: "\u65B0\u52A0\u5761",
  US: "\u7F8E\u56FD",
  CA: "\u52A0\u62FF\u5927",
  NL: "\u8377\u5170",
  CH: "\u745E\u58EB",
  PL: "\u6CE2\u5170",
  RO: "\u7F57\u9A6C\u5C3C\u4E9A",
  NO: "\u632A\u5A01",
  MX: "\u58A8\u897F\u54E5"
};
function getProtonRegion(srv) {
  if (srv.cc && PROTON_CC_MAP[srv.cc.toUpperCase()]) {
    return PROTON_CC_MAP[srv.cc.toUpperCase()];
  }
  const match = (srv.name || "").match(/^[\u4e00-\u9fa5]+/);
  if (match) return match[0];
  return (srv.name || "").replace(/\d+$/, "").trim();
}
function getProtonIndex(srv) {
  const match = (srv.name || "").match(/\d+$/);
  return match ? parseInt(match[0], 10) : 999;
}
var REGION_ORDER = [
  "\u65E5\u672C",
  "\u65B0\u52A0\u5761",
  "\u7F8E\u56FD",
  "\u52A0\u62FF\u5927",
  "\u8377\u5170",
  "\u745E\u58EB",
  "\u632A\u5A01",
  "\u6CE2\u5170",
  "\u7F57\u9A6C\u5C3C\u4E9A",
  "\u58A8\u897F\u54E5"
];
function buildConfig(warp, opera, proton, wind, options = {}) {
  const protocolMode = options.protocolMode === "wg" ? "wg" : options.protocolMode === "masque" ? "masque" : options.protocolMode ? options.protocolMode : "masque";
  const enableOpera = options.enableOpera !== false;
  const enableProton = options.enableProton !== false;
  const enableWarpDirect = options.enableWarpDirect !== false;
  const enableWind = options.enableWind !== false;
  const customWgEndpoints = options.customWgEndpoints || null;
  const customMsEndpoints = options.customMsEndpoints || null;
  const protonRegions = options.protonRegions || null;
  const protonServers = options.protonServers || null;
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
    directIps = [...res.ips || []];
  }
  const byLoc = {};
  if (enableOpera && opera && opera.landings && opera.landings.length) {
    for (const land of opera.landings) {
      for (const ent of entries) {
        const name = `${land.tag}@${ent}`;
        (byLoc[land.loc] ||= []).push(name);
        proxies.push(
          `  - {name: "${name}", type: http, server: ${land.ip}, port: ${land.port}, username: ${opera.username}, password: ${opera.password}, tls: true, sni: ${land.host}, skip-cert-verify: false, dialer-proxy: ${ent}}`
        );
      }
    }
  }
  const combos = Object.values(byLoc).reduce((a, b) => a + b.length, 0);
  let protonNames = [];
  const protonByServer = {};
  const protonByCC = {};
  const targetProtonServers = [];
  if (enableProton && proton && Array.isArray(proton.servers)) {
    if (Array.isArray(protonServers)) {
      const allowed = new Set(protonServers);
      for (const s of proton.servers) {
        const reg = getProtonRegion(s);
        const cc = (s.cc || "").toUpperCase();
        if (allowed.has(s.name) || allowed.has(s.ip) || allowed.has(reg) || allowed.has(cc)) {
          targetProtonServers.push(s);
        }
      }
    } else {
      const selectedRegions = Array.isArray(protonRegions) ? protonRegions : ["\u65E5\u672C", "\u65B0\u52A0\u5761"];
      for (const reg of selectedRegions) {
        const matched = proton.servers.filter((s) => {
          const r = getProtonRegion(s);
          const cc = (s.cc || "").toUpperCase();
          return r === reg || cc === reg.toUpperCase() || (s.name || "").includes(reg);
        });
        targetProtonServers.push(...matched);
      }
    }
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
          `  - {name: "${name}", type: http, server: ${srv.host}, port: ${srv.port}, username: ${wind.username}, password: ${wind.password}, tls: true, sni: ${srv.host}, skip-cert-verify: false, dialer-proxy: ${ent}}`
        );
      });
    }
  }
  const locNames = Object.keys(byLoc).map((l) => `${l}\u7EBF\u8DEF`);
  const locDefs = Object.entries(byLoc).map(([loc, tags]) => `  - name: ${loc}\u7EBF\u8DEF
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 80
    lazy: true
    proxies:
${q(tags)}`).join("\n\n");
  const serverGroupNames = Object.keys(protonByServer);
  const serverGroupDefs = Object.entries(protonByServer).map(
    ([srvName, names]) => `  - name: ${srvName}
    type: select
    proxies:
${p(names)}`
  ).join("\n\n");
  const protonCCNames = Object.keys(protonByCC).map((c) => `Proton-${c}`);
  const protonCCDefs = Object.entries(protonByCC).map(([cc, names]) => {
    const matchedServers = serverGroupNames.filter((s) => s.startsWith(cc));
    return `  - name: Proton-${cc}
    type: select
    proxies:
${p(matchedServers.length ? matchedServers : names)}`;
  }).join("\n\n");
  const windLocNames = Object.keys(windByLoc).map((l) => `WS-${l}`);
  const windLocDefs = Object.entries(windByLoc).map(([loc, names]) => `  - name: WS-${loc}
    type: url-test
    url: http://cp.cloudflare.com/generate_204
    interval: 300
    tolerance: 100
    lazy: true
    proxies:
${q(names)}`).join("\n\n");
  const leafProxies = [];
  for (const tags of Object.values(byLoc)) {
    leafProxies.push(...tags);
  }
  if (windNames.length) leafProxies.push(...windNames);
  if (enableWarpDirect) leafProxies.push(...entries);
  if (leafProxies.length === 0) leafProxies.push(...entries);
  const picks = [];
  if (locNames.length) picks.push(...locNames);
  if (enableWarpDirect) picks.push("WARP\u76F4\u8FDE");
  if (protonNames.length) picks.push("Proton\u7EBF\u8DEF", ...protonCCNames, ...serverGroupNames);
  if (windNames.length) picks.push("Windscribe\u7EBF\u8DEF", ...windLocNames);
  const { prov, rules } = buildRules(directIps);
  const yaml = `# Opera VPN over Cloudflare WARP (${protocolMode.toUpperCase()})
# \u7531 Cloudflare Worker \u751F\u6210\u4E8E ${(/* @__PURE__ */ new Date()).toISOString()}

${head(true)}

proxies:
${proxies.join("\n")}

proxy-groups:
  - name: \u{1F680} \u8282\u70B9\u9009\u62E9
    type: select
    proxies:
      - \u267B\uFE0F \u81EA\u52A8\u9009\u62E9
${p(picks)}
      - \u{1F504} \u6545\u969C\u8F6C\u79FB

  - name: \u267B\uFE0F \u81EA\u52A8\u9009\u62E9
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    lazy: true
    proxies:
${q(leafProxies)}

  - name: \u{1F504} \u6545\u969C\u8F6C\u79FB
    type: fallback
    url: http://www.gstatic.com/generate_204
    interval: 180
    lazy: true
    proxies:
${q(leafProxies)}

${locDefs}

${enableWarpDirect ? `  - name: WARP\u76F4\u8FDE
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    lazy: true
    proxies:
${q(entries)}
` : ""}${protonNames.length ? `
  - name: Proton\u7EBF\u8DEF
    type: select
    proxies:
${p(protonCCNames)}
${p(serverGroupNames)}

${protonCCDefs}

${serverGroupDefs}
` : ""}${windNames.length ? `
  - name: Windscribe\u7EBF\u8DEF
    type: select
    proxies:
      - WS-\u81EA\u52A8
${p(windLocNames)}

  - name: WS-\u81EA\u52A8
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 80
    lazy: true
    proxies:
${q(windNames)}

${windLocDefs}
` : ""}
${tailGroups(picks)}

rule-providers:
${prov}

rules:
${rules}
  - GEOIP,LAN,\u{1F3AF} \u5168\u7403\u76F4\u8FDE,no-resolve
  - GEOIP,CN,\u{1F3AF} \u5168\u7403\u76F4\u8FDE
  - MATCH,\u{1F41F} \u6F0F\u7F51\u4E4B\u9C7C
`;
  const operaCombos = combos;
  const protonCombos = protonNames.length;
  const windCombos = windNames.length;
  const totalCombos = operaCombos + protonCombos + windCombos;
  return {
    yaml,
    protocolMode,
    entries: entries.length,
    wgEntries: protocolMode === "wg" ? entries.length : 0,
    msEntries: protocolMode === "masque" ? entries.length : 0,
    landings: enableOpera && opera?.landings ? opera.landings.length : 0,
    combos,
    totalCombos,
    proton: protonCombos,
    wind: windCombos,
    protonServers: targetProtonServers.length,
    windServers: enableWind && wind?.servers ? wind.servers.length : 0,
    enableOpera,
    enableProton,
    enableWarpDirect,
    enableWind
  };
}

// src/proton.js
function parseBlob(text) {
  const raw = String(text || "").trim().replace(/\s+/g, "");
  if (!raw) throw new Error("\u5185\u5BB9\u4E3A\u7A7A");
  let obj;
  try {
    obj = JSON.parse(atob(raw));
  } catch {
    throw new Error("\u89E3\u6790\u5931\u8D25\uFF0C\u786E\u8BA4\u590D\u5236\u5B8C\u6574\u4E86\uFF08\u5E94\u8BE5\u662F\u4E00\u957F\u4E32\u5B57\u6BCD\u6570\u5B57\uFF0C\u6CA1\u6709\u6362\u884C\uFF09");
  }
  if (obj.v !== 1) throw new Error(`\u4E0D\u8BA4\u8BC6\u7684\u7248\u672C v${obj.v}\uFF0C\u6D41\u6C34\u7EBF\u548C Worker \u7248\u672C\u5BF9\u4E0D\u4E0A`);
  if (!obj.privateKey || !Array.isArray(obj.servers) || !obj.servers.length) {
    throw new Error("\u5185\u5BB9\u4E0D\u5B8C\u6574\uFF0C\u91CD\u8DD1\u4E00\u6B21\u6D41\u6C34\u7EBF");
  }
  if (obj.expiresAt && obj.expiresAt * 1e3 < Date.now()) {
    throw new Error("\u8FD9\u4EFD\u51ED\u636E\u5DF2\u7ECF\u8FC7\u671F\u4E86\uFF0C\u91CD\u8DD1\u6D41\u6C34\u7EBF\u62FF\u65B0\u7684");
  }
  return obj;
}

// src/windscribe.js
var CLIENT_AUTH_SECRET = "952b4412f002315aa50751032fcaab03";
var API2 = "https://api.windscribe.com";
var ASSETS = "https://assets.windscribe.com/serverlist";
var PROXY_PORT = 443;
var H3 = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.53 Safari/537.36",
  "Origin": "chrome-extension://hnmpcagpplmpfojmgmnngilcnanddlhb",
  "Accept": "application/json"
};
var CC = {
  "US-C": "\u7F8E\u56FD\u4E2D\u90E8",
  "US": "\u7F8E\u56FD\u4E1C\u90E8",
  "US-W": "\u7F8E\u56FD\u897F\u90E8",
  "CA": "\u52A0\u62FF\u5927\u4E1C\u90E8",
  "CA-W": "\u52A0\u62FF\u5927\u897F\u90E8",
  "FR": "\u6CD5\u56FD",
  "DE": "\u5FB7\u56FD",
  "NL": "\u8377\u5170",
  "NO": "\u632A\u5A01",
  "RO": "\u7F57\u9A6C\u5C3C\u4E9A",
  "CH": "\u745E\u58EB",
  "GB": "\u82F1\u56FD",
  "HK": "\u9999\u6E2F"
};
function authHash() {
  const t = Math.floor(Date.now() / 1e3);
  return { hash: md5Hex(CLIENT_AUTH_SECRET + String(t)), time: t };
}
async function call(url, init) {
  const r = await fetch(url, { ...init, headers: { ...H3, ...init?.headers || {} } });
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`\u54CD\u5E94\u4E0D\u662F JSON: ${text.slice(0, 120)}`);
  }
  if (!j.data) {
    const msg = (j.errorMessage || j.message || text).toString().slice(0, 160);
    throw new Error(`Windscribe ${r.status}: ${msg}`);
  }
  return j.data;
}
async function fetchCredentials(acc) {
  const { hash, time } = authHash();
  const q2 = new URLSearchParams({
    client_auth_hash: hash,
    session_auth_hash: acc.sessionAuthHash,
    time: String(time)
  });
  const d = await call(`${API2}/ServerCredentials?${q2}`);
  return { username: atob(d.username), password: atob(d.password) };
}
async function fetchSession(acc) {
  const { hash, time } = authHash();
  const q2 = new URLSearchParams({
    client_auth_hash: hash,
    session_auth_hash: acc.sessionAuthHash,
    time: String(time),
    session_type_id: "2"
  });
  const d = await call(`${API2}/Session?${q2}`);
  return {
    used: d.traffic_used,
    max: d.traffic_max,
    status: d.status,
    locHash: d.loc_hash
  };
}
async function fetchServers(acc) {
  const r = await fetch(`${ASSETS}/chrome/0/${acc.locHash}`, { headers: H3 });
  if (!r.ok) throw new Error(`serverlist HTTP ${r.status}`);
  const j = await r.json();
  const out = [];
  for (const c of j.data || []) {
    if (c.premium_only) continue;
    const loc = CC[c.short_name];
    if (!loc) continue;
    let seq = 0;
    for (const g of c.groups || []) {
      for (const h of g.hosts || []) {
        if (!h.hostname) continue;
        seq += 1;
        out.push({ tag: `${loc}${seq}`, loc, host: h.hostname, port: PROXY_PORT });
      }
    }
  }
  return out;
}
async function fetchWindscribe(account) {
  if (!account || !account.sessionAuthHash) {
    throw new Error("\u6CA1\u6709 Windscribe \u8D26\u53F7\uFF0C\u8DD1\u4E00\u6B21\u6D41\u6C34\u7EBF\u63A8\u4E00\u4E2A\u8FC7\u6765");
  }
  const [cred, servers] = await Promise.all([
    fetchCredentials(account),
    fetchServers(account)
  ]);
  return { account, ...cred, servers };
}

// src/ui.js
var CSS = `
:root{
  --bg:#05030e; --bg2:#0a0820;
  --cyan:#00f0ff; --pink:#ff2bd6; --purple:#a347ff;
  --yellow:#fff200; --mint:#00ff9d; --red:#ff3860;
  --text:#e6f5ff; --dim:#7aa9c4;
  --border:rgba(0,240,255,.55); --grid:rgba(255,43,214,.16);
}
*{margin:0;padding:0;box-sizing:border-box}
html{overflow-x:hidden}
html,body{min-height:100%}
body{
  font-family:"JetBrains Mono","Fira Code","Courier New",
    "PingFang SC","Microsoft YaHei","Noto Sans SC",monospace;
  background:radial-gradient(ellipse at 20% 10%,#2a0040 0%,var(--bg) 55%,#000 100%);
  color:var(--text);
  padding:32px 16px 56px;
  display:flex;justify-content:center;
  position:relative;overflow-x:hidden;
}
body::before{
  content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    linear-gradient(var(--grid) 1px,transparent 1px) 0 0/44px 44px,
    linear-gradient(90deg,var(--grid) 1px,transparent 1px) 0 0/44px 44px;
  opacity:.5;
}
body::after{
  content:"";position:fixed;inset:0;pointer-events:none;z-index:1;
  background:repeating-linear-gradient(180deg,rgba(0,240,255,.05) 0 1px,transparent 1px 4px);
}
.term{
  min-width:0;overflow:hidden;
  border:1px solid var(--border);
  background:rgba(8,4,28,.86);
  box-shadow:0 0 24px rgba(0,240,255,.14),inset 0 0 60px rgba(163,71,255,.07);
}
.head{
  display:flex;align-items:center;gap:12px;
  padding:12px 16px;border-bottom:1px solid var(--border);
  background:linear-gradient(90deg,rgba(255,43,214,.16),rgba(0,240,255,.16));
}
.dots{display:flex;gap:8px}
.dot{width:11px;height:11px;transform:rotate(45deg);background:var(--pink);box-shadow:0 0 8px var(--pink)}
.dot:nth-child(2){background:var(--yellow);box-shadow:0 0 8px var(--yellow)}
.dot:nth-child(3){background:var(--mint);box-shadow:0 0 8px var(--mint)}
.title{
  color:var(--cyan);font-size:13px;font-weight:700;
  letter-spacing:.25em;text-transform:uppercase;text-shadow:0 0 6px var(--cyan);
}
.title::before{content:"// ";color:var(--pink)}
.body{padding:22px 20px;min-width:0}
input[type="text"],input[type="password"]{
  background:rgba(0,0,0,.45);
  border:1px solid var(--border);color:var(--cyan);
  font-family:inherit;font-size:12px;padding:11px 12px;outline:none;
  text-shadow:0 0 4px var(--cyan);
}
input:focus{border-color:var(--pink);box-shadow:0 0 12px rgba(255,43,214,.4)}
button{
  font-family:inherit;font-size:12px;letter-spacing:.12em;text-transform:uppercase;
  padding:11px 18px;cursor:pointer;
  background:transparent;border:1px solid var(--pink);color:var(--pink);
  text-shadow:0 0 6px var(--pink);transition:.15s;white-space:nowrap;
}
button:hover{background:var(--pink);color:#05030e;text-shadow:none;box-shadow:0 0 16px var(--pink)}
button.gh{border-color:var(--cyan);color:var(--cyan);text-shadow:0 0 6px var(--cyan)}
button.gh:hover{background:var(--cyan);color:#05030e;box-shadow:0 0 16px var(--cyan)}
button:disabled{opacity:.4;cursor:not-allowed}
#msg{margin-top:10px;font-size:12px;min-height:18px}
.switch-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:12px 0}
.switch-item{display:flex;align-items:center;gap:10px;font-size:12px;cursor:pointer;background:rgba(0,0,0,.35);padding:10px 12px;border:1px solid rgba(0,240,255,.25)}
.switch-item input[type="checkbox"]{accent-color:var(--pink);width:16px;height:16px;cursor:pointer}
.radio-row{display:flex;gap:24px;align-items:center;margin:10px 0;font-size:12px}
.radio-label{display:flex;align-items:center;gap:8px;cursor:pointer}
.radio-label input[type="radio"]{accent-color:var(--cyan);width:16px;height:16px;cursor:pointer}
.region-list{display:flex;flex-direction:column;gap:8px}
.region-card{
  background:rgba(0,240,255,.02);border:1px solid rgba(0,240,255,.2);
  border-radius:4px;transition:all .18s ease;overflow:hidden;
}
.region-card:hover{border-color:rgba(0,240,255,.45)}
.region-card.open{border-color:var(--cyan);box-shadow:0 0 10px rgba(0,240,255,.12);background:rgba(0,240,255,.04)}
.region-card.active{border-color:rgba(255,43,214,.4)}
.region-card.open.active{border-color:var(--cyan)}
.region-header{
  display:flex;justify-content:space-between;align-items:center;
  padding:9px 12px;gap:12px;cursor:pointer;user-select:none;
}
.region-header:hover{background:rgba(255,43,214,.04)}
.region-main{display:flex;align-items:center;gap:10px;font-size:13px;flex:1;cursor:pointer;margin:0}
.region-main input[type="checkbox"]{accent-color:var(--pink);width:16px;height:16px;cursor:pointer}
.region-title{font-weight:500;color:var(--text)}
.region-tag{font-size:10px;color:var(--dim);border:1px solid rgba(122,169,196,.35);padding:1px 6px;border-radius:3px}
.btn-exp{
  background:transparent;border:1px solid rgba(0,240,255,.3);color:var(--dim);
  padding:3px 9px;font-size:11px;cursor:pointer;border-radius:3px;transition:.15s;font-family:inherit;
}
.btn-exp:hover{color:var(--cyan);border-color:var(--cyan);background:rgba(0,240,255,.1)}
.server-drawer{
  border-top:1px dashed rgba(0,240,255,.18);
  padding:10px 12px;background:rgba(0,0,0,.35);
}
.server-list{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;
}
.server-item{
  display:flex;align-items:center;gap:8px;padding:6px 10px;
  background:rgba(0,240,255,.03);border:1px solid rgba(0,240,255,.16);
  border-radius:3px;cursor:pointer;font-size:12px;transition:.15s;margin:0;
}
.server-item:hover{border-color:var(--cyan);background:rgba(0,240,255,.08)}
.server-item input[type="checkbox"]{accent-color:var(--cyan);width:15px;height:15px;cursor:pointer}
.srv-name{color:var(--cyan);font-weight:500}
.srv-ip{
  font-family:monospace;font-size:11px;color:var(--mint);
  background:rgba(0,255,163,.1);padding:1px 5px;border-radius:2px;
  margin-left:auto;letter-spacing:0;
}
`;
function renderNoKV() {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OPERA // MASQUE</title>
<style>${CSS}
.wrap{width:100%;max-width:520px;position:relative;z-index:2;min-width:0;align-self:center}
.step{font-size:12px;color:var(--dim);line-height:2;margin-top:6px}
.step b{color:var(--cyan);font-weight:400}
.step code{color:var(--yellow)}
</style></head>
<body><div class="wrap"><div class="term">
  <div class="head">
    <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    <div class="title">KV Not Bound</div>
  </div>
  <div class="body">
    <div class="step">
      \u8FD8\u6CA1\u7ED1 KV\uFF0C\u914D\u7F6E\u548C\u5BC6\u7801\u90FD\u6CA1\u5730\u65B9\u5B58\u3002<br><br>
      <b>1.</b> Cloudflare \u540E\u53F0 \u2192 \u5B58\u50A8\u548C\u6570\u636E\u5E93 \u2192 KV \u2192 \u521B\u5EFA\u5B9E\u4F8B<br>
      <b>2.</b> \u56DE\u5230\u8FD9\u4E2A Worker \u2192 \u8BBE\u7F6E \u2192 \u7ED1\u5B9A \u2192 \u6DFB\u52A0 \u2192 KV \u547D\u540D\u7A7A\u95F4<br>
      <b>3.</b> \u53D8\u91CF\u540D\u586B <code>KV</code>\uFF08\u4E24\u4E2A\u5B57\u6BCD\uFF0C\u5927\u5199\uFF09\uFF0C\u547D\u540D\u7A7A\u95F4\u9009\u521A\u5EFA\u7684<br>
      <b>4.</b> \u90E8\u7F72\uFF0C\u5237\u65B0\u672C\u9875
    </div>
  </div>
</div></div></body></html>`;
}
function renderSetup() {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OPERA // MASQUE</title>
<style>${CSS}
.wrap{width:100%;max-width:430px;position:relative;z-index:2;min-width:0;align-self:center}
.f{display:flex;flex-direction:column;gap:10px}
.hint{font-size:11px;color:var(--dim);line-height:1.9;margin-top:14px}
.hint b{color:var(--yellow);font-weight:400}
.lead{font-size:12px;color:var(--cyan);line-height:1.8;margin-bottom:16px}
</style></head>
<body><div class="wrap"><div class="term">
  <div class="head">
    <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    <div class="title">First Run</div>
  </div>
  <div class="body">
    <div class="lead">\u7B2C\u4E00\u6B21\u6253\u5F00\uFF0C\u5148\u8BBE\u4E00\u4E2A\u7BA1\u7406\u5BC6\u7801\u3002<br>\u4E4B\u540E\u8BA2\u9605\u8DEF\u5F84\u3001\u6539\u5BC6\u7801\u90FD\u5728\u754C\u9762\u91CC\u505A\u3002</div>
    <form class="f" onsubmit="return go(event)">
      <input type="password" id="p" placeholder="PASSWORD (>= 8)" autofocus autocomplete="new-password">
      <input type="password" id="c" placeholder="CONFIRM" autocomplete="new-password">
      <button type="submit">\u8BBE\u7F6E</button>
    </form>
    <div id="msg"></div>
    <div class="hint">
      \u5BC6\u7801\u53EA\u5B58\u54C8\u5E0C\uFF08PBKDF2 + \u968F\u673A\u76D0\uFF09\uFF0CKV \u91CC\u770B\u4E0D\u5230\u660E\u6587\u3002<br>
      <b>\u5FD8\u4E86\u53EA\u80FD\u5220\u6389 KV \u91CC\u7684 auth:cred \u91CD\u6765</b>\uFF0C\u6CA1\u6709\u627E\u56DE\u3002
    </div>
  </div>
</div></div>
<script>
async function go(e){
  e.preventDefault();
  const b=document.querySelector('button'), m=document.getElementById('msg');
  b.disabled=true; m.textContent='> \u8BBE\u7F6E\u4E2D\u2026'; m.style.color='var(--yellow)';
  try{
    const r=await fetch('/api/setup',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({password:document.getElementById('p').value,
                           confirm:document.getElementById('c').value})});
    const j=await r.json();
    if(j.ok){m.textContent='> \u5B8C\u6210';m.style.color='var(--mint)';location.reload();}
    else{m.textContent='> '+j.error;m.style.color='var(--red)';b.disabled=false;}
  }catch(err){m.textContent='> '+err.message;m.style.color='var(--red)';b.disabled=false;}
  return false;
}
<\/script>
</body></html>`;
}
function renderLogin() {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OPERA // MASQUE</title>
<style>${CSS}
.wrap{width:100%;max-width:400px;position:relative;z-index:2;min-width:0;align-self:center}
.f{display:flex;flex-direction:column;gap:12px}
.hint{font-size:11px;color:var(--dim);line-height:1.8;margin-top:14px}
</style></head>
<body><div class="wrap"><div class="term">
  <div class="head">
    <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    <div class="title">Auth Required</div>
  </div>
  <div class="body">
    <form class="f" onsubmit="return go(event)">
      <input type="password" id="p" placeholder="PASSWORD" autofocus autocomplete="current-password">
      <button type="submit">\u8FDB\u5165</button>
    </form>
    <div id="msg"></div>
    <div class="hint">\u8FDE\u7EED\u5931\u8D25 8 \u6B21\u4F1A\u9501\u5B9A 15 \u5206\u949F\u3002</div>
  </div>
</div></div>
<script>
async function go(e){
  e.preventDefault();
  const b=document.querySelector('button'), m=document.getElementById('msg');
  b.disabled=true; m.textContent='> \u9A8C\u8BC1\u4E2D\u2026'; m.style.color='var(--yellow)';
  try{
    const r=await fetch('/login',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({password:document.getElementById('p').value})});
    const j=await r.json();
    if(j.ok){m.textContent='> \u901A\u8FC7';m.style.color='var(--mint)';location.reload();}
    else{m.textContent='> '+j.error;m.style.color='var(--red)';b.disabled=false;}
  }catch(err){m.textContent='> '+err.message;m.style.color='var(--red)';b.disabled=false;}
  return false;
}
<\/script>
</body></html>`;
}
function renderUI(state, host, sp, token, cred, pushToken, protonCred, windUsage, settings = {}) {
  const s = state || {};
  const warp = s.warp || {};
  const stat = s.stats || {};
  const protocolMode = s.protocolMode || settings.protocolMode || "wg";
  const enableOpera = settings.enableOpera ?? true;
  const enableProton = settings.enableProton ?? true;
  const enableWarpDirect = settings.enableWarpDirect ?? true;
  const enableWind = settings.enableWind ?? true;
  const updated = s.updatedAt ? new Date(s.updatedAt) : null;
  const ago = updated ? Math.floor((Date.now() - updated.getTime()) / 6e4) : null;
  const exp = s.expiresAt ? new Date(s.expiresAt) : null;
  const left = exp ? Math.floor((exp.getTime() - Date.now()) / 6e4) : null;
  const leftTxt = left === null ? "\u2014" : left <= 0 ? "\u5DF2\u8FC7\u671F\uFF0C\u4E0B\u6B21\u8BBF\u95EE\u8BA2\u9605\u65F6\u81EA\u52A8\u91CD\u5EFA" : `${Math.floor(left / 60)} \u5C0F\u65F6 ${left % 60} \u5206\u540E\u8FC7\u671F`;
  const fmt = (d) => d ? d.toISOString().replace("T", " ").slice(0, 19) + " UTC" : "\u2014";
  const sub = `https://${host}${sp}?token=${token}`;
  const pushUrl = pushToken ? `https://${host}/push/${pushToken}` : "";
  const pushUrlWg = pushToken ? `${pushUrl}/wg` : "";
  const pushUrlMs = pushToken ? `${pushUrl}/ms` : "";
  const pExp = protonCred && protonCred.expiresAt ? new Date(protonCred.expiresAt * 1e3) : null;
  const windInfo = s.wind || null;
  const windPct = windUsage && windUsage.max ? Math.round(windUsage.used / windUsage.max * 100) : 0;
  const gb = (n) => (n / 1073741824).toFixed(2) + " GB";
  const windUsageTxt = windUsage && windUsage.max ? `${gb(windUsage.used)} / ${gb(windUsage.max)}\uFF08${windPct}%\uFF09` : null;
  const pLeft = pExp ? Math.floor((pExp.getTime() - Date.now()) / 864e5) : null;
  const protonServersMap = {};
  if (protonCred && Array.isArray(protonCred.servers)) {
    for (const srv of protonCred.servers) {
      const reg = getProtonRegion(srv);
      (protonServersMap[reg] ||= []).push(srv);
    }
    for (const list of Object.values(protonServersMap)) {
      list.sort((a, b) => getProtonIndex(a) - getProtonIndex(b));
    }
  }
  const selectedServers = Array.isArray(settings?.protonServers) ? settings.protonServers : Array.isArray(s.features?.protonServers) ? s.features.protonServers : null;
  const currentProtonRegions = Array.isArray(settings?.protonRegions) ? settings.protonRegions : Array.isArray(s.features?.protonRegions) ? s.features.protonRegions : ["\u65E5\u672C", "\u65B0\u52A0\u5761"];
  function isServerActive(srv) {
    if (selectedServers !== null) {
      return selectedServers.includes(srv.name) || selectedServers.includes(srv.ip);
    }
    const reg = getProtonRegion(srv);
    return currentProtonRegions.includes(reg);
  }
  let initialSelectedServerCount = 0;
  const initialActiveRegions = /* @__PURE__ */ new Set();
  if (protonCred && Array.isArray(protonCred.servers)) {
    for (const srv of protonCred.servers) {
      if (isServerActive(srv)) {
        initialSelectedServerCount++;
        initialActiveRegions.add(getProtonRegion(srv));
      }
    }
  }
  const flagMap = {
    "\u65E5\u672C": "\u{1F1EF}\u{1F1F5}",
    "\u65B0\u52A0\u5761": "\u{1F1F8}\u{1F1EC}",
    "\u7F8E\u56FD": "\u{1F1FA}\u{1F1F8}",
    "\u52A0\u62FF\u5927": "\u{1F1E8}\u{1F1E6}",
    "\u8377\u5170": "\u{1F1F3}\u{1F1F1}",
    "\u745E\u58EB": "\u{1F1E8}\u{1F1ED}",
    "\u632A\u5A01": "\u{1F1F3}\u{1F1F4}",
    "\u6CE2\u5170": "\u{1F1F5}\u{1F1F1}",
    "\u7F57\u9A6C\u5C3C\u4E9A": "\u{1F1F7}\u{1F1F4}",
    "\u58A8\u897F\u54E5": "\u{1F1F2}\u{1F1FD}"
  };
  const sortedRegions = Object.keys(protonServersMap).sort((a, b) => {
    const ia = REGION_ORDER.indexOf(a);
    const ib = REGION_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, "zh-CN");
  });
  const row = (k, v, cls = "") => `<div class="row"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`;
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opera over MASQUE</title>
<style>${CSS}
.wrap{width:100%;max-width:880px;position:relative;z-index:2;min-width:0}
.sec{margin-bottom:26px;min-width:0}
.sec:last-child{margin-bottom:0}
.sec-t{
  color:var(--pink);font-size:11px;letter-spacing:.22em;text-transform:uppercase;
  margin-bottom:12px;text-shadow:0 0 6px var(--pink);
}
.sec-t::before{content:"\u258D";color:var(--cyan);margin-right:6px}
.row{
  display:flex;justify-content:space-between;align-items:baseline;gap:16px;
  padding:7px 0;border-bottom:1px dashed rgba(0,240,255,.14);font-size:13px;
}
.row:last-child{border-bottom:none}
.k{color:var(--dim);letter-spacing:.06em;white-space:nowrap}
.v{color:var(--cyan);text-align:right;word-break:break-all}
.v.ok{color:var(--mint);text-shadow:0 0 6px var(--mint)}
.v.warn{color:var(--yellow);text-shadow:0 0 6px var(--yellow)}
.v.err{color:var(--red);text-shadow:0 0 6px var(--red)}
.grid{display:grid;min-width:0;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
.cell{
  border:1px solid rgba(0,240,255,.3);padding:12px 14px;
  background:rgba(0,240,255,.04);min-width:0;
}
.cell .n{font-size:24px;font-weight:700;color:var(--cyan);text-shadow:0 0 10px var(--cyan);line-height:1.1}
.cell .l{font-size:10px;color:var(--dim);letter-spacing:.14em;text-transform:uppercase;margin-top:6px;
  overflow-wrap:anywhere}
.sub{display:flex;gap:8px;align-items:stretch;margin-top:4px;flex-wrap:wrap}
.sub input{flex:1;min-width:0}
.pw{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;margin-top:4px}
.pw input{min-width:0}
@media(max-width:700px){.pw{grid-template-columns:1fr}}
.note{font-size:11px;color:var(--dim);line-height:1.85;margin-top:12px;
  overflow-wrap:anywhere;word-break:break-word}
.note b{color:var(--yellow);font-weight:400}
.foot{
  margin-top:18px;text-align:center;font-size:10px;color:var(--dim);
  letter-spacing:.2em;text-transform:uppercase;
}
.foot a{color:var(--purple);text-decoration:none}
.foot a:hover{color:var(--pink)}
.head{position:relative}
.out{
  margin-left:auto;font-size:10px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--dim);text-decoration:none;border:1px solid rgba(122,169,196,.4);
  padding:4px 10px;transition:.15s;
}
.out:hover{color:var(--red);border-color:var(--red);text-shadow:0 0 6px var(--red)}
@media(max-width:560px){
  body{padding:18px 10px 40px}
  .row{flex-direction:column;gap:2px;font-size:12px}
  .v{text-align:left}
  .sub{flex-direction:column}
  button{width:100%}
  .grid{grid-template-columns:1fr 1fr;gap:8px}
  .body{padding:16px 12px}
  .note{letter-spacing:0;font-size:11px}
  .title{font-size:10px;letter-spacing:.12em}
  .k,.v{letter-spacing:0}
  .cell .n{font-size:20px}
  .cell .l{letter-spacing:.08em;font-size:9px}
  .sec-t{letter-spacing:.14em}
}
@media(max-width:360px){
  .grid{grid-template-columns:1fr}
}
</style></head>
<body><div class="wrap"><div class="term">
  <div class="head">
    <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    <div class="title">Opera over MASQUE</div>
    <a class="out" href="/logout">\u9000\u51FA</a>
  </div>
  <div class="body">

    <div class="sec">
      <div class="sec-t">\u8BA2\u9605</div>
      <div class="sub">
        <input id="u" value="${sub}" readonly>
        <button onclick="cp('u')">\u590D\u5236</button>
        <button class="gh" onclick="location.href=document.getElementById('u').value">\u4E0B\u8F7D</button>
      </div>
      <div class="note">
        \u4E00\u4EFD\u805A\u5408\uFF0C\u5BFC\u8FDB\u53BB\u6709\u4E24\u7C7B\u7EBF\u8DEF\u53EF\u5207\uFF1A<br>
        \u5F53\u524D\u4E13\u5C5E\u63A5\u5165\u534F\u8BAE\uFF1A<b>${protocolMode === "wg" ? "WireGuard (AmneziaWG \u6DF7\u6DC6)" : "MASQUE (P-256)"}</b>\u3002<br>
        <b>\u4E9A\u6D32/\u6B27\u6D32/\u7F8E\u6D32\u7EBF\u8DEF</b> \u2014 \u8D70\u524D\u7F6E\u63A5\u5165\u70B9\u518D\u843D Opera\uFF0C\u80FD\u6362\u51FA\u53E3\u56FD\u5BB6\u3002<br>
        <b>WARP\u76F4\u8FDE</b> \u2014 \u53EA\u8D70\u524D\u7F6E\u63A5\u5165\u70B9\uFF0C\u51FA\u53E3\u662F Cloudflare \u81EA\u5DF1\u7684 IP\uFF0C\u901F\u5EA6\u6781\u5FEB\u3002<br>
        <b>Proton\u7EBF\u8DEF</b> \u2014 \u524D\u7F6E\u63A5\u5165\u6253\u5E95 + Proton WireGuard \u843D\u5730\uFF0C10 \u4E2A\u56FD\u5BB6\u3002<br>
        <b>Windscribe\u7EBF\u8DEF</b> \u2014 \u524D\u7F6E\u63A5\u5165\u6253\u5E95 + Windscribe \u843D\u5730\uFF0C13 \u4E2A\u5730\u533A\u3002
      </div>
      <div id="msg"></div>
    </div>

    <div class="sec">
      <div class="sec-t">\u63A5\u5165\u4E0E\u603B\u8BA1</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <div class="cell"><div class="n">${stat.combos ?? "\u2014"}</div><div class="l">\u603B\u7EC4\u5408\u8282\u70B9</div></div>
        <div class="cell"><div class="n">${protocolMode === "wg" ? stat.wgEntries ?? stat.entries ?? "48" : "\u2014"}</div><div class="l">WireGuard \u63A5\u5165\u70B9</div></div>
        <div class="cell"><div class="n">${protocolMode === "masque" ? stat.msEntries ?? stat.entries ?? "57" : "\u2014"}</div><div class="l">MASQUE \u63A5\u5165\u70B9</div></div>
        <div class="cell"><div class="n">${!enableWarpDirect ? "\u5DF2\u5173\u95ED" : stat.entries ?? "\u2014"}</div><div class="l">WARP \u76F4\u8FDE</div></div>
      </div>
      <div style="height:12px"></div>
      <div class="sec-t">\u843D\u5730\u670D\u52A1</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
        <div class="cell"><div class="n">${!enableOpera ? "\u5DF2\u5173\u95ED" : stat.landings ? `${stat.landings} \u53F0` : "\u2014"}</div><div class="l">Opera \u843D\u5730</div></div>
        <div class="cell"><div class="n">${!enableProton ? "\u5DF2\u5173\u95ED" : stat.protonServers || protonCred && protonCred.servers && protonCred.servers.length ? `${stat.protonServers || protonCred.servers.length} \u53F0` : "\u2014"}</div><div class="l">Proton \u843D\u5730</div></div>
        <div class="cell"><div class="n">${!enableWind ? "\u5DF2\u5173\u95ED" : stat.windServers ? `${stat.windServers} \u53F0` : windInfo && windInfo.servers ? `${windInfo.servers} \u53F0` : "\u2014"}</div><div class="l">Windscribe \u843D\u5730</div></div>
      </div>
      <div class="note">
        \u6BCF\u4E2A\u5F00\u542F\u7684\u843D\u5730\u548C\u524D\u7F6E\u63A5\u5165\u70B9\u8FDB\u884C\u7B1B\u5361\u5C14\u79EF\u7EC4\u5408\uFF0C\u4EFB\u4E00\u8DEF\u5F84\u6545\u969C\u90FD\u6709\u5197\u4F59\u8282\u70B9\u515C\u5E95\u3002
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">\u843D\u5730\u4E0E\u76F4\u8FDE\u5F00\u5173</div>
      <div class="switch-grid">
        <label class="switch-item">
          <input type="checkbox" id="sw_opera" ${enableOpera ? "checked" : ""}>
          <span>Opera \u843D\u5730 (\u5173\u95ED\u540E\u505C\u6B62\u8BF7\u6C42\u51ED\u8BC1)</span>
        </label>
        <label class="switch-item">
          <input type="checkbox" id="sw_proton" ${enableProton ? "checked" : ""}>
          <span>Proton \u843D\u5730</span>
        </label>
        <label class="switch-item">
          <input type="checkbox" id="sw_warp" ${enableWarpDirect ? "checked" : ""}>
          <span>WARP \u76F4\u8FDE</span>
        </label>
        <label class="switch-item">
          <input type="checkbox" id="sw_wind" ${enableWind ? "checked" : ""}>
          <span>Windscribe \u843D\u5730</span>
        </label>
      </div>
      <div class="sub">
        <button onclick="saveFeatures()">\u4FDD\u5B58\u5F00\u5173\u5E76\u5237\u65B0\u914D\u7F6E</button>
      </div>
      <div class="note">
        \u52FE\u9009\u5F00\u542F\u6216\u53D6\u6D88\u5173\u95ED\u3002<b>\u5F53 Opera \u843D\u5730\u5173\u95ED\u540E\uFF0CWorker \u4E0D\u518D\u5411 Opera API \u53D1\u8D77\u4EFB\u4F55\u51ED\u8BC1\u7533\u8BF7\u8BF7\u6C42</b>\u3002
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">\u64CD\u4F5C</div>
      <div class="radio-row">
        <label class="radio-label">
          <input type="radio" name="protocol_choice" value="wg" ${protocolMode === "wg" ? "checked" : ""}>
          <span>WireGuard (AWG \u6DF7\u6DC6\u53CD\u5BA1\u67E5\uFF0C\u9ED8\u8BA4)</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="protocol_choice" value="masque" ${protocolMode === "masque" ? "checked" : ""}>
          <span>MASQUE</span>
        </label>
      </div>
      <div class="sub">
        <button onclick="go('/api/refresh')">\u5237\u65B0 Opera \u51ED\u636E</button>
        <button class="gh" onclick="reregisterWarp()">\u91CD\u6CE8\u518C WARP \u8BBE\u5907</button>
      </div>
      <div class="note">
        Opera \u51ED\u636E 4 \u5C0F\u65F6\u5230\u671F\u3002\u8BA2\u9605\u88AB\u8BBF\u95EE\u65F6\u6309\u9700\u68C0\u67E5\u5E76\u81EA\u52A8\u66F4\u65B0\u3002<br>
        \u4E8C\u9009\u4E00\u4E13\u5C5E\u534F\u8BAE\uFF1A\u9009\u62E9\u540E\u4EC5\u751F\u6210\u5BF9\u5E94\u4E13\u5C5E\u534F\u8BAE\u7684\u8282\u70B9\u3002<br>
        \u5982\u9700\u66F4\u6539\u534F\u8BAE\uFF0C<b>\u5148\u5207\u6362\u534F\u8BAE\u5355\u9009\u6846\uFF0C\u518D\u70B9\u51FB\u201C\u91CD\u6CE8\u518C WARP \u8BBE\u5907\u201D</b>\u751F\u6548\u3002<br>
        WireGuard \u5B9E\u9645\u751F\u6210\u5E26 AmneziaWG \u6DF7\u6DC6\u53C2\u6570\u7684\u8BA2\u9605\uFF0C\u6297\u5C01\u9501\u80FD\u529B\u5F3A\u3002
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">Proton \u843D\u5730</div>
      ${protonCred ? `
      <div class="row"><span class="k">\u72B6\u6001</span><span class="v ok">\u5DF2\u914D\u7F6E ${protonCred.servers.length} \u53F0\uFF08\u5F53\u524D\u542F\u7528 ${initialSelectedServerCount} \u53F0\u843D\u5730\uFF09</span></div>
      <div class="row"><span class="k">\u8BC1\u4E66\u5269\u4F59</span><span class="v ${pLeft <= 1 ? "warn" : "ok"}">${pLeft} \u5929\uFF08${pExp.toISOString().slice(0, 10)} \u5230\u671F\uFF09</span></div>
      ${sortedRegions.length ? `
      <div class="row" style="margin-top:14px">
        <span class="k">\u843D\u5730\u56FD\u5BB6/\u5730\u533A\u9009\u62E9\uFF08\u53EF\u5C55\u5F00\u52FE\u9009\u5355\u4E2A\u670D\u52A1\u5668 IP\uFF09</span>
        <span class="v ok" id="proton_summary">\u5DF2\u52FE\u9009 ${initialActiveRegions.size} \u4E2A\u5730\u533A (${initialSelectedServerCount} \u53F0\u670D\u52A1\u5668)</span>
      </div>
      <div class="region-list" style="margin:10px 0">
        ${sortedRegions.map((reg) => {
    const srvList = protonServersMap[reg];
    const totalCount = srvList.length;
    const checkedCount = srvList.filter(isServerActive).length;
    const isAllChecked = checkedCount === totalCount && totalCount > 0;
    const flag = flagMap[reg] || "\u{1F310}";
    return `
          <div class="region-card ${checkedCount > 0 ? "active" : ""}" id="card_${reg}">
            <div class="region-header" onclick="handleCardClick(event, '${reg}')">
              <label class="region-main" onclick="event.stopPropagation()">
                <input type="checkbox" class="region-master-cb" data-region="${reg}"
                       ${isAllChecked ? "checked" : ""}
                       onchange="onRegionMasterChange('${reg}', this.checked)">
                <span class="region-title">${flag} ${reg}</span>
                <span class="region-tag" id="tag_${reg}">${checkedCount}/${totalCount}\u53F0</span>
              </label>
              <button type="button" class="btn-exp" id="btn_exp_${reg}" onclick="toggleRegionExpand('${reg}', event)">
                \u5C55\u5F00 \u25BC
              </button>
            </div>
            <div class="server-drawer" id="drawer_${reg}" style="display:none">
              <div class="server-list">
                ${srvList.map((srv) => {
      const checked = isServerActive(srv);
      return `
                  <label class="server-item">
                    <input type="checkbox" name="proton_server" value="${srv.name}"
                           data-region="${reg}" data-ip="${srv.ip}"
                           ${checked ? "checked" : ""}
                           onchange="onServerChange('${reg}')">
                    <span class="srv-name">${srv.name}</span>
                    <span class="srv-ip">${srv.ip}</span>
                  </label>`;
    }).join("")}
              </div>
            </div>
          </div>`;
  }).join("")}
      </div>
      <div class="sub" style="margin-bottom:12px">
        <button onclick="saveProtonRegions()">\u5E94\u7528\u6240\u9009\u5730\u533A\u4E0E\u670D\u52A1\u5668</button>
        <button class="gh" type="button" onclick="selectProtonAsia()">\u4EC5\u4E9A\u592A(\u65E5\u672C/\u65B0\u52A0\u5761)</button>
        <button class="gh" type="button" onclick="toggleProtonAll(true)">\u5168\u9009</button>
        <button class="gh" type="button" onclick="toggleProtonAll(false)">\u6E05\u7A7A</button>
      </div>
      ` : ""}
      ` : `
      <div class="row"><span class="k">\u72B6\u6001</span><span class="v warn">\u672A\u914D\u7F6E</span></div>
      `}
      <div class="note" style="margin-bottom:10px">
        Proton \u8D70 GitHub Actions \u6D41\u6C34\u7EBF\u81EA\u52A8\u7EED\u7B7E\u63A8\u9001\u5230 Worker\u3002\u53EF\u4EFB\u610F\u52FE\u9009\u60F3\u8981\u4F5C\u4E3A\u843D\u5730\u7684\u56FD\u5BB6/\u5730\u533A\uFF0C\u4FDD\u5B58\u540E\u81EA\u52A8\u5B9E\u65F6\u91CD\u6784\u8BA2\u9605\u3002
      </div>
      <div class="sub">
        <input id="pu" value="${pushUrl || "\u70B9\u53F3\u8FB9\u751F\u6210"}" readonly>
        <button onclick="cp('pu')">\u590D\u5236</button>
        <button class="gh" onclick="go('/api/proton/token')">${pushToken ? "\u6362\u4E00\u4E2A" : "\u751F\u6210"}</button>
      </div>
      <div class="row" style="margin-top:14px"><span class="k">WireGuard \u4F18\u9009\u7AEF\u70B9\u63A8\u9001 URL</span></div>
      <div class="sub">
        <input id="pu_wg" value="${pushUrlWg || "\u8BF7\u5148\u5728\u4E0A\u65B9\u751F\u6210\u4EE4\u724C"}" readonly>
        <button onclick="cp('pu_wg')">\u590D\u5236</button>
      </div>
      <div class="row" style="margin-top:14px"><span class="k">MASQUE \u4F18\u9009\u7AEF\u70B9\u63A8\u9001 URL</span></div>
      <div class="sub">
        <input id="pu_ms" value="${pushUrlMs || "\u8BF7\u5148\u5728\u4E0A\u65B9\u751F\u6210\u4EE4\u724C"}" readonly>
        <button onclick="cp('pu_ms')">\u590D\u5236</button>
      </div>
      <div class="note">
        \u628A\u4E3B\u5730\u5740\u586B\u8FDB GitHub \u4ED3\u5E93 Secrets \u7684 <b>WORKER_PUSH_URL</b>\uFF1B<br>
        WireGuard \u4F18\u9009\u7AEF\u70B9\u63A8\u9001\u94FE\u63A5\uFF1A<code>WORKER_PUSH_URL/wg</code><br>
        MASQUE \u4F18\u9009\u7AEF\u70B9\u63A8\u9001\u94FE\u63A5\uFF1A<code>WORKER_PUSH_URL/ms</code><br>
        ${protonCred ? `<br><a href="#" onclick="go('/api/proton/clear');return false" style="color:var(--red)">\u6E05\u9664 Proton \u51ED\u636E</a>` : ""}
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">Windscribe \u843D\u5730</div>
      ${windInfo ? `
      <div class="row"><span class="k">\u72B6\u6001</span><span class="v ok">\u5DF2\u6CE8\u518C ${windInfo.servers} \u53F0</span></div>
      <div class="row"><span class="k">\u8D26\u53F7</span><span class="v">${windInfo.userId}</span></div>
      ${windUsageTxt ? `<div class="row"><span class="k">\u672C\u6708\u6D41\u91CF</span><span class="v ${windPct > 90 ? "warn" : "ok"}">${windUsageTxt}</span></div>` : ""}
      ` : `
      <div class="row"><span class="k">\u72B6\u6001</span><span class="v warn">\u672A\u542F\u7528</span></div>
      `}
      <div class="note">
        \u514D\u8D39\u989D\u5EA6\u6BCF\u6708 2GB\u3002\u901A\u8FC7 GitHub Actions \u83B7\u53D6\u5E76\u63A8\u9001\u5230 <code>WORKER_PUSH_URL/wind</code>\u3002
        ${windInfo ? `<br><a href="#" onclick="go('/api/wind/clear');return false" style="color:var(--red)">\u6E05\u9664 Windscribe \u8D26\u53F7</a>` : ""}
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">\u72B6\u6001</div>
      ${row(
    "\u4E0A\u6B21\u66F4\u65B0",
    updated ? `${fmt(updated)}\uFF08${ago} \u5206\u949F\u524D\uFF09` : "\u5C1A\u672A\u751F\u6210",
    updated ? ago > 250 ? "warn" : "ok" : "err"
  )}
      ${row("\u51ED\u636E\u5269\u4F59", leftTxt, left === null ? "" : left <= 0 ? "warn" : "ok")}
      ${row("\u5230\u671F\u65F6\u95F4", fmt(exp))}
      ${row("\u5F53\u524D\u534F\u8BAE", protocolMode === "wg" ? "WireGuard (AmneziaWG)" : "MASQUE")}
      ${row("WARP \u8BBE\u5907", warp.deviceId ? warp.deviceId.slice(0, 8) + "\u2026" : "\u2014")}
      ${row("WARP \u6CE8\u518C\u4E8E", warp.registeredAt ? fmt(new Date(warp.registeredAt)) : "\u2014")}
      ${row("\u5185\u7F51\u5730\u5740", warp.ipv4 || "\u2014")}
    </div>

    <div class="sec">
      <div class="sec-t">\u8BA2\u9605\u8DEF\u5F84</div>
      <div class="sub">
        <input id="sp" value="${sp.replace(/^\//, "")}" spellcheck="false" placeholder="\u5B57\u6BCD\u6570\u5B57\u548C - _">
        <button onclick="setPath('sp')">\u4FDD\u5B58</button>
      </div>
      <div class="note">\u6539\u6210\u96BE\u731C\u7684\u5B57\u7B26\u4E32\uFF0C\u9632\u66B4\u529B\u63A2\u6D4B\u3002</div>
    </div>

    <div class="sec">
      <div class="sec-t">\u4FEE\u6539\u5BC6\u7801</div>
      <div class="pw">
        <input type="password" id="c0" placeholder="\u5F53\u524D\u5BC6\u7801" autocomplete="current-password">
        <input type="password" id="c1" placeholder="\u65B0\u5BC6\u7801\uFF08>= 8\uFF09" autocomplete="new-password">
        <input type="password" id="c2" placeholder="\u786E\u8BA4\u65B0\u5BC6\u7801" autocomplete="new-password">
        <button onclick="setPw()">\u4FEE\u6539</button>
      </div>
      <div class="note">\u4FEE\u6539\u5BC6\u7801\u540E\u6240\u6709\u65E7\u8BA2\u9605\u94FE\u63A5\u7ACB\u523B\u5931\u6548\u3002</div>
    </div>

  </div></div>
  <div class="foot">
    Cloudflare Worker \u30FB
    <a href="https://github.com/ustdbus/mihomo-warp">GitHub</a>
  </div>
</div>
<script>
function cp(id){
  const el=document.getElementById(id||'u');
  navigator.clipboard.writeText(el.value).then(
    ()=>say('\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F','var(--mint)'),
    ()=>{el.select();document.execCommand('copy');say('\u5DF2\u590D\u5236','var(--mint)')});
}
function say(t,c){
  const m=document.getElementById('msg');
  m.textContent='> '+t; m.style.color=c;
  setTimeout(()=>{m.textContent=''},4000);
}
async function post(url,body,okmsg){
  const bs=document.querySelectorAll('button');
  bs.forEach(b=>b.disabled=true);
  say('\u6267\u884C\u4E2D\u2026','var(--yellow)');
  try{
    const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
                            body:JSON.stringify(body)});
    const j=await r.json();
    if(j.ok){say((j.msg||okmsg)+'\uFF0C\u5373\u5C06\u5237\u65B0','var(--mint)');setTimeout(()=>location.reload(),1400);}
    else{say('\u5931\u8D25: '+j.error,'var(--red)');bs.forEach(b=>b.disabled=false);}
  }catch(e){say('\u5931\u8D25: '+e.message,'var(--red)');bs.forEach(b=>b.disabled=false);}
}
function saveFeatures(){
  const body = {
    enableOpera: document.getElementById('sw_opera').checked,
    enableProton: document.getElementById('sw_proton').checked,
    enableWarpDirect: document.getElementById('sw_warp').checked,
    enableWind: document.getElementById('sw_wind').checked,
  };
  post('/api/settings/features', body, '\u5F00\u5173\u5DF2\u4FDD\u5B58\u5E76\u91CD\u5EFA');
}
function toggleRegionExpand(reg, e){
  if(e) e.stopPropagation();
  const d = document.getElementById('drawer_' + reg);
  const btn = document.getElementById('btn_exp_' + reg);
  const card = document.getElementById('card_' + reg);
  if(!d) return;
  const isHidden = (d.style.display === 'none' || !d.style.display);
  d.style.display = isHidden ? 'block' : 'none';
  if(btn) btn.textContent = isHidden ? '\u6536\u8D77 \u25B2' : '\u5C55\u5F00 \u25BC';
  if(card) card.classList.toggle('open', isHidden);
}

function handleCardClick(e, reg){
  if(e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL' && !e.target.closest('.btn-exp')){
    toggleRegionExpand(reg);
  }
}

function onRegionMasterChange(reg, checked){
  const srvBoxes = document.querySelectorAll('input[name="proton_server"][data-region="' + reg + '"]');
  srvBoxes.forEach(b => b.checked = checked);
  updateRegionUI(reg);
  updateStats();
}

function onServerChange(reg){
  updateRegionUI(reg);
  updateStats();
}

function updateRegionUI(reg){
  const srvBoxes = document.querySelectorAll('input[name="proton_server"][data-region="' + reg + '"]');
  const masterBox = document.querySelector('.region-master-cb[data-region="' + reg + '"]');
  const tag = document.getElementById('tag_' + reg);
  const card = document.getElementById('card_' + reg);
  const total = srvBoxes.length;
  let checked = 0;
  srvBoxes.forEach(b => { if(b.checked) checked++; });

  if(masterBox){
    masterBox.checked = (checked === total && total > 0);
    masterBox.indeterminate = (checked > 0 && checked < total);
  }
  if(tag) tag.textContent = checked + '/' + total + '\u53F0';
  if(card) card.classList.toggle('active', checked > 0);
}

function updateStats(){
  const srvBoxes = document.querySelectorAll('input[name="proton_server"]:checked');
  const activeRegions = new Set();
  srvBoxes.forEach(b => activeRegions.add(b.getAttribute('data-region')));
  const summary = document.getElementById('proton_summary');
  if(summary){
    summary.textContent = '\u5DF2\u52FE\u9009 ' + activeRegions.size + ' \u4E2A\u5730\u533A (' + srvBoxes.length + ' \u53F0\u670D\u52A1\u5668)';
  }
}

function saveProtonRegions(){
  const boxes = document.querySelectorAll('input[name="proton_server"]:checked');
  const servers = Array.from(boxes).map(b => b.value);
  const regions = Array.from(new Set(Array.from(boxes).map(b => b.getAttribute('data-region'))));
  if(servers.length === 0){
    if(!confirm("\u672A\u52FE\u9009\u4EFB\u4F55\u843D\u5730\u670D\u52A1\u5668\uFF0C\u786E\u5B9A\u4FDD\u5B58\u5417\uFF1F(\u672A\u52FE\u9009\u5C06\u4E0D\u751F\u6210 Proton \u843D\u5730\u8282\u70B9)")) return;
  }
  post('/api/settings/proton-regions', { servers: servers, regions: regions }, 'Proton \u843D\u5730\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\u5E76\u91CD\u6784\u914D\u7F6E');
}

function selectProtonAsia(){
  document.querySelectorAll('input[name="proton_server"]').forEach(b => {
    const reg = b.getAttribute('data-region');
    b.checked = (reg === "\u65E5\u672C" || reg === "\u65B0\u52A0\u5761");
  });
  document.querySelectorAll('.region-master-cb').forEach(m => {
    const reg = m.getAttribute('data-region');
    updateRegionUI(reg);
  });
  updateStats();
}

function toggleProtonAll(checked){
  document.querySelectorAll('input[name="proton_server"]').forEach(b => b.checked = checked);
  document.querySelectorAll('.region-master-cb').forEach(m => {
    const reg = m.getAttribute('data-region');
    updateRegionUI(reg);
  });
  updateStats();
}
function reregisterWarp(){
  const radios = document.getElementsByName('protocol_choice');
  let chosen = 'wg';
  for(const r of radios){
    if(r.checked){ chosen = r.value; break; }
  }
  post('/api/warp/reregister', { protocol: chosen }, 'WARP \u8BBE\u5907\u5DF2\u6309\u4E13\u5C5E\u534F\u8BAE\u91CD\u65B0\u6CE8\u518C');
}
function setPath(id){
  const v=document.getElementById(id||'sp').value.trim();
  if(!v){say('\u8DEF\u5F84\u4E0D\u80FD\u4E3A\u7A7A','var(--red)');return;}
  post('/api/sub-path',{path:v},'\u5DF2\u4FDD\u5B58');
}
function setPw(){
  const c0=document.getElementById('c0').value;
  const c1=document.getElementById('c1').value;
  const c2=document.getElementById('c2').value;
  if(!c0||!c1){say('\u628A\u4E09\u4E2A\u6846\u90FD\u586B\u4E86','var(--red)');return;}
  if(c1!==c2){say('\u4E24\u6B21\u8F93\u5165\u4E0D\u4E00\u81F4','var(--red)');return;}
  if(c1.length<8){say('\u65B0\u5BC6\u7801\u81F3\u5C11 8 \u4F4D','var(--red)');return;}
  post('/api/password',{current:c0,password:c1,confirm:c2},'\u5DF2\u4FEE\u6539');
}
async function go(p){
  const bs=document.querySelectorAll('button');
  bs.forEach(b=>b.disabled=true);
  say('\u6267\u884C\u4E2D\u2026','var(--yellow)');
  try{
    const r=await fetch(p,{method:'POST'});
    const j=await r.json();
    if(j.ok){say(j.msg+'\uFF0C\u5373\u5C06\u5237\u65B0','var(--mint)');setTimeout(()=>location.reload(),1200);}
    else{say('\u5931\u8D25: '+j.error,'var(--red)');bs.forEach(b=>b.disabled=false);}
  }catch(e){say('\u5931\u8D25: '+e.message,'var(--red)');bs.forEach(b=>b.disabled=false);}
}
<\/script>
</body></html>`;
}

// src/auth.js
var enc = new TextEncoder();
var ITER = 1e5;
var b642 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
function safeEqual(a, b) {
  const x = enc.encode(a || "");
  const y = enc.encode(b || "");
  const n = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
async function pbkdf2(password, saltB64, iter = ITER) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    key,
    256
  );
  return b642(bits);
}
async function makeCred(password) {
  const s = new Uint8Array(16);
  crypto.getRandomValues(s);
  const salt = b642(s);
  return {
    salt,
    iter: ITER,
    hash: await pbkdf2(password, salt, ITER),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function checkPassword(cred, password) {
  if (!cred || !cred.hash) return false;
  const h = await pbkdf2(password, cred.salt, cred.iter || ITER);
  return safeEqual(h, cred.hash);
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return b642(sig).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
var TTL = 7 * 24 * 3600 * 1e3;
async function signToken(cred) {
  const exp = Date.now() + TTL;
  return `${exp}.${await hmac(cred.hash, String(exp))}`;
}
async function verifyToken(cred, token) {
  if (!cred || !cred.hash || !token || !token.includes(".")) return false;
  const i = token.lastIndexOf(".");
  const exp = token.slice(0, i);
  const sig = token.slice(i + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(cred.hash, exp));
}
function readCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
async function rateLimit(env, ip) {
  const key = `rl:${ip}`;
  const n = Number(await env.KV.get(key) || 0);
  if (n >= 8) return false;
  await env.KV.put(key, String(n + 1), { expirationTtl: 900 });
  return true;
}
async function clearRateLimit(env, ip) {
  await env.KV.delete(`rl:${ip}`);
}
function normalizePath(p2) {
  const clean = String(p2 || "").trim().replace(/^\/+|\/+$/g, "");
  if (!clean) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(clean)) return null;
  const reserved = ["login", "logout", "api", "setup"];
  if (reserved.includes(clean.toLowerCase())) return null;
  return clean;
}

// src/index.js
var K_WARP = "warp:device";
var K_CFG = "config:yaml";
var K_STATE = "state:meta";
var K_CRED = "auth:cred";
var K_SET = "settings";
var K_CLAIM = "auth:claim";
var K_PROTON = "proton:cred";
var K_PUSH = "proton:token";
var K_WIND = "wind:account";
var K_LOCK = "rebuild:lock";
var K_CUSTOM_WG = "custom:endpoints_wg";
var K_CUSTOM_MS = "custom:endpoints_ms";
var COOKIE = "om_session";
var DEFAULT_SUB = "sub";
var TTL_MS = 4 * 3600 * 1e3;
var SKEW_MS = 10 * 60 * 1e3;
var json = (o, s = 200) => new Response(JSON.stringify(o), {
  status: s,
  headers: { "content-type": "application/json; charset=utf-8" }
});
var html = (body, s = 200) => new Response(body, {
  status: s,
  headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  }
});
var notFound = () => new Response("Not Found", { status: 404 });
async function getSettings(env) {
  const s = await env.KV.get(K_SET, "json") || {};
  return {
    subPath: s.subPath || DEFAULT_SUB,
    protocolMode: s.protocolMode || "wg",
    enableOpera: s.enableOpera ?? true,
    enableProton: s.enableProton ?? true,
    enableWarpDirect: s.enableWarpDirect ?? true,
    enableWind: s.enableWind ?? true,
    protonRegions: Array.isArray(s.protonRegions) ? s.protonRegions : null,
    protonServers: Array.isArray(s.protonServers) ? s.protonServers : null
  };
}
async function getWarp(env, force = false, protocol = "wg") {
  if (!force) {
    const cached = await env.KV.get(K_WARP, "json");
    if (cached && cached.privateKey && cached.protocol === protocol) {
      return cached;
    }
  }
  const w = await registerWarp(protocol, "cf-worker");
  await env.KV.put(K_WARP, JSON.stringify(w));
  return w;
}
async function getWind(env) {
  const acc = await env.KV.get(K_WIND, "json");
  if (!acc || !acc.sessionAuthHash) return null;
  return await fetchWindscribe(acc);
}
async function rebuild(env, { forceWarp = false, newProtocol = null } = {}) {
  let settings = await getSettings(env);
  if (newProtocol && newProtocol !== settings.protocolMode) {
    settings = { ...settings, protocolMode: newProtocol };
    const curRaw = await env.KV.get(K_SET, "json") || {};
    await env.KV.put(K_SET, JSON.stringify({ ...curRaw, protocolMode: newProtocol }));
  }
  const protocolMode = settings.protocolMode || "wg";
  const warp = await getWarp(env, forceWarp, protocolMode);
  let opera = { landings: [] };
  if (settings.enableOpera !== false) {
    opera = await fetchOpera();
  }
  let proton = null;
  if (settings.enableProton !== false) {
    const pc = await env.KV.get(K_PROTON, "json");
    if (pc && (!pc.expiresAt || pc.expiresAt * 1e3 > Date.now())) proton = pc;
  }
  let wind = null, windErr = null;
  if (settings.enableWind !== false) {
    try {
      wind = await getWind(env);
    } catch (e) {
      windErr = e.message;
    }
  }
  const rawWg = await env.KV.get(K_CUSTOM_WG);
  const rawMs = await env.KV.get(K_CUSTOM_MS);
  const customWgEndpoints = rawWg ? parseCustomEndpoints(rawWg, "AWG") : null;
  const customMsEndpoints = rawMs ? parseCustomEndpoints(rawMs, "MASQUE") : null;
  const cfg = buildConfig(warp, opera, proton, wind, {
    protocolMode,
    enableOpera: settings.enableOpera !== false,
    enableProton: settings.enableProton !== false,
    enableWarpDirect: settings.enableWarpDirect !== false,
    enableWind: settings.enableWind !== false,
    customWgEndpoints,
    customMsEndpoints,
    protonRegions: settings.protonRegions,
    protonServers: settings.protonServers
  });
  const now = Date.now();
  const state = {
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
    protocolMode,
    features: {
      enableOpera: settings.enableOpera !== false,
      enableProton: settings.enableProton !== false,
      enableWarpDirect: settings.enableWarpDirect !== false,
      enableWind: settings.enableWind !== false,
      protonRegions: Array.isArray(settings.protonRegions) ? settings.protonRegions : ["\u65E5\u672C", "\u65B0\u52A0\u5761"],
      protonServers: Array.isArray(settings.protonServers) ? settings.protonServers : null
    },
    stats: {
      entries: cfg.entries,
      wgEntries: cfg.wgEntries,
      msEntries: cfg.msEntries,
      landings: cfg.landings,
      protonServers: cfg.protonServers || (proton?.servers?.length || 0),
      windServers: cfg.windServers || (wind?.servers?.length || 0),
      combos: cfg.totalCombos ?? cfg.combos,
      operaCombos: cfg.combos,
      proton: cfg.proton || 0,
      wind: cfg.wind || 0
    },
    protonExpiresAt: proton ? proton.expiresAt : null,
    wind: wind ? { userId: wind.account.userId, servers: cfg.wind || 0 } : null,
    windErr,
    warp: {
      protocol: warp.protocol || protocolMode,
      deviceId: warp.deviceId,
      ipv4: warp.ipv4,
      ipv6: warp.ipv6,
      registeredAt: warp.registeredAt
    }
  };
  await env.KV.put(K_CFG, cfg.yaml);
  await env.KV.put(K_STATE, JSON.stringify(state));
  return state;
}
function isFresh(state) {
  if (!state || !state.expiresAt) return false;
  return Date.parse(state.expiresAt) - SKEW_MS > Date.now();
}
async function ensureConfig(env) {
  const state = await env.KV.get(K_STATE, "json");
  const yaml = await env.KV.get(K_CFG);
  if (yaml && isFresh(state)) return yaml;
  const lock = await env.KV.get(K_LOCK);
  if (lock && Date.now() - Number(lock) < 9e4) {
    if (yaml) return yaml;
  } else {
    await env.KV.put(K_LOCK, String(Date.now()), { expirationTtl: 120 });
    try {
      await rebuild(env);
    } finally {
      await env.KV.delete(K_LOCK);
    }
  }
  return await env.KV.get(K_CFG) || yaml;
}
var index_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const ip = req.headers.get("cf-connecting-ip") || "unknown";
    if (!env || !env.KV) return html(renderNoKV(), 500);
    const cred = await env.KV.get(K_CRED, "json");
    const authed = cred && await verifyToken(cred, readCookie(req, COOKIE));
    if (!cred) {
      if (path === "/api/setup" && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        const pw = String(body.password || "");
        if (pw.length < 8) return json({ ok: false, error: "\u5BC6\u7801\u81F3\u5C11 8 \u4F4D" }, 400);
        if (pw !== body.confirm) return json({ ok: false, error: "\u4E24\u6B21\u8F93\u5165\u4E0D\u4E00\u81F4" }, 400);
        const claim = crypto.randomUUID();
        if (await env.KV.get(K_CRED)) {
          return json({ ok: false, error: "\u5BC6\u7801\u5DF2\u88AB\u8BBE\u7F6E\uFF0C\u8BF7\u5237\u65B0\u9875\u9762" }, 409);
        }
        await env.KV.put(K_CLAIM, claim, { expirationTtl: 60 });
        if (await env.KV.get(K_CLAIM) !== claim) {
          return json({ ok: false, error: "\u5BC6\u7801\u5DF2\u88AB\u8BBE\u7F6E\uFF0C\u8BF7\u5237\u65B0\u9875\u9762" }, 409);
        }
        const c = await makeCred(pw);
        if (await env.KV.get(K_CRED)) {
          return json({ ok: false, error: "\u5BC6\u7801\u5DF2\u88AB\u8BBE\u7F6E\uFF0C\u8BF7\u5237\u65B0\u9875\u9762" }, 409);
        }
        await env.KV.put(K_CRED, JSON.stringify(c));
        await env.KV.delete(K_CLAIM);
        const token = await signToken(c);
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 3600}`
          }
        });
      }
      if (path === "/") return html(renderSetup());
      return notFound();
    }
    const settings = await getSettings(env);
    const subPath = "/" + settings.subPath;
    if (path === subPath) {
      const t = url.searchParams.get("token") || "";
      if (!await verifyToken(cred, t) && !authed) return notFound();
      const yaml = await ensureConfig(env);
      if (!yaml) {
        return new Response(
          "\u914D\u7F6E\u751F\u6210\u5931\u8D25\uFF0C\u7A0D\u540E\u91CD\u8BD5\u6216\u5230\u7BA1\u7406\u9875\u624B\u52A8\u5237\u65B0",
          { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
        );
      }
      return new Response(yaml, {
        headers: {
          "content-type": "text/yaml; charset=utf-8",
          "content-disposition": "attachment; filename=opera-masque.yaml",
          "profile-update-interval": "4",
          "cache-control": "no-store"
        }
      });
    }
    if (path.startsWith("/push/") && req.method === "POST") {
      const tk = await env.KV.get(K_PUSH);
      const rest = path.slice(6);
      const slash = rest.indexOf("/");
      const got = slash < 0 ? rest : rest.slice(0, slash);
      const kind = slash < 0 ? "proton" : rest.slice(slash + 1);
      if (!tk || !got || !safeEqual(got, tk)) return notFound();
      const body = await req.text();
      if (kind === "wg") {
        await env.KV.put(K_CUSTOM_WG, body);
        try {
          const st = await rebuild(env);
          return json({ ok: true, msg: "\u5DF2\u66F4\u65B0 WireGuard \u4F18\u9009\u7AEF\u70B9", entries: st.stats.entries });
        } catch (e) {
          return json({ ok: true, msg: "WireGuard \u7AEF\u70B9\u5DF2\u5199\u5165\uFF0C\u4F46\u91CD\u5EFA\u914D\u7F6E\u5931\u8D25\uFF1A" + e.message });
        }
      }
      if (kind === "ms") {
        await env.KV.put(K_CUSTOM_MS, body);
        try {
          const st = await rebuild(env);
          return json({ ok: true, msg: "\u5DF2\u66F4\u65B0 MASQUE \u4F18\u9009\u7AEF\u70B9", entries: st.stats.entries });
        } catch (e) {
          return json({ ok: true, msg: "MASQUE \u7AEF\u70B9\u5DF2\u5199\u5165\uFF0C\u4F46\u91CD\u5EFA\u914D\u7F6E\u5931\u8D25\uFF1A" + e.message });
        }
      }
      if (kind === "wind") {
        let acc;
        try {
          acc = JSON.parse(body);
        } catch {
          return json({ ok: false, error: "\u4E0D\u662F\u5408\u6CD5\u7684 JSON" }, 400);
        }
        if (!acc || !acc.sessionAuthHash || !acc.locHash) {
          return json({ ok: false, error: "\u7F3A sessionAuthHash \u6216 locHash" }, 400);
        }
        if (acc.status !== void 0 && acc.status !== 1) {
          return json({ ok: false, error: `\u8D26\u53F7 status=${acc.status}\uFF0C\u662F\u88AB\u964D\u989D\u7684\u53F7\uFF0C\u6CA1\u6CD5\u7528` }, 400);
        }
        await env.KV.put(K_WIND, JSON.stringify(acc));
        try {
          const st = await rebuild(env);
          return json({ ok: true, msg: `\u5DF2\u5199\u5165 Windscribe \u8D26\u53F7\uFF0C${st.stats.wind} \u53F0\u843D\u5730` });
        } catch (e) {
          return json({ ok: true, msg: "\u8D26\u53F7\u5DF2\u5199\u5165\uFF0C\u4F46\u91CD\u5EFA\u914D\u7F6E\u5931\u8D25\uFF1A" + e.message });
        }
      }
      let parsed;
      try {
        parsed = parseBlob(body);
      } catch (e) {
        return json({ ok: false, error: e.message }, 400);
      }
      await env.KV.put(K_PROTON, JSON.stringify(parsed));
      try {
        const st = await rebuild(env);
        return json({
          ok: true,
          msg: `\u5DF2\u5199\u5165 ${parsed.servers.length} \u53F0 Proton \u843D\u5730`,
          combos: st.stats.combos,
          proton: st.stats.proton
        });
      } catch (e) {
        return json({ ok: true, msg: "\u51ED\u636E\u5DF2\u5199\u5165\uFF0C\u4F46\u91CD\u5EFA\u914D\u7F6E\u5931\u8D25\uFF1A" + e.message });
      }
    }
    if (path === "/login" && req.method === "POST") {
      if (!await rateLimit(env, ip)) {
        return json({ ok: false, error: "\u5C1D\u8BD5\u8FC7\u591A\uFF0C15 \u5206\u949F\u540E\u518D\u8BD5" }, 429);
      }
      const body = await req.json().catch(() => ({}));
      if (!await checkPassword(cred, String(body.password || ""))) {
        return json({ ok: false, error: "\u5BC6\u7801\u9519\u8BEF" }, 401);
      }
      await clearRateLimit(env, ip);
      const token = await signToken(cred);
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 3600}`
        }
      });
    }
    if (path === "/logout") {
      return new Response(null, {
        status: 302,
        headers: {
          location: "/",
          "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
        }
      });
    }
    if (path === "/") {
      if (!authed) return html(renderLogin());
      const state = await env.KV.get(K_STATE, "json");
      const token = await signToken(cred);
      const pushToken = await env.KV.get(K_PUSH);
      const protonCred = await env.KV.get(K_PROTON, "json");
      let windUsage = null;
      const wa = await env.KV.get(K_WIND, "json");
      if (wa && wa.sessionAuthHash) {
        try {
          windUsage = await fetchSession(wa);
        } catch {
          windUsage = null;
        }
      }
      return html(renderUI(
        state,
        url.host,
        subPath,
        token,
        cred,
        pushToken,
        protonCred,
        windUsage,
        settings
      ));
    }
    if (!authed) return notFound();
    if (path === "/api/state") {
      return json(await env.KV.get(K_STATE, "json") || {});
    }
    if (path === "/api/settings/features" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const cur = await getSettings(env);
      const updated = {
        ...cur,
        enableOpera: body.enableOpera !== void 0 ? Boolean(body.enableOpera) : cur.enableOpera,
        enableProton: body.enableProton !== void 0 ? Boolean(body.enableProton) : cur.enableProton,
        enableWarpDirect: body.enableWarpDirect !== void 0 ? Boolean(body.enableWarpDirect) : cur.enableWarpDirect,
        enableWind: body.enableWind !== void 0 ? Boolean(body.enableWind) : cur.enableWind
      };
      await env.KV.put(K_SET, JSON.stringify(updated));
      try {
        const s = await rebuild(env);
        return json({ ok: true, msg: "\u8282\u70B9\u5F00\u5173\u5DF2\u4FDD\u5B58\u5E76\u91CD\u5EFA\u914D\u7F6E", stats: s.stats });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }
    if (path === "/api/settings/proton-regions" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const regions = Array.isArray(body.regions) ? body.regions : [];
      const servers = Array.isArray(body.servers) ? body.servers : null;
      const cur = await getSettings(env);
      const updated = {
        ...cur,
        protonRegions: regions,
        protonServers: servers
      };
      await env.KV.put(K_SET, JSON.stringify(updated));
      try {
        const s = await rebuild(env);
        return json({
          ok: true,
          msg: `Proton \u843D\u5730\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u542F\u7528 ${s.stats.protonServers || 0} \u53F0\u670D\u52A1\u5668\uFF09\uFF0C\u5DF2\u5B9E\u65F6\u91CD\u6784\u8BA2\u9605`,
          stats: s.stats
        });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }
    if (path === "/api/proton/token" && req.method === "POST") {
      const t = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      await env.KV.put(K_PUSH, t);
      return json({ ok: true, token: t, msg: "\u4EE4\u724C\u5DF2\u66F4\u65B0\uFF0C\u65E7\u7684\u7ACB\u5373\u5931\u6548" });
    }
    if (path === "/api/proton/clear" && req.method === "POST") {
      await env.KV.delete(K_PROTON);
      try {
        await rebuild(env);
      } catch {
      }
      return json({ ok: true, msg: "Proton \u51ED\u636E\u5DF2\u6E05\u9664" });
    }
    if (path === "/api/sub-path" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const p2 = normalizePath(body.path);
      if (!p2) {
        return json({
          ok: false,
          error: "\u53EA\u80FD\u7528\u5B57\u6BCD\u6570\u5B57\u548C - _\uFF0C1-64 \u4F4D\uFF0C\u4E14\u4E0D\u80FD\u662F login/logout/api/setup"
        }, 400);
      }
      await env.KV.put(K_SET, JSON.stringify({ ...settings, subPath: p2 }));
      return json({ ok: true, msg: `\u8BA2\u9605\u8DEF\u5F84\u5DF2\u6539\u4E3A /${p2}` });
    }
    if (path === "/api/password" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (!await checkPassword(cred, String(body.current || ""))) {
        return json({ ok: false, error: "\u5F53\u524D\u5BC6\u7801\u4E0D\u5BF9" }, 401);
      }
      const pw = String(body.password || "");
      if (pw.length < 8) return json({ ok: false, error: "\u65B0\u5BC6\u7801\u81F3\u5C11 8 \u4F4D" }, 400);
      if (pw !== body.confirm) return json({ ok: false, error: "\u4E24\u6B21\u8F93\u5165\u4E0D\u4E00\u81F4" }, 400);
      const c = await makeCred(pw);
      await env.KV.put(K_CRED, JSON.stringify(c));
      const token = await signToken(c);
      return new Response(
        JSON.stringify({ ok: true, msg: "\u5BC6\u7801\u5DF2\u6539\uFF0C\u65E7\u7684\u8BA2\u9605\u94FE\u63A5\u5168\u90E8\u5931\u6548" }),
        {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 3600}`
          }
        }
      );
    }
    if (path === "/api/refresh" && req.method === "POST") {
      try {
        const s = await rebuild(env);
        return json({ ok: true, msg: `\u5DF2\u5237\u65B0\uFF0C${s.stats.combos} \u4E2A\u7EC4\u5408` });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }
    if ((path === "/api/warp/reregister" || path === "/api/reset-warp") && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const cur = await getSettings(env);
      const protocol = body.protocol === "masque" || body.protocol === "wg" ? body.protocol : cur.protocolMode || "wg";
      try {
        const s = await rebuild(env, { forceWarp: true, newProtocol: protocol });
        return json({ ok: true, msg: `WARP (${protocol === "masque" ? "MASQUE" : "WireGuard"}) \u5DF2\u91CD\u6CE8\u518C\uFF0C${s.stats.combos} \u4E2A\u7EC4\u5408` });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }
    if (path === "/api/wind/clear" && req.method === "POST") {
      await env.KV.delete(K_WIND);
      try {
        await rebuild(env);
      } catch {
      }
      return json({ ok: true, msg: "\u5DF2\u6E05\u9664\uFF0C\u91CD\u8DD1\u4E00\u6B21\u6D41\u6C34\u7EBF\u62FF\u65B0\u8D26\u53F7" });
    }
    return notFound();
  }
};
export {
  index_default as default
};
