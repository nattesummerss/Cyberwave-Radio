// Montador do índice de músicas completas da Cyberwave Radio (roda no GitHub Actions, Node 22+).
//
// Por que existe: em muitas redes (computador da empresa/AVD, alguns celulares e operadoras) o navegador
// só alcança o próprio site (github.io), o iTunes e o YouTube — Deezer, Internet Archive, Wikidata,
// Invidious, proxies e a Vercel ficam bloqueados. Então o trabalho de "achar o vídeo certo de cada
// música" (o que o Spotube faz no aparelho) é feito aqui, no servidor do GitHub, e o resultado vai para
// musicas/indice.json, publicado junto com o site. O site só consulta esse arquivo e toca no YouTube.
//
// Cada execução:
//   1. lê o estado salvo (cache do Actions) ou, sem ele, o índice já publicado no site;
//   2. junta as músicas a procurar: musicas/pedidos.txt, paradas do Apple Music e do Deezer, os artistas
//      de src/tools/sementes.ts e os mais ouvidos de cada gênero do Deezer;
//   3. procura cada música no YouTube Music (aba Músicas), no YouTube e no Last.fm e compara título,
//      artista e duração (a mesma nota do site, src/lib/music-match.ts);
//   4. confere no oEmbed do YouTube se o vídeo pode tocar fora do YouTube;
//   5. grava o estado e o índice. Trabalha até MUSICAS_MINUTOS (padrão 4) e continua na próxima execução.
//
// Ordem dos vídeos de cada música (v22): 1º o áudio oficial do YouTube Music; 2º o clipe/vídeo oficial do
// artista. Algumas gravadoras não deixam o áudio do YouTube Music tocar em outros sites (erro 150); aí o
// site passa para o clipe. As músicas que já estavam no índice antes da v22 são conferidas de novo, aos
// poucos, para ganhar o clipe também.
//
// Variáveis (todas opcionais): MUSICAS_MINUTOS, MUSICAS_POR_ARTISTA, MUSICAS_DIR, MUSICAS_SAIDA,
// MUSICAS_PEDIDOS, MUSICAS_DEEZER_INTERVALO_MS, MUSICAS_YT_INTERVALO_MS, SITE_URL (para recuperar o índice
// publicado se o cache sumir), GITHUB_STEP_SUMMARY.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { firstArtist, indexKey, scoreCandidate, titleCoverage } from "../lib/music-match";
import type { YtHit } from "../lib/yt-parse";
import { innertube, lastfm, timed, UA } from "../worker/musica-core";
import { ARTISTAS, GENEROS_DEEZER, PARADAS } from "./sementes";

type Env = Record<string, string | undefined>;
type O = Record<string, unknown>;

const DAY = 86_400_000;
/** Nota mínima para aceitar um vídeo e fração mínima das palavras do título que precisam bater. */
const MIN_SCORE = 50;
const MIN_COVER = 0.6;
/** Vídeos guardados por música (o site tenta o seguinte se um não puder tocar). */
const MAX_IDS = 3;
const VIDEO = /^[\w-]{11}$/;

export interface Seed {
  a: string;
  t: string;
  d?: number;
  /** Prioridade: 0 pedidos, 1 paradas, 2 artistas da rádio, 3 gêneros do Deezer. */
  p: number;
  /** Vídeo fixado pelo dono do site em pedidos.txt. */
  pin?: string;
}
export interface Entry {
  a: string;
  t: string;
  ids: string[];
  via: string;
  s: number;
  em: number;
  /** Duração no catálogo (s). */
  d?: number;
  /** 1 = já procurado também no YouTube comum (clipe oficial como alternativa). */
  w?: 1;
}
interface Fail {
  n: number;
  em: number;
}
interface ArtistSeed {
  nome: string;
  id?: number;
  p: number;
  /** Quando as músicas do artista foram buscadas (0 = ainda não). */
  em: number;
}
export interface State {
  v: 1;
  faixas: Record<string, Entry>;
  falhas: Record<string, Fail>;
  fila: Record<string, Seed>;
  artistas: Record<string, ArtistSeed>;
  sementesEm: number;
  pedidosHash: string;
}

const emptyState = (): State => ({ v: 1, faixas: {}, falhas: {}, fila: {}, artistas: {}, sementesEm: 0, pedidosHash: "" });
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
const o = (v: unknown): O => (v && typeof v === "object" ? (v as O) : {});
const arr = (v: unknown): O[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as O[]) : []);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 140);
const noFeat = (t: string) => t.replace(/\s*[([](?:feat|ft|with|part\.)[^)\]]*[)\]]/gi, "").trim();

// ---------------------------------------------------------------- saúde de cada fonte
interface Health {
  nome: string;
  ok: number;
  falhas: number;
  seguidas: number;
  desligado: boolean;
  ultimoErro: string;
}
const health = (nome: string): Health => ({ nome, ok: 0, falhas: 0, seguidas: 0, desligado: false, ultimoErro: "" });
function mark(h: Health, ok: boolean, err?: unknown) {
  if (ok) {
    h.ok++;
    h.seguidas = 0;
    return;
  }
  h.falhas++;
  h.seguidas++;
  h.ultimoErro = errMsg(err);
  // Muitas falhas seguidas: a fonte bloqueou os servidores do GitHub nesta execução.
  if (h.seguidas >= 8) h.desligado = true;
}

class Limiter {
  private next = 0;
  constructor(public gapMs: number) {}
  async wait() {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.gapMs;
    if (at > now) await sleep(at - now);
  }
}

// Ritmo das buscas no YouTube (cada endereço): educado com o YouTube e longe de bloqueios.
const ytLimit = { music: new Limiter(100), web: new Limiter(100) };

// ---------------------------------------------------------------- fontes de metadados (sementes)
const deezerLimit = new Limiter(130); // limite do Deezer: 50 pedidos a cada 5 s
async function deezer(path: string): Promise<O> {
  for (let i = 0; i < 3; i++) {
    await deezerLimit.wait();
    const res = await timed(`https://api.deezer.com${path}`, { headers: { "user-agent": UA } }, 10_000);
    if (!res.ok) throw new Error(`deezer HTTP ${res.status}`);
    const j = o(await res.json());
    const err = o(j.error);
    if (j.error) {
      if (err.code === 4) {
        await sleep(5000); // "Quota limit exceeded": espera e tenta de novo
        continue;
      }
      throw new Error(`deezer: ${str(err.message) || "erro"}`);
    }
    return j;
  }
  throw new Error("deezer: limite de pedidos");
}
const deezerTracks = (j: O) =>
  arr(j.data)
    .map((x) => ({ a: str(o(x.artist).name), t: str(x.title) || str(x.title_short), d: num(x.duration) }))
    .filter((x) => x.a && x.t);

async function appleChart(country: string) {
  const res = await timed(`https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/100/songs.json`, { headers: { "user-agent": UA } }, 10_000);
  if (!res.ok) throw new Error(`apple HTTP ${res.status}`);
  return arr(o(o(await res.json()).feed).results)
    .map((r) => ({ a: str(r.artistName), t: str(r.name) }))
    .filter((x) => x.a && x.t);
}

// ---------------------------------------------------------------- conferência do vídeo (oEmbed)
type Embed = { ok: true; title: string; channel: string } | { ok: false; motivo: "bloqueado" | "sumiu" | "erro" };

// ---------------------------------------------------------------- pedidos.txt
export interface Pedido {
  kind: "texto" | "deezer";
  linha: string;
  a?: string;
  t?: string;
  pin?: string;
  deezerKind?: string;
  deezerId?: string;
  shortUrl?: string;
}

export function youtubeIdFrom(s: string): string | undefined {
  const t = s.trim();
  if (VIDEO.test(t)) return t;
  const m = t.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})(?![\w-])/);
  return m?.[1];
}

/** Lê musicas/pedidos.txt: "Artista - Música", "Artista - Música | link do YouTube" ou links do Deezer. */
export function parsePedidos(text: string): Pedido[] {
  const out: Pedido[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const linha = raw.trim();
    if (!linha || linha.startsWith("#")) continue;
    const dz = linha.match(/deezer\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|playlist|artist)\/(\d+)/i);
    if (dz) {
      out.push({ kind: "deezer", linha, deezerKind: dz[1].toLowerCase(), deezerId: dz[2] });
      continue;
    }
    if (/^https?:\/\/(link\.deezer\.com|deezer\.page\.link)\//i.test(linha)) {
      out.push({ kind: "deezer", linha, shortUrl: linha.split(/\s/)[0] });
      continue;
    }
    const [left, right] = linha.split(/\s+\|\s+/, 2);
    const m = left.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (!m) continue;
    out.push({ kind: "texto", linha, a: m[1].trim(), t: m[2].trim(), pin: right ? youtubeIdFrom(right) : undefined });
  }
  return out;
}

// ---------------------------------------------------------------- execução
export interface RunResult {
  prontas: number;
  novas: number;
  fila: number;
  naoEncontradas: number;
  saude: Health[];
}

export async function main(env: Env = process.env): Promise<RunResult> {
  const t0 = Date.now();
  const minutes = Math.min(20, Math.max(0, Number(env.MUSICAS_MINUTOS || 4) || 0));
  const deadline = t0 + minutes * 60_000;
  const perArtist = Math.min(50, Math.max(1, Number(env.MUSICAS_POR_ARTISTA || 10) || 10));
  const dir = env.MUSICAS_DIR || join(env.HOME || homedir(), ".cache", "cyberwave-musicas");
  const statePath = join(dir, "estado.json");
  const outPath = env.MUSICAS_SAIDA || join("musicas", "indice.json");
  const pedidosPath = env.MUSICAS_PEDIDOS || join("musicas", "pedidos.txt");
  const siteUrl = (env.SITE_URL || "").replace(/\/+$/, "");
  const log = (s: string) => console.log(s);
  deezerLimit.gapMs = Math.max(0, Number(env.MUSICAS_DEEZER_INTERVALO_MS || 130) || 0);
  ytLimit.music.gapMs = ytLimit.web.gapMs = Math.max(0, Number(env.MUSICAS_YT_INTERVALO_MS || 100) || 0);
  const H = { ytm: health("YouTube Music (busca)"), yt: health("YouTube (busca)"), lastfm: health("Last.fm (vídeo da faixa)"), oembed: health("Conferência no YouTube (oEmbed)"), deezer: health("Deezer (listas de músicas)"), apple: health("Apple Music (paradas)") };
  const avisos: string[] = [];

  // 1) estado
  let st = emptyState();
  if (existsSync(statePath)) {
    try {
      st = { ...emptyState(), ...(JSON.parse(readFileSync(statePath, "utf8")) as Partial<State>) };
    } catch {
      avisos.push("O estado salvo estava corrompido; recomeçando a partir do índice publicado.");
    }
  }
  if (!Object.keys(st.faixas).length && siteUrl) {
    try {
      const res = await timed(`${siteUrl}/musicas/indice.json?t=${Date.now()}`, { headers: { "user-agent": UA } }, 20_000);
      if (res.ok) {
        const f = o(o(await res.json()).f);
        for (const [k, v] of Object.entries(f)) {
          const ids = Array.isArray(v) ? v.map(String).filter((x) => VIDEO.test(x)) : [];
          if (ids.length) st.faixas[k] = { a: "", t: "", ids, via: "publicado", s: 0, em: t0 };
        }
        log(`Índice publicado recuperado: ${Object.keys(st.faixas).length} músicas.`);
      }
    } catch (e) {
      log(`Sem índice publicado para recuperar (${errMsg(e)}).`);
    }
  }
  mkdirSync(dir, { recursive: true });
  const saveState = () => {
    const tmp = `${statePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(st));
    renameSync(tmp, statePath);
  };
  const writeIndex = () => {
    const f: Record<string, string[]> = {};
    for (const [k, e] of Object.entries(st.faixas)) if (e.ids.length) f[k] = e.ids.slice(0, MAX_IDS);
    mkdirSync(dirname(outPath) || ".", { recursive: true });
    writeFileSync(outPath, JSON.stringify({ v: 1, gerado: new Date().toISOString(), n: Object.keys(f).length, f }));
    return Object.keys(f).length;
  };

  // Publica já o índice que existe: se esta execução for interrompida, o site não fica sem ele.
  const existing = writeIndex();
  if (minutes <= 0) {
    log("MUSICAS_MINUTOS=0: só publicando o índice que já existe.");
    return { prontas: existing, novas: 0, fila: Object.keys(st.fila).length, naoEncontradas: 0, saude: Object.values(H) };
  }

  const queue: [string, Seed][] = [];
  const queued = new Set<string>();
  const enqueue = (a: string, t: string, d: number | undefined, p: number, pin?: string, force = false) => {
    const key = indexKey(a, t);
    const [ka, kt] = key.split("|");
    if (!ka || !kt) return;
    const now = Date.now();
    if (pin) {
      if (st.faixas[key]?.ids[0] === pin) return;
    } else {
      if (st.faixas[key]) return;
      const f = st.falhas[key];
      if (f && !force && (f.n >= 3 || now - f.em < 7 * DAY)) return;
    }
    const cur = st.fila[key];
    if (cur && cur.p <= p && !pin) return;
    st.fila[key] = { a, t, d: d ?? cur?.d, p: Math.min(p, cur?.p ?? p), ...(pin ? { pin } : {}) };
    queue.push([key, st.fila[key]]);
    queued.add(key);
  };
  const addArtist = (nome: string, p: number, id?: number) => {
    const k = indexKey(nome, "x").split("|")[0];
    if (!k) return;
    const cur = st.artistas[k];
    if (!cur) st.artistas[k] = { nome, id, p, em: 0 };
    else {
      if (id && !cur.id) cur.id = id;
      if (p < cur.p) cur.p = p;
    }
  };

  // 2) pedidos do dono do site
  let pedidos: Pedido[] = [];
  if (existsSync(pedidosPath)) {
    const text = readFileSync(pedidosPath, "utf8");
    pedidos = parsePedidos(text);
    const hash = createHash("sha1").update(text).digest("hex");
    const changed = hash !== st.pedidosHash;
    for (const ped of pedidos) {
      if (ped.kind === "texto" && ped.a && ped.t) enqueue(ped.a, ped.t, undefined, 0, ped.pin, changed);
    }
    if (changed) {
      for (const ped of pedidos.filter((x) => x.kind === "deezer")) {
        try {
          let kind = ped.deezerKind;
          let id = ped.deezerId;
          if (ped.shortUrl) {
            const res = await timed(ped.shortUrl, { headers: { "user-agent": UA }, redirect: "follow" }, 15_000);
            const m = res.url.match(/deezer\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|playlist|artist)\/(\d+)/i);
            if (!m) throw new Error("link do Deezer não reconhecido");
            kind = m[1].toLowerCase();
            id = m[2];
          }
          const path = kind === "track" ? `/track/${id}` : kind === "album" ? `/album/${id}` : kind === "playlist" ? `/playlist/${id}/tracks?limit=300` : `/artist/${id}/top?limit=25`;
          const j = await deezer(path);
          let list = deezerTracks(j);
          if (kind === "track") list = deezerTracks({ data: [j] });
          if (kind === "album") {
            // Álbum: as faixas vêm dentro do álbum; se alguma vier sem artista, usa o do álbum.
            const albumArtist = str(o(j.artist).name);
            list = arr(o(j.tracks).data)
              .map((x) => ({ a: str(o(x.artist).name) || albumArtist, t: str(x.title) || str(x.title_short), d: num(x.duration) }))
              .filter((x) => x.a && x.t);
          }
          for (const x of list) enqueue(x.a, x.t, x.d, 0, undefined, true);
          mark(H.deezer, true);
          log(`Pedido "${ped.linha}": ${list.length} música(s).`);
        } catch (e) {
          mark(H.deezer, false, e);
          avisos.push(`Pedido não lido: ${ped.linha} (${errMsg(e)})`);
        }
      }
      st.pedidosHash = hash;
    }
  }

  // Fila que sobrou da execução anterior (em ordem de prioridade).
  for (const [k, seed] of Object.entries(st.fila)) {
    if (queued.has(k)) continue;
    queue.push([k, seed]);
    queued.add(k);
  }
  queue.sort((a, b) => a[1].p - b[1].p);

  // 3) paradas e listas de artistas (a cada 3 dias; no máximo 1/4 do tempo — o resto fica para a próxima)
  if (t0 - st.sementesEm > 3 * DAY) {
    const seedDeadline = t0 + (deadline - t0) * 0.25;
    const time = () => Date.now() < seedDeadline;
    let complete = true;
    const step = async (h: Health, run: () => Promise<void>) => {
      if (!time() || h.desligado) {
        complete = false;
        return;
      }
      try {
        await run();
        mark(h, true);
      } catch (e) {
        mark(h, false, e);
      }
    };
    for (const c of PARADAS.apple) await step(H.apple, async () => (await appleChart(c)).forEach((x) => enqueue(x.a, x.t, undefined, 1)));
    for (const id of PARADAS.deezerPlaylists) await step(H.deezer, async () => deezerTracks(await deezer(`/playlist/${id}/tracks?limit=100`)).forEach((x) => enqueue(x.a, x.t, x.d, 1)));
    await step(H.deezer, async () => deezerTracks(await deezer("/chart/0/tracks?limit=100")).forEach((x) => enqueue(x.a, x.t, x.d, 1)));
    for (const nome of ARTISTAS) addArtist(nome, 2);
    for (const g of GENEROS_DEEZER)
      await step(H.deezer, async () => {
        for (const a of arr((await deezer(`/genre/${g}/artists`)).data).slice(0, 30)) if (str(a.name)) addArtist(str(a.name), 3, num(a.id));
      });
    if (complete) {
      // Paradas mudam: as músicas das paradas antigas que já estão no índice continuam nele.
      for (const a of Object.values(st.artistas)) if (t0 - a.em > 14 * DAY) a.em = 0;
      st.sementesEm = t0;
    }
    queue.sort((a, b) => a[1].p - b[1].p);
  }

  // 4) músicas de cada artista (em paralelo com a busca dos vídeos; usa no máximo metade do tempo)
  let expanding = true;
  const expandDeadline = t0 + (deadline - t0) * 0.5;
  const expander = (async () => {
    try {
      const pending = Object.values(st.artistas)
        .filter((a) => !a.em)
        .sort((a, b) => a.p - b.p);
      for (const a of pending) {
        if (Date.now() > expandDeadline || H.deezer.desligado) break;
        try {
          if (!a.id) {
            const hit = arr((await deezer(`/search/artist?q=${encodeURIComponent(a.nome)}&limit=1`)).data)[0];
            a.id = num(hit?.id);
            if (!a.id) {
              a.em = Date.now();
              continue;
            }
          }
          for (const x of deezerTracks(await deezer(`/artist/${a.id}/top?limit=${perArtist}`))) enqueue(x.a, x.t, x.d, a.p);
          a.em = Date.now();
          mark(H.deezer, true);
        } catch (e) {
          mark(H.deezer, false, e);
        }
      }
    } finally {
      expanding = false;
    }
  })();

  // 5) busca dos vídeos
  const oembed = async (id: string): Promise<Embed> => {
    try {
      const res = await timed(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, { headers: { "user-agent": UA } }, 8000);
      if (res.status === 401 || res.status === 403) {
        mark(H.oembed, true);
        return { ok: false, motivo: "bloqueado" };
      }
      if (res.status === 404 || res.status === 400) {
        mark(H.oembed, true);
        return { ok: false, motivo: "sumiu" };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = o(await res.json());
      mark(H.oembed, true);
      return { ok: true, title: str(j.title), channel: str(j.author_name) };
    } catch (e) {
      mark(H.oembed, false, e);
      return { ok: false, motivo: "erro" };
    }
  };

  interface Cand {
    id: string;
    s: number;
    cov: number;
    via: string;
    /** Áudio oficial do YouTube Music (faixa do canal "Artista - Topic"). */
    atv: boolean;
    checked?: Embed;
  }
  const isAtv = (h: YtHit) => h.official === true || / - topic$/i.test(h.channel.trim());
  /** 1º o áudio oficial (se a nota for quase a melhor), 2º um clipe/vídeo oficial (alternativa para sites), depois o resto. */
  const ordered = (good: Cand[]): Cand[] => {
    if (!good.length) return [];
    const best = good[0];
    const first = good.find((c) => c.atv && c.s >= best.s - 10) ?? best;
    const clip = good.find((c) => !c.atv && c !== first);
    return [first, ...(clip ? [clip] : []), ...good.filter((c) => c !== first && c !== clip)];
  };
  const resolve = async (seed: Seed): Promise<{ ids: string[]; via: string; s: number; web: boolean } | null | "sem-fonte"> => {
    if (seed.pin) {
      const e = H.oembed.desligado ? null : await oembed(seed.pin);
      if (e && !e.ok && e.motivo !== "erro") avisos.push(`O vídeo fixado para "${seed.a} - ${seed.t}" ${e.motivo === "bloqueado" ? "não pode tocar fora do YouTube" : "não existe mais"} (${seed.pin}).`);
      return { ids: [seed.pin], via: "pedido (vídeo fixado)", s: 100, web: false };
    }
    const track = { title: seed.t, artist: seed.a, duration: seed.d };
    const q = `${firstArtist(seed.a)} ${noFeat(seed.t)}`.trim();
    const cands = new Map<string, Cand>();
    const add = (h: YtHit, via: string, bonus = 0) => {
      if (!VIDEO.test(h.id)) return;
      const s = scoreCandidate(track, h) + bonus;
      const prev = cands.get(h.id);
      const atv = isAtv(h) || !!prev?.atv;
      if (!prev || s > prev.s) cands.set(h.id, { id: h.id, s, cov: titleCoverage(track, h), via: prev ? `${prev.via} + ${via}` : via, atv, checked: prev?.checked });
      else prev.atv = atv;
    };
    const bestScore = () => Math.max(0, ...[...cands.values()].filter((c) => c.cov >= MIN_COVER).map((c) => c.s));
    let answered = false;
    let web = false;
    if (!H.ytm.desligado) {
      try {
        await ytLimit.music.wait();
        for (const h of await innertube("music", q, 9000)) add(h, "YouTube Music");
        mark(H.ytm, true);
        answered = true;
      } catch (e) {
        mark(H.ytm, false, e);
      }
    }
    // Sempre procura também no YouTube comum: o clipe oficial é a alternativa quando a gravadora não deixa o
    // áudio do YouTube Music tocar em outros sites (erro 150 no player).
    if (!H.yt.desligado) {
      try {
        await ytLimit.web.wait();
        for (const h of await innertube("web", q, 9000)) add(h, "YouTube");
        mark(H.yt, true);
        answered = true;
        web = true;
      } catch (e) {
        mark(H.yt, false, e);
      }
    }
    if (bestScore() < 60 && !H.lastfm.desligado) {
      try {
        const ids = await lastfm(firstArtist(seed.a), noFeat(seed.t));
        mark(H.lastfm, true);
        answered = true;
        for (const id of ids.slice(0, 2)) {
          const known = cands.get(id);
          if (known) {
            known.s += 20;
            known.via += " + Last.fm";
            continue;
          }
          const e = await oembed(id);
          if (e.ok) {
            add({ id, title: e.title, channel: e.channel }, "Last.fm", 20);
            const c = cands.get(id);
            if (c) c.checked = e;
          }
        }
      } catch (e) {
        // Página da faixa inexistente não é falha do Last.fm.
        if (/lastfm 404/.test(errMsg(e))) {
          mark(H.lastfm, true);
          answered = true;
        } else mark(H.lastfm, false, e);
      }
    }
    if (!answered) return "sem-fonte";
    const good = [...cands.values()].filter((c) => c.s >= MIN_SCORE && c.cov >= MIN_COVER).sort((a, b) => b.s - a.s);
    const ids: string[] = [];
    let checks = 0;
    for (const c of ordered(good)) {
      if (ids.length >= MAX_IDS) break;
      if (!c.checked && !H.oembed.desligado && checks < 4) {
        checks++;
        c.checked = await oembed(c.id);
      }
      if (c.checked && !c.checked.ok && c.checked.motivo !== "erro") continue; // incorporação proibida ou vídeo removido
      ids.push(c.id);
    }
    if (!ids.length) return null;
    const top = good.find((c) => c.id === ids[0])!;
    return { ids, via: top.via, s: top.s, web };
  };

  // Músicas que já estavam no índice antes da v22: procura o clipe oficial e o coloca como 2ª opção.
  const pendingClip = () => Object.entries(st.faixas).filter(([, e]) => !e.w && !e.via.startsWith("pedido (vídeo fixado)"));
  const enrichList = pendingClip().map(([k]) => k);
  let conferidas = 0;
  let clipes = 0;
  const enrich = async (key: string): Promise<boolean> => {
    const e = st.faixas[key];
    if (!e || e.w) return true;
    const [ka, kt] = key.split("|");
    const track = { title: e.t || kt, artist: e.a || ka, duration: e.d };
    const q = `${firstArtist(track.artist)} ${noFeat(track.title)}`.trim();
    let hits: YtHit[];
    try {
      await ytLimit.web.wait();
      hits = await innertube("web", q, 9000);
      mark(H.yt, true);
    } catch (err) {
      mark(H.yt, false, err);
      return false; // fica para a próxima execução
    }
    const good = hits
      .filter((h) => VIDEO.test(h.id) && !isAtv(h))
      .map((h) => ({ id: h.id, s: scoreCandidate(track, h), cov: titleCoverage(track, h) }))
      .filter((c) => c.s >= MIN_SCORE && c.cov >= MIN_COVER)
      .sort((a, b) => b.s - a.s);
    const inList = good.find((c) => e.ids.includes(c.id));
    if (inList) {
      // O clipe já estava guardado: só garante que ele é a 2ª opção.
      if (e.ids[0] !== inList.id && e.ids[1] !== inList.id) e.ids = [e.ids[0], inList.id, ...e.ids.slice(1).filter((x) => x !== inList.id)].slice(0, MAX_IDS);
    } else {
      for (const c of good.slice(0, 2)) {
        const chk = H.oembed.desligado ? null : await oembed(c.id);
        if (chk && !chk.ok && chk.motivo !== "erro") continue; // incorporação proibida ou removido
        e.ids = [e.ids[0], c.id, ...e.ids.slice(1)].slice(0, MAX_IDS);
        clipes++;
        break;
      }
    }
    e.w = 1;
    conferidas++;
    return true;
  };

  let novas = 0;
  let naoEncontradas = 0;
  let done = 0;
  const exemplos: string[] = [];
  const allSearchOff = () => H.ytm.desligado && H.yt.desligado && H.lastfm.desligado;
  let turn = 0;
  const worker = async (w: number) => {
    await sleep(w * 150);
    while (Date.now() < deadline && !allSearchOff()) {
      // Metade das vezes confere uma música antiga (clipe oficial); a outra metade procura uma nova.
      if (enrichList.length && !H.yt.desligado && (turn++ % 2 === 0 || !queue.length)) {
        await enrich(enrichList.shift()!);
        if (++done % 25 === 0) saveState();
        if (done % 200 === 0) writeIndex();
        continue;
      }
      const item = queue.shift();
      if (!item) {
        if (!expanding) break;
        await sleep(300);
        continue;
      }
      const [key, seed] = item;
      if (st.fila[key] !== seed) continue; // substituído por um pedido de prioridade maior
      if (st.faixas[key] && !seed.pin) {
        delete st.fila[key];
        continue;
      }
      let r: Awaited<ReturnType<typeof resolve>>;
      try {
        r = await resolve(seed);
      } catch (e) {
        log(`Erro em "${seed.a} - ${seed.t}": ${errMsg(e)}`);
        r = "sem-fonte";
      }
      if (r === "sem-fonte") {
        queue.push(item); // fica para a próxima execução
        if (allSearchOff()) break;
        continue;
      }
      delete st.fila[key];
      if (r) {
        st.faixas[key] = { a: seed.a, t: seed.t, ids: r.ids, via: r.via, s: r.s, em: Date.now(), ...(seed.d ? { d: seed.d } : {}), ...(r.web ? { w: 1 as const } : {}) };
        delete st.falhas[key];
        novas++;
        if (exemplos.length < 6) exemplos.push(`${seed.a} – ${seed.t} → ${r.ids[0]} (${r.via}, nota ${r.s})`);
      } else {
        st.falhas[key] = { n: (st.falhas[key]?.n ?? 0) + 1, em: Date.now() };
        naoEncontradas++;
      }
      if (++done % 25 === 0) saveState();
      if (done % 200 === 0) {
        writeIndex();
        log(`… ${done} músicas processadas (${novas} prontas nesta execução)`);
      }
    }
  };
  await Promise.all([expander, ...[0, 1, 2, 3].map((w) => worker(w))]);

  // 6) grava e resume
  saveState();
  const prontas = writeIndex();
  const fila = Object.keys(st.fila).length;
  const secs = Math.round((Date.now() - t0) / 1000);
  const situacao = (h: Health) =>
    h.desligado
      ? `BLOQUEADO para os servidores do GitHub nesta execução (${h.ultimoErro || "sem resposta"})`
      : h.ok + h.falhas === 0
        ? "não precisou"
        : h.falhas
          ? `respondeu ${h.ok} de ${h.ok + h.falhas} vezes (último erro: ${h.ultimoErro})`
          : `funcionando (${h.ok} pedidos)`;
  const lines = [
    `| Músicas completas prontas no site | **${prontas.toLocaleString("pt-BR")}** (+${novas} nesta execução) |`,
    `| Esperando na fila | ${fila.toLocaleString("pt-BR")}${fila ? " — continua na próxima execução" : ""} |`,
    `| Sem vídeo confiável nesta execução | ${naoEncontradas} (tenta de novo em 7 dias) |`,
    `| Clipe oficial como 2ª opção (músicas antigas) | ${conferidas} conferidas, ${clipes} clipes adicionados${pendingClip().length ? ` — faltam ${pendingClip().length.toLocaleString("pt-BR")}, continua na próxima execução` : " — todas conferidas"} |`,
    ...Object.values(H).map((h) => `| ${h.nome} | ${situacao(h)} |`),
    `| Pedidos (musicas/pedidos.txt) | ${pedidos.length ? `${pedidos.length} linha(s)` : "nenhum"} |`,
    `| Tempo | ${Math.floor(secs / 60)} min ${String(secs % 60).padStart(2, "0")} s |`,
  ];
  log(lines.join("\n").replace(/\*\*/g, ""));
  if (allSearchOff()) {
    const msg = `O YouTube e o Last.fm não responderam aos servidores do GitHub nesta execução; o site continua com as ${prontas} músicas que já estavam no índice.`;
    avisos.push(msg);
    if (env.GITHUB_ACTIONS) console.log(`::warning title=Músicas::${msg}`);
  }
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `\n### Índice de músicas completas\n\n| | |\n|---|---|\n${lines.join("\n")}\n` +
        (exemplos.length ? `\nExemplos desta execução:\n${exemplos.map((x) => `- ${x}`).join("\n")}\n` : "") +
        (avisos.length ? `\nAvisos:\n${avisos.map((x) => `- ${x}`).join("\n")}\n` : "") +
        `\nPara incluir músicas, edite **musicas/pedidos.txt** no repositório (uma por linha: \`Artista - Música\`).\n`,
    );
  }
  return { prontas, novas, fila, naoEncontradas, saude: Object.values(H) };
}

// Rodando direto (node ferramentas/indice-musicas.mjs): executa e sai com código 0 mesmo se as fontes
// falharem — o site é publicado do mesmo jeito.
const argv1 = typeof process !== "undefined" ? process.argv[1] ?? "" : "";
if (/indice-musicas\.(mjs|js|ts)$/.test(argv1)) {
  main().catch((e: unknown) => {
    console.log(`::warning title=Músicas::O índice de músicas não foi atualizado: ${errMsg(e)}`);
  });
}
