// Catálogo no estilo Spotube.
//
// A ideia do Spotube (github.com/team-spotube/spotube) é separar duas coisas:
//   1. METADADOS: um catálogo (nome, artista, álbum, capa, duração) para pesquisar.
//   2. FONTE DE ÁUDIO: para cada faixa escolhida, achar no YouTube a mesma gravação
//      (comparando título, artista e DURAÇÃO), lembrar a escolha e tocar a música completa.
// Aqui a mesma arquitetura roda num site estático:
//   - Metadados: iTunes/Apple (principal, libera CORS) e Deezer (complemento e links colados).
//   - Fonte de áudio, em camadas (as que respondem são usadas; a escolha fica guardada):
//       0) Índice do site (musicas/indice.json): o GitHub Actions já procurou as músicas populares no
//          YouTube Music/Last.fm e publicou o vídeo certo de cada uma. Resposta imediata, sem cadastro.
//       a) Buscador próprio ("musicaProxyUrl": Vercel ou Cloudflare) — YouTube Music + YouTube via InnerTube,
//          o mesmo método dos extratores do Spotube. É a opção estável e completa.
//       b) YouTube Data API ("youtubeApiKey").
//       c) Sem configuração: vídeo indicado pelo Last.fm para a faixa, vídeo oficial registrado no
//          Wikidata e instâncias públicas do Invidious. Cada vídeo é conferido no oEmbed do YouTube
//          (existe e pode ser incorporado) antes de tocar.
//   - Toca no player oficial do YouTube embutido (não baixamos nem extraímos o áudio). Se um vídeo
//     não puder tocar fora do YouTube, o player avisa e o site passa sozinho para a próxima opção.
//   - Letras sincronizadas: LRCLib.
// Nenhuma linha de código do Spotube foi copiada; só a lógica foi reimplementada em TypeScript.

import type { MusicConfig, Track } from "@/lib/music-sources";
import { lastfmTrackUrl, lastfmVideos, type YtHit } from "@/lib/yt-parse";
import { coreTitle, firstArtist, norm, scoreCandidate } from "@/lib/music-match";
import { indexLookup } from "@/lib/music-index";

export { scoreCandidate };

const TIMEOUT = 8_000;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Erro de rede/bloqueio (sem resposta do servidor), diferente de "respondeu que não tem" (HTTP 404 etc.). */
const isNetworkError = (e: unknown) => !(e instanceof Error && /^HTTP \d+/.test(e.message));

async function getJson(url: string, ms = TIMEOUT): Promise<unknown> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { credentials: "omit", signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    window.clearTimeout(t);
  }
}

let jsonpSeq = 0;
/** Deezer e iTunes não liberam CORS para todos; JSONP funciona em qualquer navegador. */
export function jsonp(url: string, ms = TIMEOUT): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const name = `__cwJsonp${Date.now().toString(36)}${jsonpSeq++}`;
    const w = window as unknown as Record<string, unknown>;
    const s = document.createElement("script");
    const done = () => {
      window.clearTimeout(timer);
      delete w[name];
      s.remove();
    };
    const timer = window.setTimeout(() => {
      done();
      reject(new Error("tempo esgotado"));
    }, ms);
    w[name] = (data: unknown) => {
      done();
      resolve(data);
    };
    s.onerror = () => {
      done();
      reject(new Error("falha de rede"));
    };
    s.src = `${url}${url.includes("?") ? "&" : "?"}${url.includes("deezer.com") ? "output=jsonp&callback" : "callback"}=${name}`;
    document.head.appendChild(s);
  });
}

// ---------------------------------------------------------------- metadados
const deezerTrack = (t: Record<string, unknown>): Track => {
  const al = obj(t.album);
  return {
    key: `catalogo:dz${str(t.id) || num(t.id)}`,
    source: "catalogo",
    title: str(t.title),
    artist: str(obj(t.artist).name),
    album: str(al.title) || undefined,
    artwork: str(al.cover_medium) || str(al.cover) || undefined,
    duration: num(t.duration),
    previewUrl: str(t.preview) || undefined,
    page: str(t.link) || undefined,
    via: "Deezer",
  };
};

/** Deezer: pelo buscador próprio (se houver) e, senão, por JSONP. */
async function deezer(path: string, c?: MusicConfig): Promise<Record<string, unknown>> {
  const base = helperBase(c);
  if (base) {
    try {
      const r = obj(await getJson(helperUrl(base, { op: "deezer", path })));
      if (!r.error) return r;
    } catch {
      /* tenta JSONP */
    }
  }
  return obj(await jsonp(`https://api.deezer.com${path}`));
}

export async function searchDeezer(q: string, c?: MusicConfig): Promise<Track[]> {
  const raw = await deezer(`/search?q=${encodeURIComponent(q)}&limit=30`, c);
  if (raw.error) throw new Error("deezer");
  return arr(raw.data).filter((t) => t.readable !== false).map(deezerTrack);
}

const itunesTrack = (t: Record<string, unknown>): Track => ({
  key: `catalogo:it${num(t.trackId) ?? str(t.trackId)}`,
  source: "catalogo" as const,
  title: str(t.trackName),
  artist: str(t.artistName),
  album: str(t.collectionName) || undefined,
  artwork: str(t.artworkUrl100).replace("100x100", "200x200") || undefined,
  duration: (num(t.trackTimeMillis) ?? 0) / 1000 || undefined,
  previewUrl: str(t.previewUrl) || undefined,
  page: str(t.trackViewUrl) || undefined,
  via: "iTunes",
});

export async function searchItunes(q: string): Promise<Track[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=30&country=BR`;
  let raw: Record<string, unknown>;
  try {
    raw = obj(await getJson(url));
  } catch {
    raw = obj(await jsonp(url));
  }
  return arr(raw.results).filter((t) => t.kind === "song").map(itunesTrack);
}

/** Álbum ou playlist do Deezer colado na busca (como a importação de playlists do Spotube). */
async function deezerCollection(kind: "album" | "playlist", id: string, c?: MusicConfig): Promise<Track[]> {
  const raw = await deezer(`/${kind}/${id}`, c);
  const cover = str(raw.cover_medium) || str(raw.picture_medium);
  return arr(obj(raw.tracks).data).map((t) => {
    const tr = deezerTrack(t);
    if (!tr.artwork && cover) tr.artwork = cover;
    if (!tr.album && kind === "album") tr.album = str(raw.title);
    return tr;
  });
}

/** Álbum do Apple Music/iTunes colado na busca. */
async function itunesAlbum(id: string): Promise<Track[]> {
  const raw = obj(await getJson(`https://itunes.apple.com/lookup?id=${id}&entity=song&country=BR`).catch(() => jsonp(`https://itunes.apple.com/lookup?id=${id}&entity=song&country=BR`)));
  return arr(raw.results).filter((t) => t.kind === "song").map(itunesTrack);
}

export function spotifyLink(text: string): { kind: string; id: string } | null {
  const m = text.trim().match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]{10,})/i) ?? text.trim().match(/^spotify:(track|album|playlist|artist):([A-Za-z0-9]{10,})$/i);
  return m ? { kind: m[1].toLowerCase(), id: m[2] } : null;
}

async function spotifyTitle(link: { kind: string; id: string }): Promise<{ title: string; artwork?: string }> {
  const url = `https://open.spotify.com/${link.kind}/${link.id}`;
  try {
    const o = obj(await getJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, 6000));
    return { title: str(o.title), artwork: str(o.thumbnail_url) || undefined };
  } catch {
    return { title: "" };
  }
}

/** Pesquisa no catálogo. Aceita texto, link do Spotify, link do Deezer ou do Apple Music. */
export async function searchCatalog(q: string, c?: MusicConfig): Promise<Track[]> {
  const dz = q.match(/deezer\.com\/(?:[a-z]{2}\/)?(album|playlist|track)\/(\d+)/i);
  if (dz) {
    const kind = dz[1].toLowerCase();
    if (kind === "track") return [deezerTrack(await deezer(`/track/${dz[2]}`, c))];
    return deezerCollection(kind as "album" | "playlist", dz[2], c);
  }
  const am = q.match(/music\.apple\.com\/.*\/album\/[^/]*\/(\d+)(?:\?i=(\d+))?/i);
  if (am) {
    const songs = await itunesAlbum(am[1]);
    return am[2] ? songs.sort((a, b) => Number(b.key.endsWith(am[2])) - Number(a.key.endsWith(am[2]))) : songs;
  }
  const sp = spotifyLink(q);
  if (sp) {
    // Como no Spotube: o nome que o Spotify informa vira busca no catálogo, e a faixa toca completa pelo YouTube.
    const info = await spotifyTitle(sp);
    if (!info.title) throw new Error("spotify");
    return searchCatalog(info.title, c);
  }
  const [it, dzr] = await Promise.allSettled([searchItunes(q), searchDeezer(q, c)]);
  const a = it.status === "fulfilled" ? it.value : [];
  const b = dzr.status === "fulfilled" ? dzr.value : [];
  if (!a.length && !b.length) {
    if (it.status === "rejected" && dzr.status === "rejected") throw new Error("catálogo fora do ar");
    return [];
  }
  // iTunes primeiro; do Deezer entram só as faixas que o iTunes não trouxe.
  const seen = new Set(a.map((t) => `${norm(t.artist)}|${coreTitle(t.title)}`));
  return [...a, ...b.filter((t) => !seen.has(`${norm(t.artist)}|${coreTitle(t.title)}`))].slice(0, 40);
}

// ---------------------------------------------------------------- fonte de áudio (YouTube)
export interface YtCandidate extends YtHit {
  score: number;
  /** De onde veio a indicação (para o painel "Trocar fonte de áudio"). */
  via?: string;
}

const isoDur = (s: string) => {
  const m = s.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : undefined;
};
const decode = (s: string) => {
  const t = document.createElement("textarea");
  t.innerHTML = s;
  return t.value;
};

async function getText(url: string, ms: number): Promise<string> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { credentials: "omit", signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    window.clearTimeout(t);
  }
}

/** Endereço do buscador próprio. No site hospedado na própria Vercel, usa /api/musica sem configurar nada. */
export function helperBase(c?: MusicConfig): string | null {
  const raw = c?.musicaProxyUrl?.trim().replace(/\/+$/, "");
  if (raw) {
    try {
      const u = new URL(raw);
      if (/\.vercel\.app$/i.test(u.hostname) && (u.pathname === "" || u.pathname === "/")) return `${u.origin}/api/musica`;
      return raw;
    } catch {
      return null;
    }
  }
  return /\.vercel\.app$/i.test(location.hostname) ? `${location.origin}/api/musica` : null;
}
export const helperUrl = (base: string, params: Record<string, string>) => `${base}${base.includes("?") ? "&" : "?"}${new URLSearchParams(params)}`;

export async function viaHelper(base: string, q: string): Promise<YtHit[]> {
  const r = arr(await getJson(helperUrl(base, { op: "buscar", q }), 12_000))
    .map((x) => ({ id: str(x.id), title: str(x.title), channel: str(x.channel), duration: num(x.duration), official: x.official === true }))
    .filter((x) => /^[\w-]{11}$/.test(x.id));
  if (!r.length) throw new Error("vazio");
  return r;
}

/** Explica em linguagem simples por que a Google recusou a chave da YouTube Data API. */
export function apiKeyProblem(status: number, body: unknown): string {
  const e = obj(obj(body).error);
  const reasons = [...arr(e.errors).map((x) => str(x.reason)), ...arr(e.details).map((x) => str(x.reason)), str(e.status)].join(" ");
  const msg = str(e.message);
  const site = typeof location !== "undefined" ? location.host : "o endereço do site";
  if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/i.test(reasons) || /quota/i.test(msg)) return `acabou a cota do dia (cerca de 100 buscas); volta por volta das 5h da manhã (HTTP ${status})`;
  if (/API_KEY_HTTP_REFERRER_BLOCKED/.test(reasons) || /referer/i.test(msg)) return `a chave não aceita este site: libere ${site}/* nas restrições da chave (HTTP ${status})`;
  if (/API_KEY_INVALID|keyInvalid/i.test(reasons) || /API key not valid|API key expired/i.test(msg)) return `chave inválida ou expirada: confira se copiou a chave inteira (HTTP ${status})`;
  if (/SERVICE_DISABLED|accessNotConfigured/i.test(reasons) || /has not been used|is disabled/i.test(msg)) return `a YouTube Data API v3 não está ativada no projeto da chave (HTTP ${status})`;
  if (/API_KEY_SERVICE_BLOCKED/.test(reasons)) return `a chave não tem permissão para a YouTube Data API v3 (restrição de APIs) (HTTP ${status})`;
  return `HTTP ${status}`;
}

/** Chamada à YouTube Data API: informa o endereço do site (exigido pela chave restrita ao site) e explica os erros. */
async function apiJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    // A página usa referrer "same-origin" (não manda o endereço a outros sites); aqui a Google precisa dele.
    const res = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer-when-downgrade", signal: ctrl.signal });
    if (!res.ok) throw new Error(apiKeyProblem(res.status, await res.json().catch(() => null)));
    return await res.json();
  } finally {
    window.clearTimeout(t);
  }
}

export async function viaYoutubeApi(key: string, q: string): Promise<YtHit[]> {
  const p = new URLSearchParams({ part: "snippet", type: "video", videoEmbeddable: "true", maxResults: "8", q, key, regionCode: "BR" });
  const items = arr(obj(await apiJson(`https://www.googleapis.com/youtube/v3/search?${p}`)).items);
  const ids = items.map((it) => str(obj(it.id).videoId)).filter(Boolean);
  const durs = new Map<string, number | undefined>();
  if (ids.length) {
    const d = arr(obj(await apiJson(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids.join(",")}&key=${encodeURIComponent(key)}`)).items);
    for (const v of d) durs.set(str(v.id), isoDur(str(obj(v.contentDetails).duration)));
  }
  const out = items
    .map((it) => {
      const id = str(obj(it.id).videoId);
      const sn = obj(it.snippet);
      return { id, title: decode(str(sn.title)), channel: decode(str(sn.channelTitle)), duration: durs.get(id) };
    })
    .filter((x) => x.id);
  if (!out.length) throw new Error("vazio");
  return out;
}

/** Instâncias públicas listadas em docs.invidious.io (novembro de 2026). */
export const INVIDIOUS = ["https://invidious.nerdvpn.de", "https://yt.chocolatemoo53.com", "https://invidious.tiekoetter.com", "https://inv.nadeko.net"];
export async function viaInvidious(base: string, q: string): Promise<YtHit[]> {
  const items = arr(await getJson(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video&region=BR`, 6000));
  const out = items.filter((it) => it.type === "video" && str(it.videoId)).map((it) => ({ id: str(it.videoId), title: str(it.title), channel: str(it.author), duration: num(it.lengthSeconds) }));
  if (!out.length) throw new Error("vazio");
  return out;
}

interface Tier {
  id: string;
  run: (q: string) => Promise<YtHit[]>;
}
function tiers(c: MusicConfig): Tier[][] {
  const t: Tier[][] = [];
  const base = helperBase(c);
  if (base) t.push([{ id: "buscador", run: (q) => viaHelper(base, q) }]);
  if (c.youtubeApiKey) t.push([{ id: "api", run: (q) => viaYoutubeApi(c.youtubeApiKey!, q) }]);
  t.push(INVIDIOUS.map((b) => ({ id: b, run: (q: string) => viaInvidious(b, q) })));
  return t;
}

const GOOD = "musica.camada";
/** Busca vídeos no YouTube pela primeira camada que responder (a última que funcionou vai primeiro). */
export async function searchYoutubeAny(q: string, c: MusicConfig): Promise<YtHit[]> {
  const groups = tiers(c);
  const good = groups.flat().find((x) => x.id === localStorage.getItem(GOOD));
  if (good) {
    try {
      return await good.run(q);
    } catch {
      localStorage.removeItem(GOOD);
    }
  }
  for (const g of groups) {
    const list = g.filter((x) => x !== good);
    if (!list.length) continue;
    try {
      return await Promise.any(
        list.map(async (x) => {
          const r = await x.run(q);
          localStorage.setItem(GOOD, x.id);
          return r;
        }),
      );
    } catch {
      /* próxima camada */
    }
  }
  throw new Error("Nenhuma busca do YouTube respondeu");
}

// ---- indicações exatas (sem configuração)
/** Proxy público gratuito (GET, até 1 MiB, 10 s) usado só para ler a página da faixa no Last.fm. */
const PUBLIC_PROXY = "https://proxy.cors.dev/";

/** Vídeo que o Last.fm mostra na página da faixa (geralmente o clipe oficial). */
export async function lastfmIds(t: Pick<Track, "artist" | "title">, c?: MusicConfig): Promise<string[]> {
  const artist = firstArtist(t.artist);
  const title = t.title.replace(/\s*\((feat|ft)[^)]*\)/i, "").trim();
  const base = helperBase(c);
  if (base) {
    try {
      const res = obj(await getJson(helperUrl(base, { op: "lastfm", artist, title }), 9000));
      const ids = Array.isArray(res.ids) ? res.ids.map(String).filter((x) => /^[\w-]{11}$/.test(x)) : [];
      if (ids.length) return ids.slice(0, 3);
    } catch {
      /* tenta o proxy público */
    }
  }
  const html = await getText(PUBLIC_PROXY + lastfmTrackUrl(artist, title), 10_000);
  const vids = lastfmVideos(html);
  const want = coreTitle(title);
  // O primeiro vídeo da página é o da própria faixa; os demais são de faixas parecidas.
  const exact = vids.filter((v) => !v.track || coreTitle(v.track) === want);
  return (exact.length ? exact : vids.slice(0, 1)).map((v) => v.id).slice(0, 3);
}

/** Vídeo registrado no Wikidata (propriedade P1651) para a música do artista. */
export async function wikidataIds(t: Pick<Track, "artist" | "title">): Promise<string[]> {
  const artist = norm(firstArtist(t.artist));
  const title = t.title.replace(/\s*\((feat|ft)[^)]*\)/i, "").trim();
  const search = (lang: string) =>
    getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(title)}&language=${lang}&uselang=${lang}&type=item&limit=12&format=json&origin=*`, 8000).then((r) => arr(obj(r).search));
  const both = await Promise.allSettled([search("en"), search("pt")]);
  // As duas buscas falharam: o Wikidata está fora do ar ou bloqueado nesta rede (não é "sem vídeo").
  if (both.every((x) => x.status === "rejected")) throw (both[0] as PromiseRejectedResult).reason;
  const found = both.flatMap((x) => (x.status === "fulfilled" ? x.value : []));
  const ids = [...new Set(found.filter((x) => artist && norm(str(x.description)).includes(artist)).map((x) => str(x.id)))].slice(0, 6);
  if (!ids.length) return [];
  const ents = obj(obj(await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join("|")}&props=claims&format=json&origin=*`, 8000)).entities);
  const out: string[] = [];
  for (const id of ids) {
    for (const cl of arr(obj(obj(ents[id]).claims).P1651)) {
      const v = str(obj(obj(obj(cl).mainsnak).datavalue).value);
      if (/^[\w-]{11}$/.test(v)) out.push(v);
    }
  }
  return [...new Set(out)].slice(0, 4);
}

/** Confere no oEmbed do YouTube se o vídeo existe e pode tocar fora do YouTube (401 = incorporação proibida). */
export async function oembedCheck(id: string): Promise<{ title: string; channel: string } | null> {
  try {
    const o = obj(await getJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, 6000));
    return { title: str(o.title), channel: str(o.author_name) };
  } catch {
    return null;
  }
}

const CACHE = "musica.casamentos";
const cacheKey = (t: Pick<Track, "title" | "artist">) => `${norm(t.artist)}|${norm(t.title)}`;
function readCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function writeCache(c: Record<string, string>) {
  const keys = Object.keys(c);
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete c[k];
  try {
    localStorage.setItem(CACHE, JSON.stringify(c));
  } catch {
    /* armazenamento cheio */
  }
}
/** Guarda a escolha (automática ou do ouvinte) — como o Spotube lembra a fonte de cada faixa. */
export function rememberMatch(t: Pick<Track, "title" | "artist">, videoId: string) {
  const c = readCache();
  delete c[cacheKey(t)];
  c[cacheKey(t)] = videoId;
  writeCache(c);
}
export function forgetMatch(t: Pick<Track, "title" | "artist">) {
  const c = readCache();
  delete c[cacheKey(t)];
  writeCache(c);
}

export interface MatchResult {
  videoId: string | null;
  alternatives: YtCandidate[];
  cached: boolean;
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };
const settle = <T,>(p: Promise<T>): Promise<Settled<T>> => p.then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("tempo esgotado")), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Acha o vídeo do YouTube que corresponde à faixa do catálogo (pulando os que já falharam). */
export async function matchOnYoutube(t: Track, c: MusicConfig, opts: { fresh?: boolean; skip?: string[] } = {}): Promise<MatchResult> {
  const skip = new Set(opts.skip ?? []);
  const saved = readCache()[cacheKey(t)];
  if (saved && !opts.fresh && !skip.has(saved)) return { videoId: saved, alternatives: [], cached: true };

  // 0) Índice do site: vídeos já conferidos pelo GitHub Actions — toca na hora, sem buscador externo.
  const idxIds = await withTimeout(indexLookup(t), 15_000).catch(() => [] as string[]);
  const fromIndex: YtCandidate[] = idxIds.map((id, i) => ({ id, title: t.title, channel: `${firstArtist(t.artist)} • índice do site`, duration: t.duration, score: 90 - i * 5, via: "índice" }));
  const idxNext = fromIndex.find((x) => !skip.has(x.id));
  // "Procurar de novo" sem falhas (fresh e skip vazio) pesquisa nas outras fontes também.
  if (idxNext && (!opts.fresh || skip.size > 0)) {
    rememberMatch(t, idxNext.id);
    return { videoId: idxNext.id, alternatives: fromIndex.filter((x) => !skip.has(x.id)), cached: false };
  }

  const q = `${firstArtist(t.artist)} ${t.title.replace(/\s*\((feat|ft)[^)]*\)/i, "")}`;

  // Tudo começa ao mesmo tempo: busca completa (buscador/chave/Invidious) e indicações exatas (Last.fm, Wikidata).
  const searchP = settle(withTimeout(searchYoutubeAny(q, c), 13_000));
  const lfP = settle(withTimeout(lastfmIds(t, c), 11_000));
  const wdP = settle(withTimeout(wikidataIds(t), 10_000));

  const found = await searchP;
  const ranked: YtCandidate[] = (found.ok ? found.value : []).map((r) => ({ ...r, score: scoreCandidate(t, r), via: "busca" }));
  ranked.sort((a, b) => b.score - a.score);
  const quick = ranked.find((r) => !skip.has(r.id));
  if (quick && quick.score >= 60) {
    // Resposta muito boa da busca (título, artista e duração batem): não espera as outras fontes.
    rememberMatch(t, quick.id);
    const extra = fromIndex.filter((x) => !skip.has(x.id) && !ranked.some((r) => r.id === x.id));
    return { videoId: quick.id, alternatives: [...ranked.slice(0, 8), ...extra].slice(0, 10), cached: false };
  }

  const [lf, wd] = await Promise.all([lfP, wdP]);
  // Indicações exatas: conferidas no oEmbed (existe + incorporável) e com bônus por virem de fonte curada.
  const exact: { id: string; via: string }[] = [
    ...(lf.ok ? lf.value.map((id) => ({ id, via: "Last.fm" })) : []),
    ...(wd.ok ? wd.value.map((id) => ({ id, via: "Wikidata" })) : []),
  ].filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i && !skip.has(x.id));
  const checked = await Promise.all(
    exact.slice(0, 5).map(async (x) => {
      const already = ranked.find((r) => r.id === x.id);
      if (already) {
        already.score += 20;
        already.via = `${x.via} + busca`;
        return null;
      }
      const info = await oembedCheck(x.id);
      if (!info) return null;
      const hit: YtHit = { id: x.id, title: info.title, channel: info.channel };
      return { ...hit, score: scoreCandidate(t, hit) + 20, via: x.via } as YtCandidate;
    }),
  );
  for (const cnd of checked) if (cnd) ranked.push(cnd);
  for (const x of fromIndex) {
    const already = ranked.find((r) => r.id === x.id);
    if (already) {
      already.score = Math.max(already.score, x.score);
      already.via = `índice + ${already.via ?? "busca"}`;
    } else if (!skip.has(x.id)) ranked.push(x);
  }
  ranked.sort((a, b) => b.score - a.score);
  const best = ranked.find((r) => r.score >= 30 && !skip.has(r.id)) ?? null;
  if (best) rememberMatch(t, best.id);
  if (!ranked.length && !found.ok && !lf.ok && !wd.ok) throw new Error("nenhuma fonte respondeu");
  return { videoId: best?.id ?? null, alternatives: ranked.slice(0, 8), cached: false };
}

// ---------------------------------------------------------------- letras (LRCLib)
export interface LyricLine {
  at: number;
  text: string;
}
export interface Lyrics {
  synced: LyricLine[];
  plain: string;
}

export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const line of lrc.split(/\r?\n/)) {
    const tags = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const text = line.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of tags) out.push({ at: Number(m[1]) * 60 + Number(m[2]), text });
  }
  return out.sort((a, b) => a.at - b.at);
}

export async function fetchLyrics(t: Track): Promise<Lyrics | null> {
  const base = "https://lrclib.net/api";
  const p = new URLSearchParams({ track_name: t.title, artist_name: t.artist.split(/,| feat\.? /i)[0] });
  if (t.album) p.set("album_name", t.album);
  if (t.duration) p.set("duration", String(Math.round(t.duration)));
  let hit: Record<string, unknown> | null = null;
  try {
    hit = obj(await getJson(`${base}/get?${p}`));
  } catch (first) {
    let list: Record<string, unknown>[] = [];
    try {
      list = arr(await getJson(`${base}/search?track_name=${encodeURIComponent(t.title)}&artist_name=${encodeURIComponent(t.artist)}`));
    } catch (second) {
      // Sem resposta nas duas tentativas: LRCLib fora do ar ou bloqueado nesta rede.
      if (isNetworkError(first) && isNetworkError(second)) throw second;
    }
    hit = list.find((x) => str(x.syncedLyrics)) ?? list[0] ?? null;
  }
  if (!hit) return null;
  const synced = parseLrc(str(hit.syncedLyrics));
  const plain = str(hit.plainLyrics);
  if (!synced.length && !plain) return null;
  return { synced, plain };
}
