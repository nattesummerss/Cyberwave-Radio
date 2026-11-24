// Manchetes para a apresentadora I.A.
//
// Caminho principal: o GitHub busca as manchetes a cada 15 minutos
// (.github/workflows/noticias.yml) e publica o arquivo noticias.json junto com o site.
//
// Plano B (conexão direta): se esse arquivo não existir, vier vazio, estiver desatualizado
// ou se alguma fonte falhou no GitHub, o próprio navegador busca os feeds dessas fontes pelo
// serviço público rss2json.com (os sites de notícia não deixam o navegador ler o feed direto).
// O resultado fica guardado por 15 minutos para não repetir as consultas.
//
// Tudo o que vem de fora é texto de terceiros: é mostrado como texto simples e os links
// passam pelo safeUrl.

import { useQuery } from "@tanstack/react-query";
import { safeUrl } from "@/lib/safe-url";

export interface NewsItem {
  id: string;
  source: string;
  sourceName: string;
  lang: "pt" | "en";
  title: string;
  link: string;
  publishedAt: number | null;
  breaking: boolean;
  /** Texto que a apresentadora fala (gerado junto com o arquivo noticias.json). */
  speech?: string;
  /** Fala gravada em MP3 com a voz neural (pasta voz/ do site). */
  audio?: string;
}

/** Situação do arquivo noticias.json publicado pelo GitHub. */
export type SiteFileState = "ok" | "vazio" | "antigo" | "ausente";

export interface NewsSourceStatus {
  id: string;
  name: string;
  ok: boolean;
  count: number;
  /** De onde vieram as manchetes desta fonte. */
  via: "github" | "direto" | null;
  error: string;
}

export interface NewsFeed {
  updatedAt: number | null;
  sourcesOk: number;
  sourcesTotal: number;
  items: NewsItem[];
  sources: NewsSourceStatus[];
  site: { state: SiteFileState; updatedAt: number | null; error: string };
  /** true quando alguma fonte veio pela conexão direta. */
  direct: boolean;
}

interface SourceDef {
  id: string;
  name: string;
  lang: "pt" | "en";
  maxAgeDays: number;
  urls: string[];
}

const gnews = (query: string, lang: "pt" | "en") =>
  lang === "en"
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

/** As mesmas fontes do arquivo .github/workflows/noticias.yml (manter as duas listas iguais). */
export const NEWS_SOURCES: SourceDef[] = [
  {
    id: "cnn",
    name: "CNN Brasil",
    lang: "pt",
    maxAgeDays: 3,
    urls: ["https://www.cnnbrasil.com.br/internacional/feed/", "https://www.cnnbrasil.com.br/feed/", gnews("site:cnnbrasil.com.br when:2d", "pt")],
  },
  { id: "bbc", name: "BBC News Brasil", lang: "pt", maxAgeDays: 3, urls: ["https://feeds.bbci.co.uk/portuguese/rss.xml"] },
  {
    id: "fox",
    name: "Fox News",
    lang: "en",
    maxAgeDays: 3,
    urls: ["https://moxie.foxnews.com/google-publisher/world.xml", "https://moxie.foxnews.com/google-publisher/latest.xml", gnews("site:foxnews.com when:2d", "en")],
  },
  {
    id: "oeste",
    name: "Revista Oeste",
    lang: "pt",
    maxAgeDays: 3,
    urls: ["https://revistaoeste.com/mundo/feed/", "https://revistaoeste.com/feed/", gnews("site:revistaoeste.com when:2d", "pt")],
  },
  { id: "ancapsu", name: "Ancapsu", lang: "pt", maxAgeDays: 14, urls: ["https://www.youtube.com/feeds/videos.xml?channel_id=UCLTWPE7XrHEe8m_xAmNbQ-Q"] },
];

const NEWS_URL = "./noticias.json";
const REFRESH_MS = 5 * 60_000;
/** Arquivo do GitHub mais velho que isso = o agendamento parou; usa a conexão direta. */
const SITE_STALE_MS = 3 * 60 * 60_000;
const DIRECT_API = "https://api.rss2json.com/v1/api.json?rss_url=";
const DIRECT_CACHE_KEY = "radio.noticias-direto";
const DIRECT_CACHE_MS = 15 * 60_000;
const DIRECT_TIMEOUT_MS = 12_000;
const PER_SOURCE = 8;
/** Plantão: manchete marcada como urgente pela fonte e publicada nas últimas 12 horas. */
export const URGENT_WINDOW_MS = 12 * 60 * 60_000;
const BREAKING = /(^|[^\p{L}\p{N}])(urgente|plant[aã]o|[uú]ltima hora|ao vivo|alerta|breaking|live updates?|just in|developing)(?=$|[^\p{L}\p{N}])/iu;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function cleanItem(r: unknown): NewsItem | null {
  const it = obj(r);
  if (!it) return null;
  const title = str(it.title, 280);
  const rawLink = str(it.link, 600);
  const link = /^https?:\/\//i.test(rawLink) ? safeUrl(rawLink) : undefined;
  const sourceName = str(it.sourceName, 40);
  if (!title || !link || !sourceName) return null;
  const at = typeof it.publishedAt === "number" && Number.isFinite(it.publishedAt) ? it.publishedAt : null;
  return {
    id: link,
    source: str(it.source, 20) || sourceName.toLowerCase(),
    sourceName,
    lang: it.lang === "en" ? "en" : "pt",
    title,
    link,
    publishedAt: at,
    breaking: it.breaking === true,
    speech: str(it.speech, 400) || undefined,
    audio: typeof it.audio === "string" && /^voz\/[a-z0-9_-]{4,80}\.mp3$/i.test(it.audio) ? it.audio : undefined,
  };
}

function cleanList(list: unknown, max = 80): NewsItem[] {
  const out: NewsItem[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(list) ? list.slice(0, max) : []) {
    const it = cleanItem(r);
    if (!it || seen.has(it.link)) continue;
    seen.add(it.link);
    out.push(it);
  }
  return out;
}

// ---------- Arquivo do GitHub ----------

interface SiteFile {
  state: SiteFileState;
  updatedAt: number | null;
  error: string;
  items: NewsItem[];
  status: Map<string, { ok: boolean; error: string }>;
}

async function readSiteFile(signal?: AbortSignal): Promise<SiteFile> {
  const empty = (state: SiteFileState, error: string): SiteFile => ({ state, updatedAt: null, error, items: [], status: new Map() });
  let raw: unknown;
  try {
    const res = await fetch(NEWS_URL, { cache: "no-cache", signal });
    if (!res.ok) return empty("ausente", `HTTP ${res.status}`);
    raw = await res.json();
  } catch (err) {
    if (signal?.aborted) throw err;
    return empty("ausente", err instanceof SyntaxError ? "arquivo inválido" : "sem resposta");
  }
  const data = obj(raw);
  if (!data || !Array.isArray(data.items)) return empty("ausente", "arquivo inválido");
  const status = new Map<string, { ok: boolean; error: string }>();
  for (const s of Array.isArray(data.sources) ? data.sources : []) {
    const o = obj(s);
    const id = o ? str(o.id, 20) : "";
    if (o && id) status.set(id, { ok: o.ok === true, error: str(o.error, 120) });
  }
  const updated = typeof data.updatedAt === "string" ? Date.parse(data.updatedAt) : NaN;
  const updatedAt = Number.isFinite(updated) ? updated : null;
  const items = cleanList(data.items);
  const state: SiteFileState = items.length === 0 ? "vazio" : updatedAt === null || Date.now() - updatedAt > SITE_STALE_MS ? "antigo" : "ok";
  return { state, updatedAt, error: "", items, status };
}

// ---------- Conexão direta (rss2json.com) ----------

interface DirectResult {
  at: number;
  ok: boolean;
  error: string;
  items: NewsItem[];
}

function readDirectCache(): Record<string, DirectResult> {
  try {
    const all = obj(JSON.parse(localStorage.getItem(DIRECT_CACHE_KEY) ?? "{}")) ?? {};
    const out: Record<string, DirectResult> = {};
    for (const [id, v] of Object.entries(all)) {
      const o = obj(v);
      if (!o || typeof o.at !== "number") continue;
      out[id] = { at: o.at, ok: o.ok === true, error: str(o.error, 120), items: cleanList(o.items, PER_SOURCE) };
    }
    return out;
  } catch {
    return {};
  }
}

function writeDirectCache(cache: Record<string, DirectResult>) {
  try {
    localStorage.setItem(DIRECT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* sem armazenamento */
  }
}

/** Data do rss2json ("2026-11-11 14:05:00", em UTC) ou outro formato comum. */
function parseDate(v: unknown): number | null {
  const s = str(v, 60);
  if (!s) return null;
  const t = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? Date.parse(`${s.replace(" ", "T")}Z`) : Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** Google Notícias põe " - Nome do veículo" no fim do título. */
const tidyTitle = (title: string, feedUrl: string) => (feedUrl.startsWith("https://news.google.com/") ? title.replace(/\s+[-–]\s+[^-–]{2,40}$/, "") : title);

async function fetchOne(feedUrl: string, signal?: AbortSignal): Promise<{ title: string; link: string; publishedAt: number | null }[]> {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal?.addEventListener("abort", stop, { once: true });
  const timer = window.setTimeout(stop, DIRECT_TIMEOUT_MS);
  try {
    const res = await fetch(DIRECT_API + encodeURIComponent(feedUrl), { signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    let body: Record<string, unknown> | null = null;
    try {
      body = obj(await res.json());
    } catch {
      body = null;
    }
    if (!res.ok || !body || body.status !== "ok") {
      if (res.status === 429) throw new Error("limite de consultas atingido");
      throw new Error(str(body?.message, 90) || `HTTP ${res.status}`);
    }
    const out: { title: string; link: string; publishedAt: number | null }[] = [];
    for (const r of Array.isArray(body.items) ? body.items.slice(0, 40) : []) {
      const o = obj(r);
      if (!o) continue;
      out.push({ title: tidyTitle(str(o.title, 280), feedUrl), link: str(o.link, 600), publishedAt: parseDate(o.pubDate) });
    }
    return out;
  } catch (err) {
    if (signal?.aborted) throw err;
    if (ctrl.signal.aborted) throw new Error("tempo esgotado");
    throw err instanceof Error && err.message && !(err instanceof TypeError) ? err : new Error("sem resposta");
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}

async function fetchDirect(src: SourceDef, signal?: AbortSignal): Promise<DirectResult> {
  const now = Date.now();
  let error = "sem resposta";
  for (const url of src.urls) {
    try {
      const got = await fetchOne(url, signal);
      const fresh = got
        .filter((i) => i.publishedAt === null || (now - i.publishedAt < src.maxAgeDays * 86_400_000 && i.publishedAt - now < 3_600_000))
        .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
        .slice(0, PER_SOURCE)
        .map((i) => ({ source: src.id, sourceName: src.name, lang: src.lang, title: i.title, link: i.link, publishedAt: i.publishedAt, breaking: BREAKING.test(i.title) }));
      const items = cleanList(fresh, PER_SOURCE);
      if (items.length > 0 || got.length > 0) return { at: now, ok: true, error: "", items };
      error = "feed vazio";
    } catch (err) {
      if (signal?.aborted) throw err;
      error = err instanceof Error ? err.message : "sem resposta";
    }
  }
  return { at: now, ok: false, error, items: [] };
}

// ---------- Junta tudo ----------

async function fetchNews(signal?: AbortSignal): Promise<NewsFeed> {
  const site = await readSiteFile(signal);
  // Arquivo bom: só busca direto as fontes que falharam no GitHub. Senão, todas.
  const needDirect = site.state === "ok" ? NEWS_SOURCES.filter((s) => site.status.get(s.id)?.ok === false) : NEWS_SOURCES;

  const cache = readDirectCache();
  const now = Date.now();
  const direct = new Map<string, DirectResult>();
  const toFetch: SourceDef[] = [];
  for (const s of needDirect) {
    const c = cache[s.id];
    if (c && now - c.at >= 0 && now - c.at < DIRECT_CACHE_MS) direct.set(s.id, c);
    else toFetch.push(s);
  }
  if (toFetch.length > 0) {
    const results = await Promise.all(toFetch.map((s) => fetchDirect(s, signal)));
    toFetch.forEach((s, i) => {
      direct.set(s.id, results[i]!);
      cache[s.id] = results[i]!;
    });
    writeDirectCache(cache);
  }

  const items: NewsItem[] = [];
  const sources: NewsSourceStatus[] = [];
  let usedDirect = false;
  let directAt: number | null = null;
  for (const s of NEWS_SOURCES) {
    const fromSite = site.items.filter((i) => i.source === s.id);
    const siteStatus = site.status.get(s.id);
    const d = direct.get(s.id);
    if (d && d.ok && d.items.length > 0) {
      items.push(...d.items);
      usedDirect = true;
      directAt = Math.min(directAt ?? d.at, d.at);
      sources.push({ id: s.id, name: s.name, ok: true, count: d.items.length, via: "direto", error: "" });
    } else if (fromSite.length > 0 || siteStatus?.ok) {
      items.push(...fromSite);
      sources.push({
        id: s.id,
        name: s.name,
        ok: siteStatus ? siteStatus.ok : true,
        count: fromSite.length,
        via: "github",
        error: [
          siteStatus?.ok === false ? `GitHub: ${siteStatus.error || "sem resposta"}` : "",
          d ? `direto: ${d.ok ? "sem manchetes recentes" : d.error || "sem resposta"}` : "",
        ]
          .filter(Boolean)
          .join(" • "),
      });
    } else {
      const parts = [siteStatus && !siteStatus.ok ? `GitHub: ${siteStatus.error || "sem resposta"}` : "", d ? `direto: ${d.ok ? "sem manchetes recentes" : d.error}` : ""];
      sources.push({ id: s.id, name: s.name, ok: d?.ok === true, count: 0, via: d?.ok ? "direto" : null, error: parts.filter(Boolean).join(" • ") });
    }
  }
  // Manchetes de fontes que não estão na lista (se o arquivo do GitHub tiver outras)
  const known = new Set(NEWS_SOURCES.map((s) => s.id));
  items.push(...site.items.filter((i) => !known.has(i.source)));

  const unique = cleanList(items, 120);
  return {
    updatedAt: usedDirect && site.state !== "ok" ? directAt : (site.updatedAt ?? directAt),
    sourcesOk: sources.filter((s) => s.ok).length,
    sourcesTotal: sources.length,
    items: unique,
    sources,
    site: { state: site.state, updatedAt: site.updatedAt, error: site.error },
    direct: usedDirect,
  };
}

export function useNews(enabled: boolean) {
  return useQuery({
    queryKey: ["noticias"],
    queryFn: ({ signal }) => fetchNews(signal),
    enabled,
    refetchInterval: enabled ? REFRESH_MS : false,
    staleTime: REFRESH_MS - 30_000,
    retry: 1,
  });
}

export function isUrgent(item: NewsItem, now = Date.now()) {
  return item.breaking && item.publishedAt !== null && now - item.publishedAt < URGENT_WINDOW_MS && item.publishedAt - now < 10 * 60_000;
}

/** Manchetes intercaladas por fonte (a mais recente de cada uma primeiro), para a âncora variar de veículo. */
export function interleave(items: NewsItem[], max: number): NewsItem[] {
  const bySource = new Map<string, NewsItem[]>();
  for (const it of [...items].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))) {
    const list = bySource.get(it.source) ?? [];
    list.push(it);
    bySource.set(it.source, list);
  }
  const queues = [...bySource.values()].sort((a, b) => (b[0]?.publishedAt ?? 0) - (a[0]?.publishedAt ?? 0));
  const out: NewsItem[] = [];
  for (let round = 0; out.length < max; round++) {
    let added = false;
    for (const q of queues) {
      const it = q[round];
      if (it && out.length < max) {
        out.push(it);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

export function ago(ts: number | null, now = Date.now()): string {
  if (ts === null) return "";
  const min = Math.max(0, Math.round((now - ts) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}
