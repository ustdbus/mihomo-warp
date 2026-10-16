// Opera VPN over Cloudflare WARP (WireGuard / MASQUE) —— Worker 版
//
// 部署只需要绑一个 KV，密码和订阅路径都在界面上设，不用 cron。
//
// 职责:
//   1. 订阅被访问时按需重建：Opera 凭据没过期就直接给缓存，
//      过期了才重新注册。凭据有效期 4 小时（opera-proxy 的 -refresh 默认值）
//   2. WARP 注册信息存 KV 复用，二选一协议专属注册
//   3. 首次访问引导设密码，之后订阅路径、改密码、功能开关都在界面里做
import { registerWarp } from "./warp.js";
import { fetchOpera } from "./opera.js";
import { buildConfig, parseCustomEndpoints } from "./config.js";
import { parseBlob } from "./proton.js";
import { fetchWindscribe, fetchSession } from "./windscribe.js";
import { renderUI, renderLogin, renderSetup, renderNoKV } from "./ui.js";
import {
  safeEqual, makeCred, checkPassword, signToken, verifyToken,
  readCookie, rateLimit, clearRateLimit, normalizePath,
} from "./auth.js";

const K_WARP = "warp:device";     // WARP 注册信息，长期复用
const K_CFG = "config:yaml";      // 聚合配置
const K_STATE = "state:meta";     // 状态元数据，给 UI 用
const K_CRED = "auth:cred";       // 密码哈希 + 盐
const K_SET = "settings";         // 订阅路径及开关设置
const K_CLAIM = "auth:claim";     // 初始化时的抢占标记
const K_PROTON = "proton:cred";   // Proton 凭据（由流水线推送）
const K_PUSH = "proton:token";    // 流水线的写入令牌
const K_WIND = "wind:account";    // Windscribe 账号，长期复用
const K_LOCK = "rebuild:lock";    // 重建锁，防并发重复注册
const K_CUSTOM_WG = "custom:endpoints_wg"; // 自选 WireGuard 优选 IP
const K_CUSTOM_MS = "custom:endpoints_ms"; // 自选 MASQUE 优选 IP
const COOKIE = "om_session";
const DEFAULT_SUB = "sub";

const TTL_MS = 4 * 3600 * 1000;
const SKEW_MS = 10 * 60 * 1000;

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const html = (body, s = 200) =>
  new Response(body, {
    status: s,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const notFound = () => new Response("Not Found", { status: 404 });

async function getSettings(env) {
  const s = (await env.KV.get(K_SET, "json")) || {};
  return {
    subPath: s.subPath || DEFAULT_SUB,
    protocolMode: s.protocolMode || "wg",
    enableOpera: s.enableOpera ?? true,
    enableProton: s.enableProton ?? true,
    enableWarpDirect: s.enableWarpDirect ?? true,
    enableWind: s.enableWind ?? true,
  };
}

/** 拿 WARP 设备信息。若协议不匹配或强制刷新则重新注册。 */
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

/** 重建配置。*/
async function rebuild(env, { forceWarp = false, newProtocol = null } = {}) {
  let settings = await getSettings(env);
  if (newProtocol && newProtocol !== settings.protocolMode) {
    settings = { ...settings, protocolMode: newProtocol };
    const curRaw = (await env.KV.get(K_SET, "json")) || {};
    await env.KV.put(K_SET, JSON.stringify({ ...curRaw, protocolMode: newProtocol }));
  }

  const protocolMode = settings.protocolMode || "wg";
  const warp = await getWarp(env, forceWarp, protocolMode);

  // 关键：若 settings.enableOpera === false，完全不调用 fetchOpera()，避免刷请求
  let opera = { landings: [] };
  if (settings.enableOpera !== false) {
    opera = await fetchOpera();
  }

  let proton = null;
  if (settings.enableProton !== false) {
    const pc = await env.KV.get(K_PROTON, "json");
    if (pc && (!pc.expiresAt || pc.expiresAt * 1000 > Date.now())) proton = pc;
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
    },
    stats: {
      entries: cfg.entries,
      wgEntries: cfg.wgEntries,
      msEntries: cfg.msEntries,
      landings: cfg.landings,
      combos: cfg.combos,
      proton: cfg.proton || 0,
      wind: cfg.wind || 0,
    },
    protonExpiresAt: proton ? proton.expiresAt : null,
    wind: wind ? { userId: wind.account.userId, servers: cfg.wind || 0 } : null,
    windErr,
    warp: {
      protocol: warp.protocol || protocolMode,
      deviceId: warp.deviceId,
      ipv4: warp.ipv4,
      ipv6: warp.ipv6,
      registeredAt: warp.registeredAt,
    },
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
  if (lock && Date.now() - Number(lock) < 90000) {
    if (yaml) return yaml;
  } else {
    await env.KV.put(K_LOCK, String(Date.now()), { expirationTtl: 120 });
    try {
      await rebuild(env);
    } finally {
      await env.KV.delete(K_LOCK);
    }
  }
  return (await env.KV.get(K_CFG)) || yaml;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const ip = req.headers.get("cf-connecting-ip") || "unknown";

    if (!env || !env.KV) return html(renderNoKV(), 500);

    const cred = await env.KV.get(K_CRED, "json");
    const authed = cred && (await verifyToken(cred, readCookie(req, COOKIE)));

    // 首次初始化
    if (!cred) {
      if (path === "/api/setup" && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        const pw = String(body.password || "");
        if (pw.length < 8) return json({ ok: false, error: "密码至少 8 位" }, 400);
        if (pw !== body.confirm) return json({ ok: false, error: "两次输入不一致" }, 400);

        const claim = crypto.randomUUID();
        if (await env.KV.get(K_CRED)) {
          return json({ ok: false, error: "密码已被设置，请刷新页面" }, 409);
        }
        await env.KV.put(K_CLAIM, claim, { expirationTtl: 60 });
        if ((await env.KV.get(K_CLAIM)) !== claim) {
          return json({ ok: false, error: "密码已被设置，请刷新页面" }, 409);
        }

        const c = await makeCred(pw);
        if (await env.KV.get(K_CRED)) {
          return json({ ok: false, error: "密码已被设置，请刷新页面" }, 409);
        }
        await env.KV.put(K_CRED, JSON.stringify(c));
        await env.KV.delete(K_CLAIM);
        const token = await signToken(c);
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; ` +
                          `SameSite=Lax; Max-Age=${7 * 24 * 3600}`,
          },
        });
      }
      if (path === "/") return html(renderSetup());
      return notFound();
    }

    const settings = await getSettings(env);
    const subPath = "/" + settings.subPath;

    // 订阅链接
    if (path === subPath) {
      const t = url.searchParams.get("token") || "";
      if (!(await verifyToken(cred, t)) && !authed) return notFound();

      const yaml = await ensureConfig(env);
      if (!yaml) {
        return new Response("配置生成失败，稍后重试或到管理页手动刷新",
          { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      return new Response(yaml, {
        headers: {
          "content-type": "text/yaml; charset=utf-8",
          "content-disposition": "attachment; filename=opera-masque.yaml",
          "profile-update-interval": "4",
          "cache-control": "no-store",
        },
      });
    }

    // 流水线与自选端点推送
    if (path.startsWith("/push/") && req.method === "POST") {
      const tk = await env.KV.get(K_PUSH);
      const rest = path.slice(6);
      const slash = rest.indexOf("/");
      const got = slash < 0 ? rest : rest.slice(0, slash);
      const kind = slash < 0 ? "proton" : rest.slice(slash + 1);
      if (!tk || !got || !safeEqual(got, tk)) return notFound();

      const body = await req.text();

      // 推送 WireGuard 自选端点
      if (kind === "wg") {
        await env.KV.put(K_CUSTOM_WG, body);
        try {
          const st = await rebuild(env);
          return json({ ok: true, msg: "已更新 WireGuard 优选端点", entries: st.stats.entries });
        } catch (e) {
          return json({ ok: true, msg: "WireGuard 端点已写入，但重建配置失败：" + e.message });
        }
      }

      // 推送 MASQUE 自选端点
      if (kind === "ms") {
        await env.KV.put(K_CUSTOM_MS, body);
        try {
          const st = await rebuild(env);
          return json({ ok: true, msg: "已更新 MASQUE 优选端点", entries: st.stats.entries });
        } catch (e) {
          return json({ ok: true, msg: "MASQUE 端点已写入，但重建配置失败：" + e.message });
        }
      }

      // 推送 Windscribe 账号
      if (kind === "wind") {
        let acc;
        try {
          acc = JSON.parse(body);
        } catch {
          return json({ ok: false, error: "不是合法的 JSON" }, 400);
        }
        if (!acc || !acc.sessionAuthHash || !acc.locHash) {
          return json({ ok: false, error: "缺 sessionAuthHash 或 locHash" }, 400);
        }
        if (acc.status !== undefined && acc.status !== 1) {
          return json({ ok: false, error: `账号 status=${acc.status}，是被降额的号，没法用` }, 400);
        }
        await env.KV.put(K_WIND, JSON.stringify(acc));
        try {
          const st = await rebuild(env);
          return json({ ok: true, msg: `已写入 Windscribe 账号，${st.stats.wind} 台落地` });
        } catch (e) {
          return json({ ok: true, msg: "账号已写入，但重建配置失败：" + e.message });
        }
      }

      // 默认推送 Proton 凭据
      let parsed;
      try {
        parsed = parseBlob(body);
      } catch (e) {
        return json({ ok: false, error: e.message }, 400);
      }
      await env.KV.put(K_PROTON, JSON.stringify(parsed));
      try {
        const st = await rebuild(env);
        return json({ ok: true, msg: `已写入 ${parsed.servers.length} 台 Proton 落地`,
                      combos: st.stats.combos, proton: st.stats.proton });
      } catch (e) {
        return json({ ok: true, msg: "凭据已写入，但重建配置失败：" + e.message });
      }
    }

    // 登录
    if (path === "/login" && req.method === "POST") {
      if (!(await rateLimit(env, ip))) {
        return json({ ok: false, error: "尝试过多，15 分钟后再试" }, 429);
      }
      const body = await req.json().catch(() => ({}));
      if (!(await checkPassword(cred, String(body.password || "")))) {
        return json({ ok: false, error: "密码错误" }, 401);
      }
      await clearRateLimit(env, ip);
      const token = await signToken(cred);
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; ` +
                        `SameSite=Lax; Max-Age=${7 * 24 * 3600}`,
        },
      });
    }

    if (path === "/logout") {
      return new Response(null, {
        status: 302,
        headers: {
          location: "/",
          "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
        },
      });
    }

    // 首页
    if (path === "/") {
      if (!authed) return html(renderLogin());
      const state = await env.KV.get(K_STATE, "json");
      const token = await signToken(cred);
      const pushToken = await env.KV.get(K_PUSH);
      const protonCred = await env.KV.get(K_PROTON, "json");
      let windUsage = null;
      const wa = await env.KV.get(K_WIND, "json");
      if (wa && wa.sessionAuthHash) {
        try { windUsage = await fetchSession(wa); } catch { windUsage = null; }
      }
      return html(renderUI(state, url.host, subPath, token, cred,
                           pushToken, protonCred, windUsage, settings));
    }

    // 以下均需要认证
    if (!authed) return notFound();

    if (path === "/api/state") {
      return json((await env.KV.get(K_STATE, "json")) || {});
    }

    // 节点开关配置
    if (path === "/api/settings/features" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const cur = await getSettings(env);
      const updated = {
        ...cur,
        enableOpera: body.enableOpera !== undefined ? Boolean(body.enableOpera) : cur.enableOpera,
        enableProton: body.enableProton !== undefined ? Boolean(body.enableProton) : cur.enableProton,
        enableWarpDirect: body.enableWarpDirect !== undefined ? Boolean(body.enableWarpDirect) : cur.enableWarpDirect,
        enableWind: body.enableWind !== undefined ? Boolean(body.enableWind) : cur.enableWind,
      };
      await env.KV.put(K_SET, JSON.stringify(updated));
      try {
        const s = await rebuild(env);
        return json({ ok: true, msg: "节点开关已保存并重建配置", stats: s.stats });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // 重新生成流水线的写入令牌
    if (path === "/api/proton/token" && req.method === "POST") {
      const t = crypto.randomUUID().replace(/-/g, "") +
                crypto.randomUUID().replace(/-/g, "");
      await env.KV.put(K_PUSH, t);
      return json({ ok: true, token: t, msg: "令牌已更新，旧的立即失效" });
    }

    // 清掉 Proton 凭据
    if (path === "/api/proton/clear" && req.method === "POST") {
      await env.KV.delete(K_PROTON);
      try {
        await rebuild(env);
      } catch { /* ignore */ }
      return json({ ok: true, msg: "Proton 凭据已清除" });
    }

    // 改订阅路径
    if (path === "/api/sub-path" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const p = normalizePath(body.path);
      if (!p) {
        return json({
          ok: false,
          error: "只能用字母数字和 - _，1-64 位，且不能是 login/logout/api/setup",
        }, 400);
      }
      await env.KV.put(K_SET, JSON.stringify({ ...settings, subPath: p }));
      return json({ ok: true, msg: `订阅路径已改为 /${p}` });
    }

    // 改密码
    if (path === "/api/password" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (!(await checkPassword(cred, String(body.current || "")))) {
        return json({ ok: false, error: "当前密码不对" }, 401);
      }
      const pw = String(body.password || "");
      if (pw.length < 8) return json({ ok: false, error: "新密码至少 8 位" }, 400);
      if (pw !== body.confirm) return json({ ok: false, error: "两次输入不一致" }, 400);

      const c = await makeCred(pw);
      await env.KV.put(K_CRED, JSON.stringify(c));
      const token = await signToken(c);
      return new Response(
        JSON.stringify({ ok: true, msg: "密码已改，旧的订阅链接全部失效" }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; ` +
                          `SameSite=Lax; Max-Age=${7 * 24 * 3600}`,
          },
        });
    }

    // 刷新 Opera 凭据
    if (path === "/api/refresh" && req.method === "POST") {
      try {
        const s = await rebuild(env);
        return json({ ok: true, msg: `已刷新，${s.stats.combos} 个组合` });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // 重注册 WARP 设备 / 切换专属协议
    if ((path === "/api/warp/reregister" || path === "/api/reset-warp") && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const cur = await getSettings(env);
      const protocol = (body.protocol === "masque" || body.protocol === "wg")
        ? body.protocol
        : cur.protocolMode || "wg";
      try {
        const s = await rebuild(env, { forceWarp: true, newProtocol: protocol });
        return json({ ok: true, msg: `WARP (${protocol === "masque" ? "MASQUE" : "WireGuard"}) 已重注册，${s.stats.combos} 个组合` });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // 清掉 Windscribe 账号
    if (path === "/api/wind/clear" && req.method === "POST") {
      await env.KV.delete(K_WIND);
      try {
        await rebuild(env);
      } catch { /* ignore */ }
      return json({ ok: true, msg: "已清除，重跑一次流水线拿新账号" });
    }

    return notFound();
  },
};
