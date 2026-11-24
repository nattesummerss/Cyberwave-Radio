// Leitura das respostas de busca do YouTube e do YouTube Music (InnerTube / ytInitialData).
// É o mesmo tipo de extração que NewPipeExtractor e youtube_explode fazem para o Spotube:
// só lemos id, título, canal e duração dos resultados — o áudio continua tocando no player oficial.
// Arquivo sem DOM: é usado pelo site e pelo buscador próprio (src/worker/musica-core.ts).

export interface YtHit {
  id: string;
  title: string;
  channel: string;
  duration?: number;
  /** Resultado da aba "Músicas" do YouTube Music (áudio oficial do artista/gravadora). */
  official?: boolean;
}

type O = Record<string, unknown>;
const o = (v: unknown): O => (v && typeof v === "object" ? (v as O) : {});
const runsText = (v: unknown) => {
  const x = o(v);
  if (typeof x.simpleText === "string") return x.simpleText;
  return Array.isArray(x.runs) ? x.runs.map((r) => String(o(r).text ?? "")).join("") : "";
};

export function parseClock(s: string): number | undefined {
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined;
}

function findVideoId(v: unknown, depth = 0): string | undefined {
  if (depth > 12 || !v || typeof v !== "object") return undefined;
  const x = v as O;
  if (typeof x.videoId === "string" && /^[\w-]{11}$/.test(x.videoId)) return x.videoId;
  for (const k of Object.keys(x)) {
    const r = findVideoId(x[k], depth + 1);
    if (r) return r;
  }
  return undefined;
}

function fromVideoRenderer(r: O): YtHit | null {
  const id = typeof r.videoId === "string" ? r.videoId : "";
  if (!/^[\w-]{11}$/.test(id)) return null;
  const len = runsText(r.lengthText);
  // Ao vivo (sem duração) não serve como música.
  if (!len) return null;
  return { id, title: runsText(r.title), channel: runsText(r.ownerText) || runsText(r.longBylineText) || runsText(r.shortBylineText), duration: parseClock(len) };
}

function fromMusicItem(r: O): YtHit | null {
  const id = (typeof o(r.playlistItemData).videoId === "string" ? (o(r.playlistItemData).videoId as string) : "") || findVideoId(o(r.flexColumns));
  if (!id) return null;
  const cols = Array.isArray(r.flexColumns) ? r.flexColumns.map((c) => o(o(c).musicResponsiveListItemFlexColumnRenderer).text) : [];
  const title = runsText(cols[0]);
  const meta = Array.isArray(o(cols[1]).runs) ? (o(cols[1]).runs as unknown[]).map((x) => String(o(x).text ?? "")) : [];
  const parts = meta.filter((t) => t.trim() && t.trim() !== "•");
  let duration: number | undefined;
  for (const p of parts) duration ??= parseClock(p);
  for (const c of Array.isArray(r.fixedColumns) ? r.fixedColumns : []) duration ??= parseClock(runsText(o(o(c).musicResponsiveListItemFixedColumnRenderer).text));
  // O primeiro texto às vezes é o tipo ("Música", "Song", "Vídeo").
  const kind = parts[0] && /^(m[uú]sica|song|v[ií]deo|video)$/i.test(parts[0].trim()) ? parts.shift()!.trim() : "";
  const channel = parts[0] ?? "";
  if (!title) return null;
  return { id, title, channel, duration, official: !/^v[ií]deo$/i.test(kind) };
}

/** Percorre a resposta e devolve os resultados na ordem em que aparecem. */
export function parseYoutubeSearch(data: unknown, max = 15): YtHit[] {
  const out: YtHit[] = [];
  const seen = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (out.length >= max || depth > 40 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    const x = v as O;
    let hit: YtHit | null = null;
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

/** Extrai o JSON "ytInitialData" da página de resultados do YouTube. */
export function ytInitialDataFromHtml(html: string): unknown | null {
  const marks = ["var ytInitialData = ", 'window["ytInitialData"] = ', "ytInitialData = "];
  for (const m of marks) {
    const i = html.indexOf(m);
    if (i < 0) continue;
    const start = i + m.length;
    // Acha o fim do objeto contando chaves (ignora as que estão dentro de strings).
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

// ---- Last.fm: a página de cada faixa traz o vídeo do YouTube escolhido pelo próprio Last.fm
export interface LastfmVideo {
  id: string;
  track?: string;
  artist?: string;
}

/** Endereço da página da faixa no Last.fm (espaço vira "+", o resto é codificado). */
export function lastfmTrackUrl(artist: string, title: string): string {
  const part = (s: string) => encodeURIComponent(s.trim()).replace(/%20/g, "+");
  return `https://www.last.fm/music/${part(artist)}/_/${part(title)}`;
}

const unescapeHtml = (s?: string) =>
  s
    ?.replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Lê os atributos data-youtube-id (e o nome da faixa/artista, quando houver) da página do Last.fm. */
export function lastfmVideos(html: string): LastfmVideo[] {
  const out: LastfmVideo[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<[a-z]+\b[^>]*\bdata-youtube-id="([\w-]{11})"[^>]*>/gi)) {
    const tag = m[0];
    const attr = (n: string) => unescapeHtml(tag.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1]);
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ id: m[1], track: attr("data-track-name"), artist: attr("data-artist-name") });
  }
  return out;
}

// ---- pedidos InnerTube (usados pelo servidor; o navegador não pode chamá-los direto por causa do CORS)
/** Versão do cliente baseada na data (o YouTube recusa versões muito antigas). */
function clientVersion(prefix: string, suffix: string): string {
  const d = new Date(Date.now() - 5 * 86_400_000);
  return `${prefix}.${d.toISOString().slice(0, 10).replace(/-/g, "")}.${suffix}`;
}

export const INNERTUBE = {
  music: {
    url: "https://music.youtube.com/youtubei/v1/search?prettyPrint=false",
    body: (q: string, version = clientVersion("1", "01.00")) => ({
      context: { client: { clientName: "WEB_REMIX", clientVersion: version, hl: "pt", gl: "BR" } },
      query: q,
      params: "EgWKAQIIAWoMEA4QChADEAQQCRAF", // filtro "Músicas" (o mesmo do ytmusicapi)
    }),
  },
  web: {
    url: "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
    body: (q: string, version = clientVersion("2", "00.00")) => ({
      context: { client: { clientName: "WEB", clientVersion: version, hl: "pt", gl: "BR" } },
      query: q,
      params: "EgIQAQ==", // só vídeos
    }),
  },
  html: (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D&hl=pt-BR&gl=BR&ucbcb=1`,
};
