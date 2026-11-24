// Núcleo do buscador de músicas da Cyberwave Radio — o mesmo código roda na Vercel e na Cloudflare.
//
// Faz no servidor o que os extratores nativos fazem no Spotube (NewPipe / youtube_explode / yt-dlp):
// pesquisa no YouTube Music e no YouTube sem chave e devolve só id/título/canal/duração. O som continua
// tocando no player oficial do YouTube dentro do site (nada é baixado nem extraído).
//
//   ?op=saude                                  -> { ok: true, versao }
//   ?op=buscar&q=linkin+park+numb              -> [{ id, title, channel, duration, official }]
//   ?op=lastfm&artist=Linkin+Park&title=Numb   -> { ids: [...] }  (vídeo indicado pelo Last.fm)
//   ?op=deezer&path=/search?q=numb             -> resposta da API pública do Deezer
// Também aceita o formato antigo: /buscar?q=, /saude, /deezer/search?q=.

import { SITE_VERSION } from "../lib/version";
import { INNERTUBE, lastfmTrackUrl, lastfmVideos, parseYoutubeSearch, ytInitialDataFromHtml, type YtHit } from "../lib/yt-parse";

export const VERSAO = SITE_VERSION;

export interface CoreEnv {
  /** Sites autorizados, separados por vírgula (padrão: qualquer *.github.io, *.vercel.app e localhost). */
  ORIGENS?: string;
  /** Chave opcional da YouTube Data API, usada só se a busca sem chave falhar. */
  YOUTUBE_API_KEY?: string;
}

export interface CoreResponse {
  status: number;
  body: string;
  /** Segundos de cache na borda (0 = não guardar). */
  maxAge: number;
  contentType: string;
}

export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const COOKIE = "SOCS=CAI; CONSENT=YES+";

/** Devolve o valor de Access-Control-Allow-Origin, ou null se a origem não for autorizada. */
export function allowOrigin(origin: string, env: CoreEnv): string | null {
  if (!origin) return "*";
  const list = (env.ORIGENS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (list.length) return list.includes(origin) ? origin : null;
  return /^https:\/\/[\w.-]+\.(github\.io|vercel\.app|workers\.dev|pages\.dev)$/.test(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : null;
}

export async function timed(url: string, init: RequestInit, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Busca no YouTube Music ("music", aba Músicas) ou no YouTube ("web", só vídeos) pelo InnerTube. */
export async function innertube(kind: "music" | "web", q: string, ms = 5000): Promise<YtHit[]> {
  const cfg = INNERTUBE[kind];
  const res = await timed(cfg.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin: kind === "music" ? "https://music.youtube.com" : "https://www.youtube.com",
      cookie: COOKIE,
    },
    body: JSON.stringify(cfg.body(q)),
  }, ms);
  if (!res.ok) throw new Error(`${kind} ${res.status}`);
  return parseYoutubeSearch(await res.json(), 12);
}

async function htmlSearch(q: string, ms = 5000): Promise<YtHit[]> {
  const res = await timed(INNERTUBE.html(q), { headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", cookie: COOKIE } }, ms);
  if (!res.ok) throw new Error(`html ${res.status}`);
  return parseYoutubeSearch(ytInitialDataFromHtml(await res.text()), 12);
}

async function apiSearch(q: string, key: string, ms = 4000): Promise<YtHit[]> {
  const p = new URLSearchParams({ part: "snippet", type: "video", videoEmbeddable: "true", maxResults: "10", q, key, regionCode: "BR" });
  const res = await timed(`https://www.googleapis.com/youtube/v3/search?${p}`, {}, ms);
  if (!res.ok) throw new Error(`api ${res.status}`);
  const data = (await res.json()) as { items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[] };
  return (data.items ?? []).filter((i) => i.id?.videoId).map((i) => ({ id: i.id!.videoId!, title: i.snippet?.title ?? "", channel: i.snippet?.channelTitle ?? "" }));
}

/** Tempo total de uma busca no servidor (o plano gratuito da Vercel corta funções lentas). */
const DEADLINE = 8500;

export async function buscar(q: string, env: CoreEnv): Promise<YtHit[]> {
  const t0 = Date.now();
  const left = () => DEADLINE - (Date.now() - t0);
  // Como o Spotube: primeiro a aba "Músicas" do YouTube Music (áudio oficial), depois vídeos.
  const [music, web] = await Promise.allSettled([innertube("music", q), innertube("web", q)]);
  let out = [...(music.status === "fulfilled" ? music.value.slice(0, 6) : []), ...(web.status === "fulfilled" ? web.value : [])];
  if (out.length < 3 && left() > 1500) out = [...out, ...(await htmlSearch(q, left() - 500).catch(() => []))];
  if (!out.length && env.YOUTUBE_API_KEY && left() > 1000) out = await apiSearch(q, env.YOUTUBE_API_KEY, left() - 300).catch(() => []);
  const seen = new Set<string>();
  return out.filter((h) => !seen.has(h.id) && seen.add(h.id)).slice(0, 15);
}

const simple = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export async function lastfm(artist: string, title: string): Promise<string[]> {
  const res = await timed(lastfmTrackUrl(artist, title), { headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" } }, 7000);
  if (!res.ok) throw new Error(`lastfm ${res.status}`);
  const vids = lastfmVideos(await res.text());
  // O primeiro vídeo da página é o da própria faixa; os demais são de faixas parecidas.
  const exact = vids.filter((v) => !v.track || simple(v.track) === simple(title));
  return (exact.length ? exact : vids.slice(0, 1)).map((v) => v.id).slice(0, 3);
}

const json = (data: unknown, status = 200, maxAge = 0): CoreResponse => ({ status, body: JSON.stringify(data), maxAge, contentType: "application/json; charset=utf-8" });

/** Atende um pedido já autorizado. `url` é o endereço completo do pedido. */
export async function handle(url: URL, env: CoreEnv): Promise<CoreResponse> {
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
    if (target.hostname !== "api.deezer.com" || !/^\/(search|track|album|playlist|artist|chart)(\/|$)/.test(target.pathname)) return json({ erro: "caminho não permitido" }, 400);
    const up = await timed(target.toString(), { headers: { "user-agent": UA } });
    return { status: up.status, body: await up.text(), maxAge: up.ok ? 21600 : 0, contentType: "application/json; charset=utf-8" };
  }

  return json({ erro: "use ?op=buscar&q=..." }, 404);
}
