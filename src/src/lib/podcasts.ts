// Podcasts (v30): lista publicada pelo GitHub Actions (podcasts.json) ou, se faltar, o catálogo do Apple
// Podcasts consultado direto do navegador. Também guarda, neste aparelho, onde cada episódio parou e quais
// servidores de áudio não tocaram (para avisar e pôr os que tocam primeiro).
import { PODCASTS, fold, type PodcastDef, type PodcastLang, type PodcastTab } from "@/data/podcasts";
import { jsonp } from "@/lib/music-catalog";

export interface Episode {
  id: string;
  title: string;
  /** Data ISO. */
  date: string;
  /** Duração em segundos (0 = desconhecida). */
  dur: number;
  /** Endereço do áudio publicado pelo podcast. */
  url: string;
  /** Endereço final do áudio (sem os redirecionamentos de estatística), quando o GitHub conseguiu descobrir. */
  direct?: string;
  desc?: string;
}

export interface Show {
  id: string;
  name: string;
  tab: PodcastTab;
  lang: PodcastLang;
  /** Audiolivro em capítulos (lista do 1º ao último). */
  book?: boolean;
  artist: string;
  art: string;
  /** Página do podcast no Apple Podcasts. */
  link: string;
  episodes: Episode[];
}

export interface PodcastData {
  updatedAt: string | null;
  shows: Show[];
  /** "github" = podcasts.json do site; "catalogo" = consultado agora no navegador. */
  origin: "github" | "catalogo";
}

const TIMEOUT = 9000;
const CACHE_KEY = "podcasts.cache";
const POS_KEY = "podcasts.posicao";
const HOSTS_KEY = "podcasts.servidores";

async function getJson(url: string, ms = TIMEOUT): Promise<unknown> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { credentials: "omit", signal: ctrl.signal, cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    window.clearTimeout(t);
  }
}

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max) : "");
const httpsUrl = (v: unknown) => (typeof v === "string" && /^https?:\/\/[^\s"'<>]+$/i.test(v) ? v.replace(/^http:\/\//i, "https://") : "");

function cleanEpisode(e: Record<string, unknown>): Episode | null {
  const url = httpsUrl(e.url);
  const title = str(e.title, 200);
  if (!url || !title) return null;
  const direct = httpsUrl(e.direct);
  return {
    id: str(e.id, 80) || url,
    title,
    date: str(e.date, 40),
    dur: typeof e.dur === "number" && e.dur > 0 && e.dur < 86400 * 2 ? Math.round(e.dur) : 0,
    url,
    direct: direct && direct !== url ? direct : undefined,
    desc: str(e.desc, 400) || undefined,
  };
}

/** Valida o podcasts.json (vem da internet: tudo é conferido). Só aceita podcasts da lista do site. */
export function parsePodcastJson(raw: unknown): { updatedAt: string | null; shows: Show[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.shows)) return null;
  const defs = new Map(PODCASTS.map((d) => [d.id, d]));
  const shows: Show[] = [];
  for (const item of r.shows.slice(0, 200)) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const id = str(s.id, 80);
    // v33: audiolivros descobertos pelo GitHub (hospedados no anchor, que toca na AVD): trazem a própria aba.
    const autoTab = s.tab === "livros-pt" || s.tab === "livros-outros" ? s.tab : null;
    const autoLang = s.lang === "pt" || s.lang === "en" || s.lang === "es" ? s.lang : "pt";
    const def: Pick<PodcastDef, "id" | "name" | "tab" | "lang" | "book"> | undefined =
      defs.get(id) ?? (/^auto-\d+$/.test(id) && s.auto === true && autoTab ? { id, name: str(s.name, 120) || "Audiolivro", tab: autoTab, lang: autoLang, book: true } : undefined);
    if (!def || shows.some((x) => x.id === def.id)) continue;
    const episodes = (Array.isArray(s.episodes) ? s.episodes : [])
      .slice(0, def.book ? 200 : 60)
      .map((e) => (e && typeof e === "object" ? cleanEpisode(e as Record<string, unknown>) : null))
      .filter((e): e is Episode => !!e);
    if (!episodes.length) continue;
    shows.push({
      id: def.id,
      name: str(s.name, 120) || def.name,
      tab: def.tab,
      lang: def.lang,
      book: def.book,
      artist: str(s.artist, 120),
      art: httpsUrl(s.art),
      link: httpsUrl(s.link),
      episodes,
    });
  }
  return { updatedAt: str(r.updatedAt, 40) || null, shows };
}

/** O podcast do catálogo é o da lista? (mesma regra do script do GitHub Actions) */
export function matchesDef(def: PodcastDef, name: string, artist: string): boolean {
  const n = ` ${fold(name)} `;
  const a = fold(artist);
  return def.match.every((m) => n.includes(` ${fold(m)} `)) && (!def.artist || a.includes(fold(def.artist)));
}

const itunes = async (url: string) => {
  try {
    return await getJson(url);
  } catch {
    return jsonp(url, TIMEOUT);
  }
};

export interface ShowHit {
  collectionId: number;
  name: string;
  artist: string;
  art: string;
  link: string;
  /** Hospedado no Spotify for Creators (anchor): o áudio sai de d3ctxlq1ktw2nl.cloudfront.net. */
  anchor?: boolean;
}

export const ANCHOR_AUDIO_HOST = "d3ctxlq1ktw2nl.cloudfront.net";
const toHit = (r: Record<string, unknown>): ShowHit | null =>
  typeof r.collectionId === "number"
    ? { collectionId: r.collectionId, name: str(r.collectionName, 120), artist: str(r.artistName, 120), art: httpsUrl(r.artworkUrl600) || httpsUrl(r.artworkUrl100), link: httpsUrl(r.collectionViewUrl), anchor: /^https?:\/\/(www\.)?anchor\.fm\/s\//i.test(String(r.feedUrl ?? "")) }
    : null;

/** Busca livre de podcasts no catálogo do Apple Podcasts (aba "Buscar"). */
export async function searchShows(q: string): Promise<ShowHit[]> {
  const found = (await itunes(`https://itunes.apple.com/search?media=podcast&entity=podcast&limit=18&country=BR&term=${encodeURIComponent(q)}`)) as { results?: Record<string, unknown>[] };
  const hits = (found.results ?? []).map(toHit).filter((h): h is ShowHit => !!h && !!h.name);
  // Os hospedados no anchor primeiro: é o servidor que mais toca em rede de empresa.
  return [...hits.filter((h) => h.anchor), ...hits.filter((h) => !h.anchor)];
}

/** Ordem de leitura: do mais antigo (1º capítulo) ao mais novo; empate pela numeração do título. */
export function readingOrder(eps: Episode[]): Episode[] {
  return [...eps].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "pt-BR", { numeric: true }));
}

/** Últimos episódios de um podcast do catálogo (audiolivro: todos, em ordem de leitura). */
export async function episodesOf(collectionId: number, country = "BR", limit = 20, book = false): Promise<Episode[]> {
  const url = (c: string) => `https://itunes.apple.com/lookup?id=${collectionId}&media=podcast&entity=podcastEpisode&limit=${book ? 200 : limit}&country=${c}`;
  let look = (await itunes(url(country))) as { results?: Record<string, unknown>[] };
  if (!look.results?.some((r) => r.wrapperType === "podcastEpisode") && country !== "US") look = (await itunes(url("US"))) as { results?: Record<string, unknown>[] };
  const eps = (look.results ?? [])
    .filter((r) => r.wrapperType === "podcastEpisode")
    .map((r) =>
      cleanEpisode({
        id: String(r.trackId ?? ""),
        title: r.trackName,
        date: r.releaseDate,
        dur: typeof r.trackTimeMillis === "number" ? r.trackTimeMillis / 1000 : 0,
        url: r.episodeUrl,
        desc: r.shortDescription || r.description,
      }),
    )
    .filter((e): e is Episode => !!e)
    .sort((a, b) => b.date.localeCompare(a.date));
  return book ? readingOrder(eps) : eps;
}

/** Busca um podcast da lista no catálogo do Apple Podcasts e os últimos episódios. */
export async function showFromCatalog(def: PodcastDef, limit = 20): Promise<Show | null> {
  const country = def.country ?? "BR";
  if (def.cid) {
    // Programa já conhecido: busca direto pelo código (sem depender do nome).
    const look = (await itunes(`https://itunes.apple.com/lookup?id=${def.cid}&media=podcast&entity=podcast&country=${country}`)) as { results?: Record<string, unknown>[] };
    const hit = (look.results ?? []).map(toHit).find((h) => h && h.collectionId === def.cid);
    const episodes = await episodesOf(def.cid, country, limit, def.book);
    if (!episodes.length) return null;
    return { id: def.id, name: hit?.name || def.name, tab: def.tab, lang: def.lang, book: def.book, artist: hit?.artist ?? "", art: hit?.art ?? "", link: hit?.link || `https://podcasts.apple.com/podcast/id${def.cid}`, episodes };
  }
  const found = (await itunes(`https://itunes.apple.com/search?media=podcast&entity=podcast&limit=15&country=${country}&term=${encodeURIComponent(def.term)}`)) as { results?: Record<string, unknown>[] };
  const hit = (found.results ?? []).map(toHit).find((h) => h && matchesDef(def, h.name, h.artist));
  if (!hit) return null;
  const episodes = await episodesOf(hit.collectionId, country, limit, def.book);
  if (!episodes.length) return null;
  return { id: def.id, name: hit.name || def.name, tab: def.tab, lang: def.lang, book: def.book, artist: hit.artist, art: hit.art, link: hit.link, episodes };
}

export function cachedPodcasts(): PodcastData | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as { origin?: string } | null;
    const p = parsePodcastJson(raw);
    return p && p.shows.length ? { ...p, origin: raw?.origin === "catalogo" ? "catalogo" : "github" } : null;
  } catch {
    return null;
  }
}

function saveCache(d: PodcastData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(d));
  } catch {
    /* cheio: segue sem guardar */
  }
}

// As seções Podcasts e Audiolivros usam a mesma lista: uma carga só, compartilhada.
let inflight: Promise<PodcastData | null> | null = null;
const partialListeners = new Set<(d: PodcastData) => void>();

/** Lê ./podcasts.json; se não existir ou vier vazio, monta a lista pelo catálogo (aos poucos, `onShow`). */
export function loadPodcasts(onShow?: (d: PodcastData) => void): Promise<PodcastData | null> {
  if (onShow) partialListeners.add(onShow);
  if (!inflight) {
    inflight = loadOnce((d) => partialListeners.forEach((f) => f(d))).finally(() => {
      partialListeners.clear();
      window.setTimeout(() => (inflight = null), 1000);
    });
  }
  return inflight;
}

async function loadOnce(onShow?: (d: PodcastData) => void): Promise<PodcastData | null> {
  try {
    const p = parsePodcastJson(await getJson("./podcasts.json"));
    if (p && p.shows.length) {
      const d: PodcastData = { ...p, origin: "github" };
      // v32: o que ainda não está no podcasts.json (ex.: audiolivros novos antes da próxima rodada do GitHub)
      // vem do catálogo do Apple Podcasts agora mesmo, pelo navegador.
      const have = new Set(d.shows.map((s) => s.id));
      const missing = PODCASTS.filter((def) => !have.has(def.id));
      if (!missing.length) {
        saveCache(d);
        return d;
      }
      onShow?.(d);
      const extra = await fromCatalog(missing, (more) => onShow?.({ ...d, shows: sortByList([...d.shows, ...more]) }));
      const merged: PodcastData = { ...d, shows: sortByList([...d.shows, ...extra]) };
      saveCache(merged);
      return merged;
    }
  } catch {
    /* sem arquivo do GitHub: usa o catálogo */
  }
  const shows = await fromCatalog(PODCASTS, (more) => onShow?.({ updatedAt: new Date().toISOString(), shows: sortByList(more), origin: "catalogo" }));
  if (!shows.length) return null;
  const d: PodcastData = { updatedAt: new Date().toISOString(), shows: sortByList(shows), origin: "catalogo" };
  saveCache(d);
  return d;
}

async function fromCatalog(defs: PodcastDef[], onMore?: (shows: Show[]) => void): Promise<Show[]> {
  const shows: Show[] = [];
  const queue = [...defs];
  const worker = async () => {
    for (let def = queue.shift(); def; def = queue.shift()) {
      try {
        const s = await showFromCatalog(def);
        if (s) {
          shows.push(s);
          onMore?.([...shows]);
        }
      } catch {
        /* esse podcast fica de fora desta vez */
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return shows;
}

const ORDER = new Map(PODCASTS.map((d, i) => [d.id, i]));
const sortByList = (shows: Show[]) => [...shows].sort((a, b) => (ORDER.get(a.id) ?? 999) - (ORDER.get(b.id) ?? 999));

// ---- Onde parou cada episódio ----
type Positions = Record<string, { t: number; at: number }>;
const readPos = (): Positions => {
  try {
    return (JSON.parse(localStorage.getItem(POS_KEY) ?? "{}") as Positions) || {};
  } catch {
    return {};
  }
};
export function savedPosition(epId: string): number {
  return readPos()[epId]?.t ?? 0;
}
export function savePosition(epId: string, t: number, dur: number) {
  const all = readPos();
  if (dur && t > dur - 30) delete all[epId];
  else if (t > 15) all[epId] = { t: Math.round(t), at: Date.now() };
  else return;
  const keep = Object.entries(all)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 200);
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    /* sem espaço */
  }
}

// ---- Servidores de áudio que tocam (ou não) neste aparelho ----
export type HostStatus = "ok" | "falhou";
export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};
export function hostStatuses(): Record<string, { s: HostStatus; at: number }> {
  try {
    return JSON.parse(localStorage.getItem(HOSTS_KEY) ?? "{}") || {};
  } catch {
    return {};
  }
}
export function setHostStatus(url: string, s: HostStatus) {
  const h = hostOf(url);
  if (!h) return;
  const all = hostStatuses();
  all[h] = { s, at: Date.now() };
  try {
    localStorage.setItem(HOSTS_KEY, JSON.stringify(all));
  } catch {
    /* sem espaço */
  }
}
/** Situação do episódio neste aparelho: "ok" se algum endereço dele já tocou, "falhou" se todos falharam. */
export function episodeStatus(e: Episode, hosts = hostStatuses()): HostStatus | null {
  const st = urlsOf(e).map((u) => hosts[hostOf(u)]?.s);
  if (st.includes("ok")) return "ok";
  if (st.length && st.every((x) => x === "falhou")) return "falhou";
  return null;
}
/** Endereços para tentar, na ordem: o final (sem redirecionamentos) e o publicado. */
// v32: muitos podcasts passam o áudio por um serviço de estatística (anchor.fm, podtrac, chartable…) antes do
// servidor do arquivo. Em rede de empresa esse serviço costuma ser bloqueado, então tiramos o desvio e vamos
// direto ao arquivo (o endereço final vem escrito dentro do próprio link).
const PREFIXES: RegExp[] = [
  /^https?:\/\/(?:www\.)?dts\.podtrac\.com\/redirect\.[a-z0-9]+\//i,
  /^https?:\/\/(?:www\.)?podtrac\.com\/pts\/redirect\.[a-z0-9]+\//i,
  /^https?:\/\/(?:chrt\.fm|chtbl\.com)\/track\/[^/]+\//i,
  /^https?:\/\/pdst\.fm\/e\//i,
  /^https?:\/\/op3\.dev\/e\/(?:[^/]*,[^/]*\/)?/i,
  /^https?:\/\/(?:pscrb\.fm|verifi\.podscribe\.com)\/rss\/p\//i,
  /^https?:\/\/mgln\.ai\/e\/[^/]+\//i,
  /^https?:\/\/arttrk\.com\/p\/[^/]+\//i,
  /^https?:\/\/clrtpod\.com\/m\//i,
  /^https?:\/\/prfx\.byspotify\.com\/e\//i,
  /^https?:\/\/pfx\.vpixl\.com\/[^/]+\//i,
  /^https?:\/\/(?:www\.)?podtrac\.com\/[^/]+\/redirect\.[a-z0-9]+\//i,
  /^https?:\/\/tracking\.swap\.fm\/track\/[^/]+\//i,
  /^https?:\/\/growx\.podkite\.com\/[^/]+\/[^/]+\//i,
];
export function unwrapAudio(url: string): string {
  let u = url;
  for (let round = 0; round < 6; round++) {
    // anchor.fm (Spotify para criadores): .../podcast/play/123/https%3A%2F%2Fd3ctxlq1ktw2nl.cloudfront.net%2F...
    const anchor = /^https?:\/\/(?:www\.)?anchor\.fm\/.*?\/(https?%3A%2F%2F.+)$/i.exec(u);
    if (anchor) {
      try {
        u = decodeURIComponent(anchor[1]);
        continue;
      } catch {
        break;
      }
    }
    const re = PREFIXES.find((r) => r.test(u));
    if (!re) break;
    const rest = u.replace(re, "");
    u = /^https?:\/\//i.test(rest) ? rest : `https://${rest}`;
  }
  return u.replace(/^http:\/\//i, "https://");
}
/** Endereços a tentar, em ordem: o final descoberto pelo GitHub, o link sem o desvio de estatística e o original. */
export const urlsOf = (e: Episode) => [e.direct, e.url ? unwrapAudio(e.url) : "", e.url].filter((u, i, a): u is string => !!u && a.indexOf(u) === i);

export function formatDur(sec: number): string {
  if (!sec || !isFinite(sec)) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
export function formatClock(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h ? `${h}:` : ""}${h ? String(m).padStart(2, "0") : m}:${String(s).padStart(2, "0")}`;
}
