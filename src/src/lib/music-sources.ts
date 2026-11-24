// Músicas sob demanda.
//
// Fontes:
//  - Catálogo (estilo Spotube)  busca em iTunes/Deezer e toca a música completa pelo YouTube (src/lib/music-catalog.ts).
//  - YouTube                    busca direta de vídeos (mesmas camadas do catálogo) ou link colado.
//  - Internet Archive           acervo público (shows ao vivo, gravações antigas, domínio público).
//  - Do aparelho (offline)      arquivos do próprio ouvinte guardados no navegador (src/lib/local-music.ts).
//
// Configuração opcional no musica.json da raiz do site (o GitHub Actions gera a partir das variáveis/segredos):
//  - musicaProxyUrl  endereço do buscador próprio (Vercel ou Cloudflare) — deixa a busca no YouTube completa e estável.
//  - youtubeApiKey   chave da YouTube Data API (alternativa ao buscador).

import { searchCatalog, searchYoutubeAny } from "@/lib/music-catalog";
import { listLocal, localArtUrl } from "@/lib/local-music";

export type SourceId = "catalogo" | "youtube" | "archive" | "local";

export interface Track {
  /** Identificador único (fonte + id). */
  key: string;
  source: SourceId;
  title: string;
  artist: string;
  artwork?: string;
  /** Duração em segundos (quando conhecida). */
  duration?: number;
  /** Endereço de áudio para o <audio> do site (Internet Archive). */
  url?: string;
  /** YouTube: id do vídeo (tocado no player oficial embutido). */
  youtubeId?: string;
  /** Internet Archive: item ainda não aberto (as faixas vêm ao tocar). */
  archiveItem?: string;
  /** Página da música na fonte (crédito/licença). */
  page?: string;
  license?: string;
  /** Arquivo guardado no aparelho (aba "Do aparelho"). */
  localId?: string;
  /** Catálogo: álbum, prévia de 30 s (só se o YouTube falhar) e de onde vieram os dados. */
  album?: string;
  previewUrl?: string;
  via?: string;
}

export interface MusicConfig {
  musicaProxyUrl?: string;
  youtubeApiKey?: string;
}

export const SOURCES: { id: SourceId; name: string; note: string }[] = [
  { id: "catalogo", name: "Catálogo (Spotube)", note: "Qualquer música, completa: catálogo iTunes/Deezer + áudio do YouTube. Aceita links do Spotify, Deezer e Apple Music" },
  { id: "youtube", name: "YouTube", note: "Vídeos e links do YouTube" },
  { id: "archive", name: "Internet Archive", note: "Acervo público e shows ao vivo" },
  { id: "local", name: "Do aparelho (offline)", note: "Suas músicas guardadas neste aparelho; tocam sem internet" },
];

const TIMEOUT = 10_000;

async function getJson(url: string, init?: RequestInit, ms = TIMEOUT): Promise<unknown> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { credentials: "omit", referrerPolicy: "strict-origin-when-cross-origin", ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    window.clearTimeout(t);
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

let configPromise: Promise<MusicConfig> | null = null;
/** Lê musica.json (vazio se não existir). */
export function loadMusicConfig(): Promise<MusicConfig> {
  configPromise ??= getJson("./musica.json", { cache: "no-cache" })
    .then((raw) => {
      const o = obj(raw);
      const clean = (k: string) => {
        const v = str(o[k]).trim();
        return v && !/^cole aqui/i.test(v) ? v : undefined;
      };
      const proxy = clean("musicaProxyUrl");
      // Só https (o site é https; http seria bloqueado), exceto para testes no próprio computador.
      const okUrl = proxy && (/^https:\/\//.test(proxy) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(proxy));
      return { musicaProxyUrl: okUrl ? proxy.replace(/\/+$/, "") : undefined, youtubeApiKey: clean("youtubeApiKey") };
    })
    .catch(() => ({}));
  return configPromise;
}

// ---------- Internet Archive ----------
/** Caracteres especiais da busca do Archive (Lucene) — viram espaço para não quebrar a consulta. */
const LUCENE = /[+\-&|!(){}[\]^"~*?:\\/]/g;

async function archiveQuery(query: string, sorted: boolean, ms: number) {
  const params = new URLSearchParams({ q: query, rows: "30", page: "1", output: "json" });
  for (const f of ["identifier", "title", "creator", "downloads"]) params.append("fl[]", f);
  if (sorted) params.append("sort[]", "downloads desc");
  const raw = obj(await getJson(`https://archive.org/advancedsearch.php?${params}`, undefined, ms));
  if (raw.error) throw new Error(str(raw.error));
  return arr(obj(raw.response).docs);
}

export async function searchArchive(q: string): Promise<Track[]> {
  const words = q.toLowerCase().replace(LUCENE, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  const all = words.join(" AND ");
  let docs: Record<string, unknown>[];
  try {
    docs = await archiveQuery(`(title:(${all}) OR creator:(${all})) AND mediatype:(audio)`, true, 20_000);
    if (!docs.length) docs = await archiveQuery(`(${all}) AND mediatype:(audio)`, true, 20_000);
  } catch {
    // Segunda tentativa mais simples (sem ordenação), caso a busca do Archive esteja lenta.
    docs = await archiveQuery(`(${words.join(" ")}) AND mediatype:(audio)`, false, 20_000);
  }
  return docs.map((d) => {
    const id = str(d.identifier);
    const creator = Array.isArray(d.creator) ? d.creator.map(String).join(", ") : str(d.creator);
    const title = Array.isArray(d.title) ? String(d.title[0] ?? "") : str(d.title);
    return {
      key: `archive:${id}`,
      source: "archive" as const,
      title: title || id,
      artist: creator || "Internet Archive",
      artwork: `https://archive.org/services/img/${encodeURIComponent(id)}`,
      archiveItem: id,
      page: `https://archive.org/details/${encodeURIComponent(id)}`,
    };
  });
}

/** Abre um item do Internet Archive e devolve as faixas em MP3. */
export async function archiveTracks(item: Track): Promise<Track[]> {
  const id = item.archiveItem!;
  const raw = obj(await getJson(`https://archive.org/metadata/${encodeURIComponent(id)}`, undefined, 20_000));
  const meta = obj(raw.metadata);
  const license = str(meta.licenseurl) || undefined;
  const files = arr(raw.files).filter((f) => /\.mp3$/i.test(str(f.name)) && !/_64kb|_vbr\.m3u/i.test(str(f.name)));
  // Preferir o MP3 de melhor qualidade de cada faixa (o acervo costuma ter várias versões).
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const f of files.sort((a, b) => str(a.name).localeCompare(str(b.name), undefined, { numeric: true }))) {
    const name = str(f.name);
    const base = name.replace(/(_vbr|_128kb|_64kb)?\.mp3$/i, "");
    if (seen.has(base)) continue;
    seen.add(base);
    const len = str(f.length);
    const secs = len.includes(":") ? len.split(":").reduce((s, p) => s * 60 + Number(p), 0) : Number(len) || undefined;
    out.push({
      key: `archive:${id}/${name}`,
      source: "archive",
      title: str(f.title) || base.split("/").pop() || name,
      artist: str(f.creator) || item.artist,
      artwork: item.artwork,
      duration: secs,
      url: `https://archive.org/download/${encodeURIComponent(id)}/${name.split("/").map(encodeURIComponent).join("/")}`,
      page: item.page,
      license,
    });
    if (out.length >= 60) break;
  }
  return out;
}

// ---------- YouTube ----------
export function youtubeIdFrom(text: string): string | null {
  const m = text.trim().match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/i);
  return m ? m[1] : null;
}

async function searchYoutube(q: string, c: MusicConfig): Promise<Track[]> {
  const direct = youtubeIdFrom(q);
  if (direct) return [{ key: `youtube:${direct}`, source: "youtube", title: "Vídeo do YouTube", artist: "Link colado", youtubeId: direct, artwork: `https://i.ytimg.com/vi/${direct}/mqdefault.jpg`, page: `https://www.youtube.com/watch?v=${direct}` }];
  try {
    const hits = await searchYoutubeAny(q, c);
    return hits.map((h) => ({
      key: `youtube:${h.id}`,
      source: "youtube" as const,
      title: h.title,
      artist: h.channel,
      duration: h.duration,
      artwork: `https://i.ytimg.com/vi/${h.id}/mqdefault.jpg`,
      youtubeId: h.id,
      page: `https://www.youtube.com/watch?v=${h.id}`,
    }));
  } catch {
    // Sem busca direta do YouTube agora: mostra as músicas do catálogo, que acham o vídeo ao tocar.
    const cat = await searchCatalog(q, c);
    if (!cat.length) throw new Error("youtube indisponível");
    return cat;
  }
}

/** Biblioteca do aparelho, filtrada pelo texto (vazio = tudo). */
export async function searchLocal(q: string): Promise<Track[]> {
  const words = q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(Boolean);
  const songs = await listLocal();
  return songs
    .filter((s) => {
      const hay = `${s.title} ${s.artist} ${s.album ?? ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return words.every((w) => hay.includes(w));
    })
    .map((s) => ({ key: `local:${s.id}`, source: "local" as const, title: s.title, artist: s.artist, album: s.album, artwork: localArtUrl(s), localId: s.id, via: "Aparelho" }));
}

export async function searchSource(id: SourceId, q: string, c: MusicConfig): Promise<Track[]> {
  switch (id) {
    case "catalogo":
      return searchCatalog(q, c);
    case "archive":
      return searchArchive(q);
    case "youtube":
      return searchYoutube(q, c);
    case "local":
      return searchLocal(q);
  }
}

export const fmtTime = (s?: number) => {
  if (!s || !Number.isFinite(s)) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
