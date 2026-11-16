// Cyberwave Radio — buscador de músicas (Cloudflare Worker). Gerado a partir de src/worker/musica-worker.ts.

// src/lib/yt-parse.ts
var o = (v) => v && typeof v === "object" ? v : {};
var runsText = (v) => {
  const x = o(v);
  if (typeof x.simpleText === "string") return x.simpleText;
  return Array.isArray(x.runs) ? x.runs.map((r) => String(o(r).text ?? "")).join("") : "";
};
function parseClock(s) {
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : void 0;
}
function findVideoId(v, depth = 0) {
  if (depth > 12 || !v || typeof v !== "object") return void 0;
  const x = v;
  if (typeof x.videoId === "string" && /^[\w-]{11}$/.test(x.videoId)) return x.videoId;
  for (const k of Object.keys(x)) {
    const r = findVideoId(x[k], depth + 1);
    if (r) return r;
  }
  return void 0;
}
function fromVideoRenderer(r) {
  const id = typeof r.videoId === "string" ? r.videoId : "";
  if (!/^[\w-]{11}$/.test(id)) return null;
  const len = runsText(r.lengthText);
  if (!len) return null;
  return { id, title: runsText(r.title), channel: runsText(r.ownerText) || runsText(r.longBylineText) || runsText(r.shortBylineText), duration: parseClock(len) };
}
function fromMusicItem(r) {
  const id = (typeof o(r.playlistItemData).videoId === "string" ? o(r.playlistItemData).videoId : "") || findVideoId(o(r.flexColumns));
  if (!id) return null;
  const cols = Array.isArray(r.flexColumns) ? r.flexColumns.map((c) => o(o(c).musicResponsiveListItemFlexColumnRenderer).text) : [];
  const title = runsText(cols[0]);
  const meta = Array.isArray(o(cols[1]).runs) ? o(cols[1]).runs.map((x) => String(o(x).text ?? "")) : [];
  const parts = meta.filter((t) => t.trim() && t.trim() !== "\u2022");
  let duration;
  for (const p of parts) duration ??= parseClock(p);
  for (const c of Array.isArray(r.fixedColumns) ? r.fixedColumns : []) duration ??= parseClock(runsText(o(o(c).musicResponsiveListItemFixedColumnRenderer).text));
  const kind = parts[0] && /^(m[uú]sica|song|v[ií]deo|video)$/i.test(parts[0].trim()) ? parts.shift().trim() : "";
  const channel = parts[0] ?? "";
  if (!title) return null;
  return { id, title, channel, duration, official: !/^v[ií]deo$/i.test(kind) };
}
function parseYoutubeSearch(data, max = 15) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const walk = (v, depth) => {
    if (out.length >= max || depth > 40 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x2 of v) walk(x2, depth + 1);
      return;
    }
    const x = v;
    let hit = null;
    if (x.videoRenderer) hit = fromVideoRenderer(o(x.videoRenderer));
    else if (x.musicResponsiveListItemRenderer) hit = fromMusicItem(o(x.musicResponsiveListItemRenderer));
    if (hit) {
      if (!seen.has(hit.id)) {
        seen.add(hit.id);
        out.push(hit);
      }
      return;
    }
    for (const k of Object.keys(x)) walk(x[k], depth + 1);
  };
  walk(data, 0);
  return out;
}
function ytInitialDataFromHtml(html) {
  const marks = ["var ytInitialData = ", 'window["ytInitialData"] = ', "ytInitialData = "];
  for (const m of marks) {
    const i = html.indexOf(m);
    if (i < 0) continue;
    const start = i + m.length;
    let depth = 0;
    let inStr = false;
    for (let j = start; j < html.length; j++) {
      const c = html[j];
      if (inStr) {
        if (c === "\\") j++;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try {
          return JSON.parse(html.slice(start, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
var INNERTUBE = {
  music: {
    url: "https://music.youtube.com/youtubei/v1/search?prettyPrint=false",
    body: (q, clientVersion = "1.20251110.01.00") => ({
      context: { client: { clientName: "WEB_REMIX", clientVersion, hl: "pt", gl: "BR" } },
      query: q,
      params: "EgWKAQIIAWoMEA4QChADEAQQCRAF"
      // filtro "Músicas" (o mesmo do ytmusicapi)
    })
  },
  web: {
    url: "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
    body: (q, clientVersion = "2.20251110.00.00") => ({
      context: { client: { clientName: "WEB", clientVersion, hl: "pt", gl: "BR" } },
      query: q,
      params: "EgIQAQ=="
      // só vídeos
    })
  },
  html: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D&hl=pt-BR&gl=BR`
};

// src/worker/musica-worker.ts
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
function allowOrigin(origin, env) {
  if (!origin) return "*";
  const list = (env.ORIGENS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length) return list.includes(origin) ? origin : null;
  return /^https:\/\/[\w-]+\.github\.io$/.test(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : null;
}
async function innertube(kind, q) {
  const cfg = INNERTUBE[kind];
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin: kind === "music" ? "https://music.youtube.com" : "https://www.youtube.com",
      cookie: "SOCS=CAI; CONSENT=YES+"
    },
    body: JSON.stringify(cfg.body(q))
  });
  if (!res.ok) throw new Error(`${kind} ${res.status}`);
  return parseYoutubeSearch(await res.json(), 12);
}
async function htmlSearch(q) {
  const res = await fetch(INNERTUBE.html(q), { headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", cookie: "SOCS=CAI; CONSENT=YES+" } });
  if (!res.ok) throw new Error(`html ${res.status}`);
  return parseYoutubeSearch(ytInitialDataFromHtml(await res.text()), 12);
}
async function buscar(q) {
  const [music, web] = await Promise.allSettled([innertube("music", q), innertube("web", q)]);
  let out = [...music.status === "fulfilled" ? music.value.slice(0, 6) : [], ...web.status === "fulfilled" ? web.value : []];
  if (out.length < 3) out = [...out, ...await htmlSearch(q).catch(() => [])];
  const seen = /* @__PURE__ */ new Set();
  return out.filter((h) => !seen.has(h.id) && seen.add(h.id)).slice(0, 15);
}
var musica_worker_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("origin") ?? "";
    const allowed = allowOrigin(origin, env);
    const cors = { "access-control-allow-origin": allowed ?? "null", "access-control-allow-methods": "GET, OPTIONS", vary: "origin" };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!allowed) return new Response("origem n\xE3o autorizada", { status: 403, headers: cors });
    if (req.method !== "GET") return new Response("m\xE9todo n\xE3o suportado", { status: 405, headers: cors });
    const json = (data, status = 200, maxAge = 0) => new Response(JSON.stringify(data), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store" } });
    if (url.pathname === "/saude") return json({ ok: true });
    const cache = globalThis.caches.default;
    const key = new Request(`https://cache.cyberwave${url.pathname}${url.search}`);
    const hit = await cache.match(key);
    if (hit) {
      const r = new Response(hit.body, hit);
      for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
      return r;
    }
    let res;
    if (url.pathname === "/buscar") {
      const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
      if (!q) return json({ erro: "faltou q" }, 400);
      try {
        res = json(await buscar(q), 200, 21600);
      } catch (e) {
        return json({ erro: String(e) }, 502);
      }
    } else if (url.pathname.startsWith("/deezer/")) {
      const path = url.pathname.slice("/deezer".length);
      if (!/^\/(search|track|album|playlist|artist|chart)(\/|$)/.test(path)) return json({ erro: "caminho n\xE3o permitido" }, 400);
      const up = await fetch(`https://api.deezer.com${path}${url.search}`, { headers: { "user-agent": UA } });
      res = new Response(up.body, { status: up.status, headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=21600" } });
    } else {
      return json({ erro: "use /buscar?q=" }, 404);
    }
    if (res.ok) await cache.put(key, res.clone());
    return res;
  }
};
export {
  musica_worker_default as default
};
