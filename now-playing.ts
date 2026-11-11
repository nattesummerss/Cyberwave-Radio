// "Tocando agora": nome da música, artista e detalhes da banda.
//
// - Música e histórico: serviço público de "now playing" da Triton Digital, a mesma
//   empresa que entrega os streams StreamTheWorld do catálogo (sem chave, com CORS).
// - Álbum, ano, gênero e duração: busca pública do iTunes (sem chave, com CORS,
//   limite de ~20 consultas por minuto — por isso cada música é consultada uma vez só).
// - Resumo da banda: Wikipédia em português, com a inglesa como reserva.
//
// Tudo o que chega desses serviços é texto de terceiros: a tela mostra como texto
// simples e só monta links para páginas da própria Wikipédia.

export interface Track {
  title: string;
  artist: string;
  album?: string;
  /** Início da música (ms desde 1970), quando o serviço informa. */
  startedAt?: number;
  /** Duração da música em ms, quando o serviço informa. */
  durationMs?: number;
}

export interface SongDetails {
  title: string;
  artist: string;
  album?: string;
  year?: string;
  genre?: string;
  durationMs?: number;
}

export interface ArtistSummary {
  title: string;
  description?: string;
  extract: string;
  url?: string;
  lang: "pt" | "en";
}

const NP_BASE = "https://np.tritondigital.com/public/nowplaying";
const TIMEOUT_MS = 8000;

// Cada serviço registra no máximo uma falha por sessão (diagnóstico sem poluir o log).
const reported = new Set<string>();
function reportOnce(service: string, reason: string) {
  if (reported.has(service)) return;
  reported.add(service);
  console.error("now playing lookup failed", { service, reason: reason.slice(0, 120) });
}

async function getWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, { signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Ponto de montagem Triton de um stream StreamTheWorld, ou null se o stream for de outro servidor. */
export function tritonMount(streamUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(streamUrl);
  } catch {
    return null;
  }
  if (u.hostname !== "streamtheworld.com" && !u.hostname.endsWith(".streamtheworld.com")) return null;
  const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
  const mount = last.replace(/\.(aac|mp3|m3u8|flv)$/i, "").replace(/_SC$/i, "").toUpperCase();
  return /^[A-Z0-9_]+$/.test(mount) ? mount : null;
}

/** Nomes alternativos do ponto de montagem (o histórico às vezes fica no nome sem sufixo). */
function mountCandidates(mount: string): string[] {
  const out = [mount];
  const noIhr = mount.replace(/IHR$/, "");
  const noAac = noIhr.replace(/AAC$/, "");
  const noAdp = mount.replace(/_ADP$/, "");
  for (const m of [noIhr, noAac, noAdp]) if (m && !out.includes(m)) out.push(m);
  return out;
}

// Ponto de montagem que respondeu da última vez, para não repetir tentativas.
const workingMount = new Map<string, string>();

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return XML_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

// O XML da Triton é pequeno e de formato fixo; uma leitura por texto funciona igual em todos os navegadores.
function parseTracks(xml: string): Track[] {
  const tracks: Track[] = [];
  const infoRe = /<nowplaying-info(\s[^>]*)?>([\s\S]*?)<\/nowplaying-info>/g;
  for (const [, attrs = "", inner = ""] of xml.matchAll(infoRe)) {
    const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? "";
    const type = attr("type");
    if (type && type !== "track") continue;
    const props = new Map<string, string>();
    const propRe = /<property\s+name="([^"]+)"\s*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/property>/g;
    for (const [, name = "", cdata, plain] of inner.matchAll(propRe)) {
      props.set(name, (cdata ?? decodeXml(plain ?? "")).trim());
    }
    const prop = (name: string) => props.get(name) ?? "";
    let title = prop("cue_title") || prop("track_title");
    let artist = prop("track_artist_name");
    if (!artist && title.includes(" - ")) {
      const [a, ...rest] = title.split(" - ");
      artist = (a ?? "").trim();
      title = rest.join(" - ").trim();
    }
    if (!title) continue;
    const start = Number(prop("cue_time_start"));
    const ts = Number(attr("timestamp"));
    const dur = Number(prop("cue_time_duration"));
    tracks.push({
      title,
      artist,
      album: prop("track_album_name") || undefined,
      startedAt: start > 0 ? start : ts > 0 ? ts * 1000 : undefined,
      durationMs: dur > 0 ? dur : undefined,
    });
  }
  return tracks.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
}

/** Últimas músicas da rádio (a mais recente primeiro). Lança erro se o serviço não responder. */
export async function fetchNowPlaying(mount: string, signal?: AbortSignal): Promise<Track[]> {
  const known = workingMount.get(mount);
  const candidates = known ? [known] : mountCandidates(mount);
  let lastError: unknown = null;
  for (const m of candidates) {
    const url = `${NP_BASE}?mountName=${encodeURIComponent(m)}&numberToFetch=6&eventType=track`;
    try {
      const res = await getWithTimeout(url, signal);
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const tracks = parseTracks(await res.text());
      if (tracks.length > 0 || m === candidates[candidates.length - 1]) {
        if (tracks.length > 0) workingMount.set(mount, m);
        return tracks;
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
    }
  }
  if (lastError) {
    reportOnce("triton", lastError instanceof Error ? `${lastError.name}: ${lastError.message}` : "unknown");
    throw lastError;
  }
  return [];
}

/** Trecho principal do nome do artista ("A feat. B" → "A"). */
export function mainArtist(artist: string): string {
  return artist.split(/\s+(?:feat\.?|ft\.?|featuring|x)\s+|\s*[,/;]\s*/i)[0]?.trim() || artist.trim();
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Converte "QUEENS OF THE STONE AGE" em "Queens Of The Stone Age"; mantém nomes já formatados. */
export function tidyName(s: string): string {
  if (s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());
}

interface ItunesResult {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  trackTimeMillis?: number;
}

/** Álbum, ano e gênero da música no catálogo do iTunes; null quando não há correspondência segura. */
export async function fetchSongDetails(artist: string, title: string, signal?: AbortSignal): Promise<SongDetails | null> {
  const cleanTitle = title.replace(/\s*[([].*?[)\]]\s*/g, " ").trim() || title;
  const lead = mainArtist(artist);
  const term = `${artist} ${cleanTitle}`.slice(0, 120);
  const url = `https://itunes.apple.com/search?media=music&entity=song&limit=5&country=BR&term=${encodeURIComponent(term)}`;
  let data: { results?: ItunesResult[] };
  try {
    const res = await getWithTimeout(url, signal);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = JSON.parse((await res.text()).trim()) as { results?: ItunesResult[] };
  } catch (err) {
    if (signal?.aborted) throw err;
    reportOnce("itunes", err instanceof Error ? `${err.name}: ${err.message}` : "unknown");
    throw err;
  }
  const wantArtist = norm(lead);
  const wantTitle = norm(cleanTitle);
  const hit = (data.results ?? []).find((r) => {
    const a = norm(r.artistName ?? "");
    const t = norm(r.trackName ?? "");
    const artistOk = !!a && (a.includes(wantArtist) || wantArtist.includes(a));
    const titleOk = !!t && (t.startsWith(wantTitle) || wantTitle.startsWith(t));
    return artistOk && titleOk;
  });
  if (!hit) return null;
  return {
    title: hit.trackName ?? cleanTitle,
    artist: hit.artistName ?? lead,
    album: hit.collectionName?.replace(/\s+-\s+(Single|EP)$/i, "") || undefined,
    year: hit.releaseDate?.slice(0, 4) || undefined,
    genre: hit.primaryGenreName || undefined,
    durationMs: hit.trackTimeMillis || undefined,
  };
}

const MUSIC_WORDS =
  /\b(banda|grupo musical|grupo de|cantor|cantora|m[uú]sic[oa]|rapper|compositor|compositora|dj|duo|dupla|band|singer|musician|songwriter|rock|metal|record producer|musical group)\b/i;

interface WikiSummary {
  type?: string;
  title?: string;
  description?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

async function wikiSummary(lang: "pt" | "en", title: string, signal?: AbortSignal): Promise<ArtistSummary | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=true`;
  const res = await getWithTimeout(url, signal);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const s = (await res.json()) as WikiSummary;
  if (s.type !== "standard" || !s.extract) return null;
  if (!MUSIC_WORDS.test(`${s.description ?? ""} ${s.extract.slice(0, 300)}`)) return null;
  const page = s.content_urls?.desktop?.page;
  const pageOk = !!page && page.startsWith(`https://${lang}.wikipedia.org/`);
  return {
    title: s.title ?? title,
    description: s.description,
    extract: s.extract,
    url: pageOk ? page : undefined,
    lang,
  };
}

/** Resumo da banda/artista na Wikipédia (português primeiro); null quando não encontra uma página de música. */
export async function fetchArtistSummary(artist: string, signal?: AbortSignal): Promise<ArtistSummary | null> {
  const name = mainArtist(artist);
  const attempts: ["pt" | "en", string][] = [
    ...(name !== artist.trim() ? ([["pt", artist.trim()], ["en", artist.trim()]] as ["pt" | "en", string][]) : []),
    ["pt", name],
    ["pt", `${name} (banda)`],
    ["pt", `${name} (cantor)`],
    ["en", name],
    ["en", `${name} (band)`],
    ["en", `${name} (singer)`],
    ["en", `${name} (musician)`],
  ];
  try {
    for (const [lang, title] of attempts) {
      const found = await wikiSummary(lang, title, signal);
      if (found) return found;
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    reportOnce("wikipedia", err instanceof Error ? `${err.name}: ${err.message}` : "unknown");
    throw err;
  }
  return null;
}

/** A música mais recente ainda está no ar? (com folga de 1 minuto; sem duração, vale por 8 minutos) */
export function isOnAirNow(t: Track, now = Date.now()): boolean {
  if (!t.startedAt) return true;
  const end = t.startedAt + (t.durationMs ?? 8 * 60_000) + 60_000;
  return now <= end;
}

export function fmtDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
