// 界面沿用赛博朋克终端风：青/品红霓虹、等宽字体、扫描线。
import { getProtonRegion, getProtonIndex, REGION_ORDER } from "./config.js";

const CSS = `
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
.server-item input[type="radio"],.server-item input[type="checkbox"]{accent-color:var(--cyan);width:15px;height:15px;cursor:pointer}
.srv-name{color:var(--cyan);font-weight:500}
.srv-ip{
  font-family:monospace;font-size:11px;color:var(--mint);
  background:rgba(0,255,163,.1);padding:1px 5px;border-radius:2px;
  margin-left:auto;letter-spacing:0;
}
`;

export function renderNoKV() {
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
      还没绑 KV，配置和密码都没地方存。<br><br>
      <b>1.</b> Cloudflare 后台 → 存储和数据库 → KV → 创建实例<br>
      <b>2.</b> 回到这个 Worker → 设置 → 绑定 → 添加 → KV 命名空间<br>
      <b>3.</b> 变量名填 <code>KV</code>（两个字母，大写），命名空间选刚建的<br>
      <b>4.</b> 部署，刷新本页
    </div>
  </div>
</div></div></body></html>`;
}

export function renderSetup() {
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
    <div class="lead">第一次打开，先设一个管理密码。<br>之后订阅路径、改密码都在界面里做。</div>
    <form class="f" onsubmit="return go(event)">
      <input type="password" id="p" placeholder="PASSWORD (>= 8)" autofocus autocomplete="new-password">
      <input type="password" id="c" placeholder="CONFIRM" autocomplete="new-password">
      <button type="submit">设置</button>
    </form>
    <div id="msg"></div>
    <div class="hint">
      密码只存哈希（PBKDF2 + 随机盐），KV 里看不到明文。<br>
      <b>忘了只能删掉 KV 里的 auth:cred 重来</b>，没有找回。
    </div>
  </div>
</div></div>
<script>
async function go(e){
  e.preventDefault();
  const b=document.querySelector('button'), m=document.getElementById('msg');
  b.disabled=true; m.textContent='> 设置中…'; m.style.color='var(--yellow)';
  try{
    const r=await fetch('/api/setup',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({password:document.getElementById('p').value,
                           confirm:document.getElementById('c').value})});
    const j=await r.json();
    if(j.ok){m.textContent='> 完成';m.style.color='var(--mint)';location.reload();}
    else{m.textContent='> '+j.error;m.style.color='var(--red)';b.disabled=false;}
  }catch(err){m.textContent='> '+err.message;m.style.color='var(--red)';b.disabled=false;}
  return false;
}
</script>
</body></html>`;
}

export function renderLogin() {
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
      <button type="submit">进入</button>
    </form>
    <div id="msg"></div>
    <div class="hint">连续失败 8 次会锁定 15 分钟。</div>
  </div>
</div></div>
<script>
async function go(e){
  e.preventDefault();
  const b=document.querySelector('button'), m=document.getElementById('msg');
  b.disabled=true; m.textContent='> 验证中…'; m.style.color='var(--yellow)';
  try{
    const r=await fetch('/login',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({password:document.getElementById('p').value})});
    const j=await r.json();
    if(j.ok){m.textContent='> 通过';m.style.color='var(--mint)';location.reload();}
    else{m.textContent='> '+j.error;m.style.color='var(--red)';b.disabled=false;}
  }catch(err){m.textContent='> '+err.message;m.style.color='var(--red)';b.disabled=false;}
  return false;
}
</script>
</body></html>`;
}

export function renderUI(state, host, sp, token, cred, pushToken, protonCred, windUsage, settings = {}, vpngate = null) {
  const s = state || {};
  const warp = s.warp || {};
  const stat = s.stats || {};
  const protocolMode = s.protocolMode || settings.protocolMode || "wg";

  const enableOpera = settings.enableOpera ?? true;
  const enableProton = settings.enableProton ?? true;
  const enableWarpDirect = settings.enableWarpDirect ?? true;
  const enableWind = settings.enableWind ?? true;
  const enableVpnGate = settings.enableVpnGate ?? true;

  const currentVgRegions = Array.isArray(settings?.vpngateRegions)
    ? settings.vpngateRegions
    : (Array.isArray(s.features?.vpngateRegions) ? s.features.vpngateRegions : ["日本", "韩国"]);
  const activeVgRegions = new Set(currentVgRegions);

  const updated = s.updatedAt ? new Date(s.updatedAt) : null;
  const ago = updated ? Math.floor((Date.now() - updated.getTime()) / 60000) : null;
  const exp = s.expiresAt ? new Date(s.expiresAt) : null;
  const left = exp ? Math.floor((exp.getTime() - Date.now()) / 60000) : null;
  const leftTxt = left === null ? "—"
    : left <= 0 ? "已过期，下次访问订阅时自动重建"
    : `${Math.floor(left / 60)} 小时 ${left % 60} 分后过期`;
  const fmt = (d) => d ? d.toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—";
  const sub = `https://${host}${sp}?token=${token}`;
  const pushUrl = pushToken ? `https://${host}/push/${pushToken}` : "";
  const pushUrlWg = pushToken ? `${pushUrl}/wg` : "";
  const pushUrlMs = pushToken ? `${pushUrl}/ms` : "";

  const pExp = protonCred && protonCred.expiresAt
    ? new Date(protonCred.expiresAt * 1000) : null;
  const windInfo = s.wind || null;
  const windPct = windUsage && windUsage.max
    ? Math.round((windUsage.used / windUsage.max) * 100) : 0;
  const gb = (n) => (n / 1073741824).toFixed(2) + " GB";
  const windUsageTxt = windUsage && windUsage.max
    ? `${gb(windUsage.used)} / ${gb(windUsage.max)}（${windPct}%）` : null;
  const pLeft = pExp ? Math.floor((pExp.getTime() - Date.now()) / 86400000) : null;

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

  const selectedServers = Array.isArray(settings?.protonServers)
    ? settings.protonServers
    : (Array.isArray(s.features?.protonServers) ? s.features.protonServers : null);

  const currentProtonRegions = Array.isArray(settings?.protonRegions)
    ? settings.protonRegions
    : (Array.isArray(s.features?.protonRegions) ? s.features.protonRegions : ["日本", "新加坡"]);

  function isServerActive(srv) {
    if (selectedServers !== null) {
      return selectedServers.includes(srv.name) || selectedServers.includes(srv.ip);
    }
    const reg = getProtonRegion(srv);
    return currentProtonRegions.includes(reg);
  }

  // 保证每个国家最多只选一台服务器（单选互斥）
  const activeServerByRegion = {};
  if (protonCred && Array.isArray(protonCred.servers)) {
    for (const srv of protonCred.servers) {
      const reg = getProtonRegion(srv);
      if (isServerActive(srv) && !activeServerByRegion[reg]) {
        activeServerByRegion[reg] = srv.name;
      }
    }
  }

  const initialSelectedServerCount = Object.keys(activeServerByRegion).length;
  const initialActiveRegions = new Set(Object.keys(activeServerByRegion));

  const flagMap = {
    "日本": "🇯🇵",
    "新加坡": "🇸🇬",
    "美国": "🇺🇸",
    "加拿大": "🇨🇦",
    "荷兰": "🇳🇱",
    "瑞士": "🇨🇭",
    "挪威": "🇳🇴",
    "波兰": "🇵🇱",
    "罗马尼亚": "🇷🇴",
    "墨西哥": "🇲🇽",
  };

  const sortedRegions = Object.keys(protonServersMap).sort((a, b) => {
    const ia = REGION_ORDER.indexOf(a);
    const ib = REGION_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, "zh-CN");
  });

  const row = (k, v, cls = "") =>
    `<div class="row"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`;

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
.sec-t::before{content:"▍";color:var(--cyan);margin-right:6px}
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
    <a class="out" href="/logout">退出</a>
  </div>
  <div class="body">

    <div class="sec">
      <div class="sec-t">订阅</div>
      <div class="sub">
        <input id="u" value="${sub}" readonly>
        <button onclick="cp('u')">复制</button>
        <button class="gh" onclick="location.href=document.getElementById('u').value">下载</button>
      </div>
      <div class="note">
        一份聚合，导进去有两类线路可切：<br>
        当前专属接入协议：<b>${protocolMode === "wg" ? "WireGuard (AmneziaWG 混淆)" : "MASQUE (P-256)"}</b>。<br>
        <b>亚洲/欧洲/美洲线路</b> — 走前置接入点再落 Opera，能换出口国家。<br>
        <b>WARP直连</b> — 只走前置接入点，出口是 Cloudflare 自己的 IP，速度极快。<br>
        <b>Proton线路</b> — 前置接入打底 + Proton WireGuard 落地，10 个国家。<br>
        <b>Windscribe线路</b> — 前置接入打底 + Windscribe 落地，13 个地区。
      </div>
      <div id="msg"></div>
    </div>

    <div class="sec">
      <div class="sec-t">接入与总计</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <div class="cell"><div class="n">${stat.combos ?? "—"}</div><div class="l">总组合节点</div></div>
        <div class="cell"><div class="n">${protocolMode === "wg" ? (stat.wgEntries ?? stat.entries ?? "48") : "—"}</div><div class="l">WireGuard 接入点</div></div>
        <div class="cell"><div class="n">${protocolMode === "masque" ? (stat.msEntries ?? stat.entries ?? "57") : "—"}</div><div class="l">MASQUE 接入点</div></div>
        <div class="cell"><div class="n">${!enableWarpDirect ? "已关闭" : (stat.entries ?? "—")}</div><div class="l">WARP 直连</div></div>
      </div>
      <div style="height:12px"></div>
      <div class="sec-t">落地服务</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        <div class="cell"><div class="n">${!enableOpera ? "已关闭" : (stat.landings ? `${stat.landings} 台` : "—")}</div><div class="l">Opera 落地</div></div>
        <div class="cell"><div class="n">${!enableProton ? "已关闭" : ((stat.protonServers || (protonCred && protonCred.servers && protonCred.servers.length)) ? `${stat.protonServers || protonCred.servers.length} 台` : "—")}</div><div class="l">Proton 落地</div></div>
        <div class="cell"><div class="n">${!enableWind ? "已关闭" : (stat.windServers ? `${stat.windServers} 台` : (windInfo && windInfo.servers ? `${windInfo.servers} 台` : "—"))}</div><div class="l">Windscribe 落地</div></div>
        <div class="cell"><div class="n">${!enableVpnGate ? "已关闭" : (stat.vpngateServers ? `${stat.vpngateServers} 台` : (vpngate?.servers ? `${vpngate.servers.length} 台` : "—"))}</div><div class="l">VPN Gate 落地</div></div>
      </div>
      <div class="note">
        每个开启的落地和前置接入点进行套娃拨号组合，任一路径故障都有冗余节点兜底。
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">落地与直连开关</div>
      <div class="switch-grid">
        <label class="switch-item">
          <input type="checkbox" id="sw_opera" ${enableOpera ? "checked" : ""}>
          <span>Opera 落地</span>
        </label>
        <label class="switch-item">
          <input type="checkbox" id="sw_proton" ${enableProton ? "checked" : ""}>
          <span>Proton 落地</span>
        </label>
        <label class="switch-item">
          <input type="checkbox" id="sw_warp" ${enableWarpDirect ? "checked" : ""}>
          <span>WARP 直连</span>
        </label>
        <label class="switch-item">
          <input type="checkbox" id="sw_wind" ${enableWind ? "checked" : ""}>
          <span>Windscribe 落地</span>
        </label>
        <label class="switch-item">
          <input type="checkbox" id="sw_vpngate" ${enableVpnGate ? "checked" : ""}>
          <span>VPN Gate 落地 (筑波大学学术)</span>
        </label>
      </div>
      <div class="sub">
        <button onclick="saveFeatures()">保存开关并刷新配置</button>
      </div>
      <div class="note">
        勾选开启或取消关闭。<b>当 Opera 落地关闭后，Worker 不再向 Opera API 发起任何凭证申请请求</b>。
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">操作</div>
      <div class="radio-row">
        <label class="radio-label">
          <input type="radio" name="protocol_choice" value="wg" ${protocolMode === "wg" ? "checked" : ""}>
          <span>WireGuard (AWG 混淆反审查，默认)</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="protocol_choice" value="masque" ${protocolMode === "masque" ? "checked" : ""}>
          <span>MASQUE</span>
        </label>
      </div>
      <div class="sub">
        <button onclick="go('/api/refresh')">刷新 Opera 凭据</button>
        <button class="gh" onclick="reregisterWarp()">重注册 WARP 设备</button>
      </div>
      <div class="note">
        Opera 凭据 4 小时到期。订阅被访问时按需检查并自动更新。<br>
        二选一专属协议：选择后仅生成对应专属协议的节点。<br>
        如需更改协议，<b>先切换协议单选框，再点击“重注册 WARP 设备”</b>生效。<br>
        WireGuard 实际生成带 AmneziaWG 混淆参数的订阅，抗封锁能力强。
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">Proton 落地</div>
      ${protonCred ? `
      <div class="row"><span class="k">状态</span><span class="v ok">已配置 ${protonCred.servers.length} 台（当前启用 ${initialSelectedServerCount} 台落地）</span></div>
      <div class="row"><span class="k">证书剩余</span><span class="v ${pLeft <= 1 ? "warn" : "ok"}">${pLeft} 天（${pExp.toISOString().slice(0, 10)} 到期）</span></div>
      ${sortedRegions.length ? `
      <div class="row" style="margin-top:14px;align-items:center;cursor:pointer" onclick="toggleRegionListExpand(event)">
        <span class="k" style="display:flex;align-items:center;gap:8px">
          <span>落地国家/地区选择（单选落地 IP）</span>
          <span class="btn-exp" id="btn_toggle_list" style="padding:2px 8px;font-size:11px">收起列表 ▲</span>
        </span>
        <span class="v ok" id="proton_summary">已勾选 ${initialActiveRegions.size} 个地区 (${initialSelectedServerCount} 台服务器)</span>
      </div>
      <div id="proton_regions_wrapper">
        <div class="region-list" style="margin:10px 0">
          ${sortedRegions.map((reg) => {
            const srvList = protonServersMap[reg];
            const totalCount = srvList.length;
            const chosenServer = activeServerByRegion[reg];
            const isChecked = Boolean(chosenServer);
            const flag = flagMap[reg] || "🌐";
            return `
            <div class="region-card ${isChecked ? 'active' : ''}" id="card_${reg}">
              <div class="region-header" onclick="handleCardClick(event, '${reg}')">
                <label class="region-main" onclick="event.stopPropagation()">
                  <input type="checkbox" class="region-master-cb" data-region="${reg}"
                         ${isChecked ? "checked" : ""}
                         onchange="onRegionMasterChange('${reg}', this.checked)">
                  <span class="region-title">${flag} ${reg}</span>
                  <span class="region-tag" id="tag_${reg}">${isChecked ? 1 : 0}/${totalCount}台</span>
                </label>
                <button type="button" class="btn-exp" id="btn_exp_${reg}" onclick="toggleRegionExpand('${reg}', event)">
                  展开 ▼
                </button>
              </div>
              <div class="server-drawer" id="drawer_${reg}" style="display:none">
                <div class="server-list">
                  ${srvList.map((srv) => {
                    const checked = (srv.name === chosenServer);
                    return `
                    <label class="server-item">
                      <input type="radio" name="proton_server_${reg}" value="${srv.name}"
                             data-region="${reg}" data-ip="${srv.ip}"
                             data-waschecked="${checked ? 'true' : 'false'}"
                             ${checked ? "checked" : ""}
                             onclick="onServerRadioClick(this, '${reg}')">
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
          <button onclick="saveProtonRegions()">应用所选地区与服务器</button>
          <button class="gh" type="button" onclick="selectProtonAsia()">仅亚太(日本/新加坡)</button>
          <button class="gh" type="button" onclick="toggleProtonAll(true)">全选(各选1台)</button>
          <button class="gh" type="button" onclick="toggleProtonAll(false)">清空</button>
        </div>
      </div>
      ` : ""}
      ` : `
      <div class="row"><span class="k">状态</span><span class="v warn">未配置</span></div>
      `}
      <div class="note" style="margin-bottom:10px">
        Proton 走 GitHub Actions 流水线自动续签推送到 Worker。可任意勾选想要作为落地的国家/地区，保存后自动实时重构订阅。
      </div>
      <div class="sub">
        <input id="pu" value="${pushUrl || "点右边生成"}" readonly>
        <button onclick="cp('pu')">复制</button>
        <button class="gh" onclick="go('/api/proton/token')">${pushToken ? "换一个" : "生成"}</button>
      </div>
      <div class="row" style="margin-top:14px"><span class="k">WireGuard 优选端点推送 URL</span></div>
      <div class="sub">
        <input id="pu_wg" value="${pushUrlWg || "请先在上方生成令牌"}" readonly>
        <button onclick="cp('pu_wg')">复制</button>
      </div>
      <div class="row" style="margin-top:14px"><span class="k">MASQUE 优选端点推送 URL</span></div>
      <div class="sub">
        <input id="pu_ms" value="${pushUrlMs || "请先在上方生成令牌"}" readonly>
        <button onclick="cp('pu_ms')">复制</button>
      </div>
      <div class="note">
        把主地址填进 GitHub 仓库 Secrets 的 <b>WORKER_PUSH_URL</b>；<br>
        WireGuard 优选端点推送链接：<code>WORKER_PUSH_URL/wg</code><br>
        MASQUE 优选端点推送链接：<code>WORKER_PUSH_URL/ms</code><br>
        ${protonCred ? '<br><a href="#" onclick="go(\'/api/proton/clear\');return false" style="color:var(--red)">清除 Proton 凭据</a>' : ""}
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">Windscribe 落地</div>
      ${windInfo ? `
      <div class="row"><span class="k">状态</span><span class="v ok">已注册 ${windInfo.servers} 台</span></div>
      <div class="row"><span class="k">账号</span><span class="v">${windInfo.userId}</span></div>
      ${windUsageTxt ? `<div class="row"><span class="k">本月流量</span><span class="v ${windPct > 90 ? "warn" : "ok"}">${windUsageTxt}</span></div>` : ""}
      ` : `
      <div class="row"><span class="k">状态</span><span class="v warn">未启用</span></div>
      `}
      <div class="note">
        免费额度每月 2GB。通过 GitHub Actions 获取并推送到 <code>WORKER_PUSH_URL/wind</code>。
        ${windInfo ? '<br><a href="#" onclick="go(\'/api/wind/clear\');return false" style="color:var(--red)">清除 Windscribe 账号</a>' : ""}
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">VPN Gate 落地 (开源学术)</div>
      ${vpngate ? `
      <div class="row"><span class="k">状态</span><span class="v ok">在线（抓取到 ${vpngate.totalParsed || vpngate.servers?.length || 0} 台节点，精选覆盖 ${Object.keys(vpngate.regions || {}).length} 个国家/地区）</span></div>
      <div class="row"><span class="k">抓取时间</span><span class="v">${vpngate.fetchedAt ? fmt(new Date(vpngate.fetchedAt)) : "—"}</span></div>
      <div class="row" style="margin-top:14px;align-items:center;cursor:pointer" onclick="toggleVgListExpand(event)">
        <span class="k" style="display:flex;align-items:center;gap:8px">
          <span>VPN Gate 国家/地区选择（自由多选，不限连接数）</span>
          <span class="btn-exp" id="btn_toggle_vg_list" style="padding:2px 8px;font-size:11px">收起列表 ▲</span>
        </span>
        <span class="v ok" id="vg_summary">已勾选 ${activeVgRegions.size} 个国家</span>
      </div>
      <div id="vg_regions_wrapper">
        <div class="switch-grid" style="margin:10px 0;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
          ${Object.values(vpngate.regions || {}).map((item) => {
            const checked = currentVgRegions.includes(item.country);
            return `
            <label class="switch-item" style="cursor:pointer">
              <input type="checkbox" name="vpngate_region" value="${item.country}" ${checked ? "checked" : ""} onchange="updateVgStats()">
              <span style="display:flex;align-items:center;gap:6px;width:100%">
                <span>${item.flag} ${item.country}</span>
                <span style="font-size:10px;color:var(--dim);margin-left:auto">${item.count}台 (${item.maxSpeedMbps}M)</span>
              </span>
            </label>`;
          }).join("")}
        </div>
        <div class="sub" style="margin-bottom:12px">
          <button onclick="saveVpnGateRegions()">应用所选 VPN Gate 地区</button>
          <button class="gh" type="button" onclick="selectVgAsia()">仅日韩亚太</button>
          <button class="gh" type="button" onclick="toggleVgAll(true)">全选</button>
          <button class="gh" type="button" onclick="toggleVgAll(false)">清空</button>
        </div>
      </div>
      <div class="sub">
        <button class="gh" onclick="go('/api/vpngate/refresh')">重新抓取节点</button>
      </div>
      ` : `
      <div class="row"><span class="k">状态</span><span class="v warn">尚未获取节点</span></div>
      <div class="sub">
        <button onclick="go('/api/vpngate/refresh')">立即抓取 VPN Gate 节点</button>
      </div>
      `}
      <div class="note" style="margin-top:10px">
        VPN Gate 由日本筑波大学发起，全球志愿者提供服务。OpenVPN 协议 over WARP，无需单选 IP，直接勾选国家即可畅联。
      </div>
    </div>

    <div class="sec">
      <div class="sec-t">状态</div>
      ${row("上次更新", updated ? `${fmt(updated)}（${ago} 分钟前）` : "尚未生成",
             updated ? (ago > 250 ? "warn" : "ok") : "err")}
      ${row("凭据剩余", leftTxt, left === null ? "" : left <= 0 ? "warn" : "ok")}
      ${row("到期时间", fmt(exp))}
      ${row("当前协议", protocolMode === "wg" ? "WireGuard (AmneziaWG)" : "MASQUE")}
      ${row("WARP 设备", warp.deviceId ? warp.deviceId.slice(0, 8) + "…" : "—")}
      ${row("WARP 注册于", warp.registeredAt ? fmt(new Date(warp.registeredAt)) : "—")}
      ${row("内网地址", warp.ipv4 || "—")}
    </div>

    <div class="sec">
      <div class="sec-t">订阅路径</div>
      <div class="sub">
        <input id="sp" value="${sp.replace(/^\//, "")}" spellcheck="false" placeholder="字母数字和 - _">
        <button onclick="setPath('sp')">保存</button>
      </div>
      <div class="note">改成难猜的字符串，防暴力探测。</div>
    </div>

    <div class="sec">
      <div class="sec-t">修改密码</div>
      <div class="pw">
        <input type="password" id="c0" placeholder="当前密码" autocomplete="current-password">
        <input type="password" id="c1" placeholder="新密码（>= 8）" autocomplete="new-password">
        <input type="password" id="c2" placeholder="确认新密码" autocomplete="new-password">
        <button onclick="setPw()">修改</button>
      </div>
      <div class="note">修改密码后所有旧订阅链接立刻失效。</div>
    </div>

  </div></div>
  <div class="foot">
    Cloudflare Worker ・
    <a href="https://github.com/ustdbus/mihomo-warp">GitHub</a>
  </div>
</div>
<script>
function cp(id){
  const el=document.getElementById(id||'u');
  navigator.clipboard.writeText(el.value).then(
    ()=>say('已复制到剪贴板','var(--mint)'),
    ()=>{el.select();document.execCommand('copy');say('已复制','var(--mint)')});
}
function say(t,c){
  const m=document.getElementById('msg');
  m.textContent='> '+t; m.style.color=c;
  setTimeout(()=>{m.textContent=''},4000);
}
async function post(url,body,okmsg){
  const bs=document.querySelectorAll('button');
  bs.forEach(b=>b.disabled=true);
  say('执行中…','var(--yellow)');
  try{
    const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
                            body:JSON.stringify(body)});
    const j=await r.json();
    if(j.ok){say((j.msg||okmsg)+'，即将刷新','var(--mint)');setTimeout(()=>location.reload(),1400);}
    else{say('失败: '+j.error,'var(--red)');bs.forEach(b=>b.disabled=false);}
  }catch(e){say('失败: '+e.message,'var(--red)');bs.forEach(b=>b.disabled=false);}
}
function saveFeatures(){
  const body = {
    enableOpera: document.getElementById('sw_opera').checked,
    enableProton: document.getElementById('sw_proton').checked,
    enableWarpDirect: document.getElementById('sw_warp').checked,
    enableWind: document.getElementById('sw_wind').checked,
    enableVpnGate: document.getElementById('sw_vpngate').checked,
  };
  post('/api/settings/features', body, '开关已保存并重建');
}

function toggleVgListExpand(e){
  if(e && e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON')) return;
  const wrap = document.getElementById('vg_regions_wrapper');
  const btn = document.getElementById('btn_toggle_vg_list');
  if(!wrap) return;
  const isHidden = (wrap.style.display === 'none');
  wrap.style.display = isHidden ? 'block' : 'none';
  if(btn) btn.textContent = isHidden ? '收起列表 ▲' : '展开列表 ▼';
}

function updateVgStats(){
  const boxes = document.querySelectorAll('input[name="vpngate_region"]:checked');
  const summary = document.getElementById('vg_summary');
  if(summary){
    summary.textContent = '已勾选 ' + boxes.length + ' 个国家';
  }
}

function saveVpnGateRegions(){
  const boxes = document.querySelectorAll('input[name="vpngate_region"]:checked');
  const regions = Array.from(boxes).map(b => b.value);
  if(regions.length === 0){
    if(!confirm("未勾选任何 VPN Gate 国家，确定保存吗？(未勾选将不生成 VPN Gate 落地节点)")) return;
  }
  post('/api/settings/vpngate-regions', { regions: regions }, 'VPN Gate 落地设置已保存并重构配置');
}

function selectVgAsia(){
  const asiaList = ["日本", "韩国", "台湾", "香港", "新加坡", "泰国", "越南", "马来西亚", "印度尼西亚", "菲律宾"];
  document.querySelectorAll('input[name="vpngate_region"]').forEach(b => {
    b.checked = asiaList.includes(b.value);
  });
  updateVgStats();
}

function toggleVgAll(checked){
  document.querySelectorAll('input[name="vpngate_region"]').forEach(b => {
    b.checked = checked;
  });
  updateVgStats();
}

function toggleRegionExpand(reg, e){
  if(e) e.stopPropagation();
  const d = document.getElementById('drawer_' + reg);
  const btn = document.getElementById('btn_exp_' + reg);
  const card = document.getElementById('card_' + reg);
  if(!d) return;
  const isHidden = (d.style.display === 'none' || !d.style.display);
  d.style.display = isHidden ? 'block' : 'none';
  if(btn) btn.textContent = isHidden ? '收起 ▲' : '展开 ▼';
  if(card) card.classList.toggle('open', isHidden);
}

function handleCardClick(e, reg){
  if(e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL' && !e.target.closest('.btn-exp')){
    toggleRegionExpand(reg);
  }
}

function toggleRegionListExpand(e){
  if(e && e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON')) return;
  const wrap = document.getElementById('proton_regions_wrapper');
  const btn = document.getElementById('btn_toggle_list');
  if(!wrap) return;
  const isHidden = (wrap.style.display === 'none');
  wrap.style.display = isHidden ? 'block' : 'none';
  if(btn) btn.textContent = isHidden ? '收起列表 ▲' : '展开列表 ▼';
}

function onServerRadioClick(radio, reg){
  if(radio.dataset.waschecked === 'true'){
    radio.checked = false;
    radio.dataset.waschecked = 'false';
  } else {
    document.querySelectorAll('input[name="proton_server_' + reg + '"]').forEach(r => r.dataset.waschecked = 'false');
    radio.dataset.waschecked = 'true';
  }
  updateRegionUI(reg);
  updateStats();
}

function onRegionMasterChange(reg, checked){
  const radios = document.querySelectorAll('input[name="proton_server_' + reg + '"]');
  if(!checked){
    radios.forEach(r => { r.checked = false; r.dataset.waschecked = 'false'; });
  } else {
    let hasOne = false;
    radios.forEach(r => { if(r.checked) hasOne = true; });
    if(!hasOne && radios.length > 0){
      radios[0].checked = true;
      radios[0].dataset.waschecked = 'true';
    }
  }
  updateRegionUI(reg);
  updateStats();
}

function updateRegionUI(reg){
  const radios = document.querySelectorAll('input[name="proton_server_' + reg + '"]');
  const masterBox = document.querySelector('.region-master-cb[data-region="' + reg + '"]');
  const tag = document.getElementById('tag_' + reg);
  const card = document.getElementById('card_' + reg);
  const total = radios.length;
  let checked = 0;
  radios.forEach(r => { if(r.checked) checked++; });

  if(masterBox){
    masterBox.checked = checked > 0;
    masterBox.indeterminate = false;
  }
  if(tag) tag.textContent = checked + '/' + total + '台';
  if(card) card.classList.toggle('active', checked > 0);
}

function updateStats(){
  const checkedRadios = document.querySelectorAll('input[type="radio"][data-region]:checked');
  const activeRegions = new Set();
  checkedRadios.forEach(r => activeRegions.add(r.getAttribute('data-region')));
  const summary = document.getElementById('proton_summary');
  if(summary){
    summary.textContent = '已勾选 ' + activeRegions.size + ' 个地区 (' + checkedRadios.length + ' 台服务器)';
  }
}

function saveProtonRegions(){
  const boxes = document.querySelectorAll('input[type="radio"][data-region]:checked');
  const servers = Array.from(boxes).map(b => b.value);
  const regions = Array.from(new Set(Array.from(boxes).map(b => b.getAttribute('data-region'))));
  if(servers.length === 0){
    if(!confirm("未勾选任何落地服务器，确定保存吗？(未勾选将不生成 Proton 落地节点)")) return;
  }
  post('/api/settings/proton-regions', { servers: servers, regions: regions }, 'Proton 落地设置已保存并重构配置');
}

function selectProtonAsia(){
  document.querySelectorAll('.region-master-cb').forEach(m => {
    const reg = m.getAttribute('data-region');
    const isAsia = (reg === "日本" || reg === "新加坡");
    const radios = document.querySelectorAll('input[name="proton_server_' + reg + '"]');
    radios.forEach((r, idx) => {
      r.checked = isAsia && (idx === 0);
      r.dataset.waschecked = r.checked ? 'true' : 'false';
    });
    updateRegionUI(reg);
  });
  updateStats();
}

function toggleProtonAll(checked){
  document.querySelectorAll('.region-master-cb').forEach(m => {
    const reg = m.getAttribute('data-region');
    const radios = document.querySelectorAll('input[name="proton_server_' + reg + '"]');
    radios.forEach((r, idx) => {
      r.checked = checked && (idx === 0);
      r.dataset.waschecked = r.checked ? 'true' : 'false';
    });
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
  post('/api/warp/reregister', { protocol: chosen }, 'WARP 设备已按专属协议重新注册');
}
function setPath(id){
  const v=document.getElementById(id||'sp').value.trim();
  if(!v){say('路径不能为空','var(--red)');return;}
  post('/api/sub-path',{path:v},'已保存');
}
function setPw(){
  const c0=document.getElementById('c0').value;
  const c1=document.getElementById('c1').value;
  const c2=document.getElementById('c2').value;
  if(!c0||!c1){say('把三个框都填了','var(--red)');return;}
  if(c1!==c2){say('两次输入不一致','var(--red)');return;}
  if(c1.length<8){say('新密码至少 8 位','var(--red)');return;}
  post('/api/password',{current:c0,password:c1,confirm:c2},'已修改');
}
async function go(p){
  const bs=document.querySelectorAll('button');
  bs.forEach(b=>b.disabled=true);
  say('执行中…','var(--yellow)');
  try{
    const r=await fetch(p,{method:'POST'});
    const j=await r.json();
    if(j.ok){say(j.msg+'，即将刷新','var(--mint)');setTimeout(()=>location.reload(),1200);}
    else{say('失败: '+j.error,'var(--red)');bs.forEach(b=>b.disabled=false);}
  }catch(e){say('失败: '+e.message,'var(--red)');bs.forEach(b=>b.disabled=false);}
}
</script>
</body></html>`;
}
