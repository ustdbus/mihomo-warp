// 配置结构测试。跑: node test/config.test.mjs
import { buildConfig } from "../src/config.js";

const warp = {
  privateKey: "MGsCAQEEIFAKE", peerPublicKey: "MFkwEwFAKE",
  ipv4: "172.16.0.2", ipv6: "2606:4700:110::1",
  deviceId: "x", registeredAt: new Date().toISOString(),
};
const opera = {
  username: "USER", password: "PASS",
  landings: [
    { tag: "亚洲1", loc: "亚洲", ip: "77.111.245.1", port: 443, host: "as0.sec-tunnel.com" },
    { tag: "欧洲1", loc: "欧洲", ip: "77.111.247.1", port: 443, host: "eu0.sec-tunnel.com" },
  ],
};

let pass = 0, fail = 0;
const t = (n, c) => { c ? (pass++, console.log("  ✓", n)) : (fail++, console.log("  ✗", n)); };

const { yaml, entries, combos } = buildConfig(warp, opera);
const groups = [...yaml.matchAll(/^  - name: (.+)$/gm)].map((m) => m[1]);
const proxyNames = [...yaml.matchAll(/^  - \{name: "([^"]+)"/gm)].map((m) => m[1]);
const entryNames = [...yaml.matchAll(/^  - name: (\S+)\n    type: masque$/gm)].map((m) => m[1]);

t(`接入点 ${entries} 个`, entries === 57);
t(`组合 ${combos} 个 (57 x 2)`, combos === 114);
t("有 WARP直连 组", groups.includes("WARP直连"));
t("有三个地区组",
  ["亚洲线路", "欧洲线路"].every((g) => groups.includes(g)));

// WARP直连 组的成员必须都是接入点，不能混进组合节点
const warpGroup = yaml.split("  - name: WARP直连")[1].split("\n  - name:")[0];
const members = [...warpGroup.matchAll(/^      - "([^"]+)"$/gm)].map((m) => m[1]);
t(`WARP直连 有 ${members.length} 个成员`, members.length === 57);
t("成员都是接入点(不含 @)", members.every((m) => !m.includes("@")));
t("成员都在 proxies 里定义", members.every((m) => entryNames.includes(m)));

// 节点选择里要同时有地区组和直连
const sel = yaml.split("  - name: 🚀 节点选择")[1].split("\n  - name:")[0];
t("节点选择含 WARP直连", sel.includes("WARP直连"));
t("节点选择含地区线路", sel.includes("亚洲线路"));

// 组合节点必须带 dialer-proxy，直连节点必须不带
t("组合节点都带 dialer-proxy",
  (yaml.match(/dialer-proxy:/g) || []).length === combos);
t("组合节点名格式正确", proxyNames.every((n) => /^[\u4e00-\u9fa5]+\d+@/.test(n)));

// 不能有悬空引用
const groupSection = yaml.slice(yaml.indexOf("proxy-groups:"), yaml.indexOf("rule-providers:"));
const allRefs = [...groupSection.matchAll(/^      - "?([^"\n]+)"?$/gm)].map((m) => m[1].trim());
const defined = new Set([...groups, ...proxyNames, ...entryNames, "DIRECT", "REJECT"]);
const dangling = [...new Set(allRefs.filter((r) => !defined.has(r)))];
t(`无悬空引用${dangling.length ? " (" + dangling.slice(0, 3) + ")" : ""}`, dangling.length === 0);

// Proton 相关（回归用，这两条都是线上实测踩出来的）
{
  const proton = {
    privateKey: "PK", expiresAt: Math.floor(Date.now()/1000)+604800,
    servers: [
      { name: "日本1", cc: "JP", ip: "1.1.1.1", port: 51820, pub: "A" },
      { name: "日本2", cc: "JP", ip: "1.1.1.2", port: 51820, pub: "B" },
      { name: "美国1", cc: "US", ip: "2.2.2.1", port: 51820, pub: "C" },
    ],
  };
  const r2 = buildConfig(warp, opera, proton);
  const y = r2.yaml;

  // WireGuard 的 UDP 从接入点发出，分到 IPv6 接入点的话
  // 纯 IPv4 机器上会全部 network is unreachable
  const dps = [...y.matchAll(/type: wireguard[\s\S]*?dialer-proxy: (\S+)/g)].map(m => m[1]);
  t(`Proton 接入点全是 IPv4 (${dps.length} 个)`,
    dps.length === 58 && dps.every(d => !d.startsWith("v6-")));

  // 10.2.0.1 是隧道内网 DNS，配上会让解析请求自己路由回 Proton 节点，死循环
  t("Proton 节点不带隧道内 DNS", !/10\.2\.0\.1/.test(y));

  const gs2 = [...y.matchAll(/^  - name: (.+)$/gm)].map(m => m[1]);
  t("Proton线路 是 select 组", /- name: Proton线路\n    type: select/.test(y));
  t("Proton 不含自动测速组 (单会话保护)", !gs2.includes("Proton-自动"));

  const jp = y.split("  - name: Proton-日本")[1].split("\n  - name:")[0];
  t("国家组只含该国节点",
    jp.includes("日本1") && jp.includes("日本2") && !jp.includes("美国1"));
}

// Windscribe（和 Opera 同构，但只轮接入点不做笛卡尔积）
{
  const wind = {
    username: "WU", password: "WP",
    servers: [
      { tag: "香港1", loc: "香港", host: "hk-016.totallyacdn.com", port: 443 },
      { tag: "香港2", loc: "香港", host: "hk-014.totallyacdn.com", port: 443 },
      { tag: "英国1", loc: "英国", host: "uk-048.totallyacdn.com", port: 443 },
    ],
  };
  const r3 = buildConfig(warp, opera, null, wind);
  const y = r3.yaml;
  const gs3 = [...y.matchAll(/^  - name: (.+)$/gm)].map((m) => m[1]);

  t(`Windscribe 节点 ${r3.wind} 个`, r3.wind === 3);
  t("Windscribe线路 是 select 组", /- name: Windscribe线路\n    type: select/.test(y));
  t("按地区分组", gs3.includes("WS-香港") && gs3.includes("WS-英国"));
  t("有自动选择组", gs3.includes("WS-自动"));

  const hk = y.split("  - name: WS-香港")[1].split("\n  - name:")[0];
  t("地区组只含该地区节点",
    hk.includes("WS-香港1") && hk.includes("WS-香港2") && !hk.includes("WS-英国1"));

  // 同 Proton：dialer-proxy 只能是 IPv4 接入点
  const wdp = [...y.matchAll(/name: "WS-[^"]+"[^\n]*dialer-proxy: (\S+)\}/g)].map((m) => m[1]);
  t(`Windscribe 接入点全是 IPv4 (${wdp.length} 个)`,
    wdp.length === 3 && wdp.every((d) => !d.startsWith("v6-")));

  const sel3 = y.split("  - name: 🚀 节点选择")[1].split("\n  - name:")[0];
  t("节点选择含 Windscribe线路", sel3.includes("Windscribe线路"));

  // 没传 wind 时不该冒出任何 WS 相关的东西
  t("不传 wind 就没有 WS 分组", !buildConfig(warp, opera).yaml.includes("Windscribe线路"));

  // 悬空引用（含 Windscribe 分组）
  const gsec = y.slice(y.indexOf("proxy-groups:"), y.indexOf("rule-providers:"));
  const refs3 = [...gsec.matchAll(/^      - "?([^"\n]+)"?$/gm)].map((m) => m[1].trim());
  const names3 = [...y.matchAll(/^  - \{name: "([^"]+)"/gm)].map((m) => m[1]);
  const ents3 = [...y.matchAll(/^  - name: (\S+)\n    type: masque$/gm)].map((m) => m[1]);
  const def3 = new Set([...gs3, ...names3, ...ents3, "DIRECT", "REJECT"]);
  const dang3 = [...new Set(refs3.filter((r) => !def3.has(r)))];
  t(`无悬空引用${dang3.length ? " (" + dang3.slice(0, 3) + ")" : ""}`, dang3.length === 0);
}

// AI 分组
{
  const y = buildConfig(warp, opera).yaml;
  const gs = [...y.matchAll(/^  - name: (.+)$/gm)].map((m) => m[1]);

  t("有 AI服务 分组", gs.includes("🤖 AI服务"));
  t("旧的 OpenAi 分组已改名", !gs.includes("🤖 OpenAi"));
  t("没有指向 OpenAi 的残留规则", !y.includes(",🤖 OpenAi"));

  // 各家都要能命中
  const must = [
    "anthropic.com", "grok.com", "perplexity.ai", "deepseek.com",
    "midjourney.com", "huggingface.co", "cursor.com", "elevenlabs.io",
    "mistral.ai", "meta.ai", "openrouter.ai", "kimi.com",
  ];
  const miss = must.filter((d) => !y.includes(`DOMAIN-SUFFIX,${d},🤖 AI服务`));
  t(`覆盖各家 AI${miss.length ? " 缺:" + miss.slice(0, 3) : ""}`, miss.length === 0);

  // 共用域名不能进来，否则会把无关流量拽进 AI 分组
  const tooWide = ["googleapis.com", "cloudflare.com", "stripe.com", "sentry.io", "bing.com"];
  const bad = tooWide.filter((d) => y.includes(`DOMAIN-SUFFIX,${d},🤖 AI服务`));
  t(`没有过宽的共用域名${bad.length ? " (" + bad + ")" : ""}`, bad.length === 0);

  // 内联规则必须排在 RULE-SET 之前，否则会被上游更宽的条目抢先命中
  const rs = y.indexOf("  - RULE-SET,");
  const inl = y.indexOf("  - DOMAIN-SUFFIX,");
  t("内联 AI 规则排在 RULE-SET 前", inl > 0 && inl < rs);

  // 域名不能重复
  const ds = [...y.matchAll(/^  - DOMAIN-SUFFIX,([^,]+),🤖 AI服务$/gm)].map((m) => m[1]);
  t(`AI 域名 ${ds.length} 条无重复`, new Set(ds).size === ds.length);

  // AI 分组要能选到所有落地
  const ai = y.split("  - name: 🤖 AI服务")[1].split("\n  - name:")[0];
  t("AI服务 能选地区线路", ai.includes("亚洲线路"));
  t("AI服务 能选 WARP直连", ai.includes("WARP直连"));
}

// ---- WireGuard (AWG 混淆) 专属模式及笛卡尔积测试 ----
{
  const rWg = buildConfig(warp, opera, {
    privateKey: "PK", expiresAt: Math.floor(Date.now()/1000)+604800,
    servers: [
      { name: "日本1", cc: "JP", ip: "1.1.1.1", port: 51820, pub: "A" },
      { name: "美国1", cc: "US", ip: "2.2.2.1", port: 51820, pub: "B" },
    ],
  }, null, { protocolMode: "wg" });

  t("WG模式接入点默认 20 个", rWg.entries === 20);
  t("WG模式包含 Amnezia 混淆参数", rWg.yaml.includes("amnezia-wg-option:"));
  t("WG模式包含 jc/jmin/jmax", rWg.yaml.includes("jc: 4") && rWg.yaml.includes("jmin: 40"));
  // 20 个 AWG 端点 x 2 个 Opera 落地 = 40 个 Opera 组合
  t("WG模式 Opera 组合为 40 个 (20 x 2)", rWg.combos === 40);
  // 20 个 AWG 端点 x 1 个 Proton 日本落地 = 20 个 Proton 全组合
  t("WG模式 Proton 落地笛卡尔积全组合 (20 x 1 = 20)", rWg.proton === 20);
  t("WG模式 Proton 组合节点名带 @", rWg.yaml.includes("日本1@AWG-东京1"));

  // 自动选择组 proxies 为叶子节点，不能包含策略组名
  const autoGroup = rWg.yaml.split("  - name: ♻️ 自动选择")[1].split("\n  - name:")[0];
  t("自动选择组不嵌套策略组名", !autoGroup.includes("亚洲线路") && !autoGroup.includes("WARP直连"));
}

// ---- 4 项功能独立关闭开关测试 ----
{
  const rOff = buildConfig(warp, opera, {
    privateKey: "PK", expiresAt: Math.floor(Date.now()/1000)+604800,
    servers: [{ name: "JP1", cc: "JP", ip: "1.1.1.1", port: 51820, pub: "A" }],
  }, {
    username: "U", password: "P",
    servers: [{ tag: "HK", loc: "香港", host: "hk.com", port: 443 }],
  }, {
    protocolMode: "wg",
    enableOpera: false,
    enableProton: false,
    enableWarpDirect: false,
    enableWind: false,
  });

  t("关闭 Opera 后无 Opera 组合节点", rOff.combos === 0 && !rOff.yaml.includes("亚洲线路"));
  t("关闭 Proton 后无 Proton 节点", rOff.proton === 0 && !rOff.yaml.includes("Proton线路"));
  t("关闭 Windscribe 后无 WS 节点", rOff.wind === 0 && !rOff.yaml.includes("Windscribe线路"));
  t("关闭 WARP直连 后无 WARP直连 组", !rOff.yaml.includes("  - name: WARP直连"));
}

// ---- Proton 地区自由选择与分类排序测试 ----
{
  const messyProton = {
    privateKey: "PK", expiresAt: Math.floor(Date.now()/1000)+604800,
    servers: [
      { name: "新加坡1", cc: "SG", ip: "2.2.2.1", port: 51820, pub: "SG1" },
      { name: "日本2", cc: "JP", ip: "1.1.1.2", port: 51820, pub: "JP2" },
      { name: "美国1", cc: "US", ip: "3.3.3.1", port: 51820, pub: "US1" },
      { name: "日本1", cc: "JP", ip: "1.1.1.1", port: 51820, pub: "JP1" },
      { name: "新加坡2", cc: "SG", ip: "2.2.2.2", port: 51820, pub: "SG2" },
      { name: "日本3", cc: "JP", ip: "1.1.1.3", port: 51820, pub: "JP3" },
    ],
  };

  // 1. 只选日本
  const rJpOnly = buildConfig(warp, opera, messyProton, null, {
    protocolMode: "wg",
    protonRegions: ["日本"],
  });
  t("只勾选日本时仅 3 台落地服务器", rJpOnly.protonServers === 3);
  t("只勾选日本时不含新加坡或美国落地组及节点",
    !rJpOnly.yaml.includes("Proton-新加坡") &&
    !rJpOnly.yaml.includes("Proton-美国") &&
    !rJpOnly.yaml.includes("美国1") &&
    !/新加坡\d+@/.test(rJpOnly.yaml));
  t("生成日本专属独立策略组 日本1、日本2、日本3",
    rJpOnly.yaml.includes("- name: 日本1\n") &&
    rJpOnly.yaml.includes("- name: 日本2\n") &&
    rJpOnly.yaml.includes("- name: 日本3\n"));
  t("生成大区组 Proton-日本 (无自动测速组)",
    rJpOnly.yaml.includes("- name: Proton-日本\n") &&
    !rJpOnly.yaml.includes("- name: Proton-日本-自动\n"));

  // 2. 选日本与新加坡：验证排序整洁不乱序穿插
  const rBoth = buildConfig(warp, opera, messyProton, null, {
    protocolMode: "wg",
    protonRegions: ["日本", "新加坡"],
  });
  t("多选时落地服务器为 5 台", rBoth.protonServers === 5);
  const posJp1 = rBoth.yaml.indexOf("- name: 日本1\n");
  const posJp2 = rBoth.yaml.indexOf("- name: 日本2\n");
  const posJp3 = rBoth.yaml.indexOf("- name: 日本3\n");
  const posSg1 = rBoth.yaml.indexOf("- name: 新加坡1\n");
  const posSg2 = rBoth.yaml.indexOf("- name: 新加坡2\n");
  t("按国家与编号有序排列 (日本1 < 日本2 < 日本3 < 新加坡1 < 新加坡2)",
    posJp1 < posJp2 && posJp2 < posJp3 && posJp3 < posSg1 && posSg1 < posSg2);

  // 3. 显式清空 (0 地区)
  const rEmpty = buildConfig(warp, opera, messyProton, null, {
    protocolMode: "wg",
    protonRegions: [],
  });
  t("显式清空地区时生成 0 个 Proton 节点", rEmpty.proton === 0 && rEmpty.protonServers === 0);

  // 4. 精确勾选单一服务器 (只选日本1)
  const rSingle = buildConfig(warp, opera, messyProton, null, {
    protocolMode: "wg",
    protonServers: ["日本1"],
  });
  t("精准勾选单台落地服务器仅 1 台", rSingle.protonServers === 1);
  t("单台落地时组合节点刚好为 20 个 (20 x 1)", rSingle.proton === 20);
  t("生成的订阅只含选中的日本1，不含日本2和日本3",
    rSingle.yaml.includes("- name: 日本1\n") &&
    !rSingle.yaml.includes("- name: 日本2\n") &&
    !rSingle.yaml.includes("- name: 日本3\n") &&
    !rSingle.yaml.includes("日本2@") &&
    !rSingle.yaml.includes("日本3@") &&
    !rSingle.yaml.includes("Proton-新加坡") &&
    !/新加坡\d+@/.test(rSingle.yaml));

  // 5. 精确跨国挑选服务器 (如 日本1 与 新加坡2)
  const rCustomTwo = buildConfig(warp, opera, messyProton, null, {
    protocolMode: "wg",
    protonServers: ["日本1", "新加坡2"],
  });
  t("精准挑选 2 台跨国服务器时落地为 2 台", rCustomTwo.protonServers === 2);
  t("不包含未选中的日本2/日本3/新加坡1",
    !rCustomTwo.yaml.includes("- name: 日本2\n") &&
    !rCustomTwo.yaml.includes("- name: 日本3\n") &&
    !rCustomTwo.yaml.includes("- name: 新加坡1\n") &&
    rCustomTwo.yaml.includes("- name: 日本1\n") &&
    rCustomTwo.yaml.includes("- name: 新加坡2\n"));
}

console.log(`\n通过 ${pass} 失败 ${fail}`);
if (fail) process.exit(1);

