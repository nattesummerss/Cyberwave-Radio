// Cyberwave Radio — buscador de músicas (função da Vercel). Gerado a partir de src/worker/.
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/worker/musica-vercel.ts
var musica_vercel_exports = {};
__export(musica_vercel_exports, {
  default: () => handler
});
module.exports = __toCommonJS(musica_vercel_exports);

// src/lib/version.ts
var SITE_VERSION = "v42";

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
function lastfmTrackUrl(artist, title) {
  const part = (s) => encodeURIComponent(s.trim()).replace(/%20/g, "+");
  return `https://www.last.fm/music/${part(artist)}/_/${part(title)}`;
}
var unescapeHtml = (s) => s?.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
function lastfmVideos(html) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const m of html.matchAll(/<[a-z]+\b[^>]*\bdata-youtube-id="([\w-]{11})"[^>]*>/gi)) {
    const tag = m[0];
    const attr = (n) => unescapeHtml(tag.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1]);
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ id: m[1], track: attr("data-track-name"), artist: attr("data-artist-name") });
  }
  return out;
}
function clientVersion(prefix, suffix) {
  const d = new Date(Date.now() - 5 * 864e5);
  return `${prefix}.${d.toISOString().slice(0, 10).replace(/-/g, "")}.${suffix}`;
}
var INNERTUBE = {
  music: {
    url: "https://music.youtube.com/youtubei/v1/search?prettyPrint=false",
    body: (q, version = clientVersion("1", "01.00")) => ({
      context: { client: { clientName: "WEB_REMIX", clientVersion: version, hl: "pt", gl: "BR" } },
      query: q,
      params: "EgWKAQIIAWoMEA4QChADEAQQCRAF"
      // filtro "Músicas" (o mesmo do ytmusicapi)
    })
  },
  web: {
    url: "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
    body: (q, version = clientVersion("2", "00.00")) => ({
      context: { client: { clientName: "WEB", clientVersion: version, hl: "pt", gl: "BR" } },
      query: q,
      params: "EgIQAQ=="
      // só vídeos
    })
  },
  html: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D&hl=pt-BR&gl=BR&ucbcb=1`
};

// src/worker/musica-core.ts
var VERSAO = SITE_VERSION;
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
var COOKIE = "SOCS=CAI; CONSENT=YES+";
function allowOrigin(origin, env) {
  if (!origin) return "*";
  const list = (env.ORIGENS ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
  if (list.length) return list.includes(origin) ? origin : null;
  return /^https:\/\/[\w.-]+\.(github\.io|vercel\.app|workers\.dev|pages\.dev)$/.test(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : null;
}
async function timed(url, init, ms = 8e3) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
async function innertube(kind, q, ms = 5e3) {
  const cfg = INNERTUBE[kind];
  const res = await timed(cfg.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin: kind === "music" ? "https://music.youtube.com" : "https://www.youtube.com",
      cookie: COOKIE
    },
    body: JSON.stringify(cfg.body(q))
  }, ms);
  if (!res.ok) throw new Error(`${kind} ${res.status}`);
  return parseYoutubeSearch(await res.json(), 12);
}
async function htmlSearch(q, ms = 5e3) {
  const res = await timed(INNERTUBE.html(q), { headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", cookie: COOKIE } }, ms);
  if (!res.ok) throw new Error(`html ${res.status}`);
  return parseYoutubeSearch(ytInitialDataFromHtml(await res.text()), 12);
}
async function apiSearch(q, key, ms = 4e3) {
  const p = new URLSearchParams({ part: "snippet", type: "video", videoEmbeddable: "true", maxResults: "10", q, key, regionCode: "BR" });
  const res = await timed(`https://www.googleapis.com/youtube/v3/search?${p}`, {}, ms);
  if (!res.ok) throw new Error(`api ${res.status}`);
  const data = await res.json();
  return (data.items ?? []).filter((i) => i.id?.videoId).map((i) => ({ id: i.id.videoId, title: i.snippet?.title ?? "", channel: i.snippet?.channelTitle ?? "" }));
}
var DEADLINE = 8500;
async function buscar(q, env) {
  const t0 = Date.now();
  const left = () => DEADLINE - (Date.now() - t0);
  const [music, web] = await Promise.allSettled([innertube("music", q), innertube("web", q)]);
  let out = [...music.status === "fulfilled" ? music.value.slice(0, 6) : [], ...web.status === "fulfilled" ? web.value : []];
  if (out.length < 3 && left() > 1500) out = [...out, ...await htmlSearch(q, left() - 500).catch(() => [])];
  if (!out.length && env.YOUTUBE_API_KEY && left() > 1e3) out = await apiSearch(q, env.YOUTUBE_API_KEY, left() - 300).catch(() => []);
  const seen = /* @__PURE__ */ new Set();
  return out.filter((h) => !seen.has(h.id) && seen.add(h.id)).slice(0, 15);
}
var simple = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
async function lastfm(artist, title) {
  const res = await timed(lastfmTrackUrl(artist, title), { headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" } }, 7e3);
  if (!res.ok) throw new Error(`lastfm ${res.status}`);
  const vids = lastfmVideos(await res.text());
  const exact = vids.filter((v) => !v.track || simple(v.track) === simple(title));
  return (exact.length ? exact : vids.slice(0, 1)).map((v) => v.id).slice(0, 3);
}
var json = (data, status = 200, maxAge = 0) => ({ status, body: JSON.stringify(data), maxAge, contentType: "application/json; charset=utf-8" });
async function handle(url, env) {
  const path = url.pathname.replace(/\/+$/, "");
  const op = url.searchParams.get("op") ?? (path.endsWith("/buscar") ? "buscar" : path.endsWith("/saude") ? "saude" : path.includes("/deezer/") ? "deezer" : "");
  if (op === "saude") return json({ ok: true, versao: VERSAO });
  if (op === "buscar") {
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
    if (!q) return json({ erro: "faltou q" }, 400);
    try {
      const hits = await buscar(q, env);
      return json(hits, hits.length ? 200 : 502, hits.length ? 21600 : 0);
    } catch (e) {
      return json({ erro: String(e) }, 502);
    }
  }
  if (op === "lastfm") {
    const artist = (url.searchParams.get("artist") ?? "").trim().slice(0, 120);
    const title = (url.searchParams.get("title") ?? "").trim().slice(0, 160);
    if (!artist || !title) return json({ erro: "faltou artist/title" }, 400);
    try {
      const ids = await lastfm(artist, title);
      return json({ ids }, 200, ids.length ? 86400 : 3600);
    } catch (e) {
      return json({ erro: String(e) }, 502);
    }
  }
  if (op === "deezer") {
    const raw = url.searchParams.get("path") ?? path.slice(path.indexOf("/deezer") + "/deezer".length) + url.search;
    const target = new URL(raw.startsWith("/") ? raw : `/${raw}`, "https://api.deezer.com");
    target.searchParams.delete("op");
    target.searchParams.delete("path");
    if (target.hostname !== "api.deezer.com" || !/^\/(search|track|album|playlist|artist|chart)(\/|$)/.test(target.pathname)) return json({ erro: "caminho n\xE3o permitido" }, 400);
    const up = await timed(target.toString(), { headers: { "user-agent": UA } });
    return { status: up.status, body: await up.text(), maxAge: up.ok ? 21600 : 0, contentType: "application/json; charset=utf-8" };
  }
  return json({ erro: "use ?op=buscar&q=..." }, 404);
}

// src/worker/musica-vercel.ts
var header = (req, name) => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
};
async function handler(req, res) {
  const env = { ORIGENS: process.env.ORIGENS, YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY };
  const allowed = allowOrigin(header(req, "origin"), env);
  res.setHeader("access-control-allow-origin", allowed ?? "null");
  res.setHeader("access-control-allow-methods", "GET, OPTIONS");
  res.setHeader("vary", "origin");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (!allowed) {
    res.statusCode = 403;
    res.setHeader("cache-control", "no-store");
    res.end("origem n\xE3o autorizada");
    return;
  }
  const url = new URL(req.url ?? "/", `https://${header(req, "host") || "localhost"}`);
  try {
    const out = await handle(url, env);
    res.statusCode = out.status;
    res.setHeader("content-type", out.contentType);
    res.setHeader("cache-control", out.maxAge && out.status === 200 ? `public, max-age=600, s-maxage=${out.maxAge}, stale-while-revalidate=86400` : "no-store");
    res.end(out.body);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ erro: String(e) }));
  }
}
module.exports = module.exports.default || module.exports;
