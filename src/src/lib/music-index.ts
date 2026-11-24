// Índice de músicas completas da Cyberwave Radio.
//
// O próprio GitHub (passo "Montar o índice de músicas completas" do workflow, código em
// src/tools/indice-musicas.ts) procura no YouTube Music e no Last.fm o vídeo certo de cada música
// popular e publica musicas/indice.json junto com o site. Aqui o site só lê esse arquivo:
// não precisa de Vercel, Cloudflare nem chave, e funciona em qualquer rede que abra o GitHub Pages e o YouTube.

import { indexKeys } from "@/lib/music-match";

export const INDEX_PATH = "musicas/indice.json";

export interface MusicIndex {
  /** Quando o GitHub gerou o arquivo (ISO) — null se ainda não existe. */
  generatedAt: string | null;
  count: number;
  map: Map<string, string[]>;
}

const EMPTY: MusicIndex = { generatedAt: null, count: 0, map: new Map() };
const VIDEO = /^[\w-]{11}$/;
let loading: Promise<MusicIndex> | null = null;

/** Lê o índice uma vez por visita (o navegador ainda guarda o arquivo no cache HTTP). */
export function loadIndex(force = false): Promise<MusicIndex> {
  if (loading && !force) return loading;
  const p = (async () => {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(new URL(INDEX_PATH, document.baseURI).href, { credentials: "omit", signal: ctrl.signal, cache: force ? "no-cache" : "default" });
      if (res.status === 404) return EMPTY; // ainda não gerado
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { gerado?: unknown; f?: unknown };
      const map = new Map<string, string[]>();
      if (data.f && typeof data.f === "object") {
        for (const [k, v] of Object.entries(data.f as Record<string, unknown>)) {
          const ids = Array.isArray(v) ? v.map(String).filter((x) => VIDEO.test(x)) : [];
          if (ids.length) map.set(k, ids);
        }
      }
      return { generatedAt: typeof data.gerado === "string" ? data.gerado : null, count: map.size, map };
    } finally {
      window.clearTimeout(t);
    }
  })();
  // Falha de rede: tenta de novo na próxima música (não guarda o erro).
  p.catch(() => {
    if (loading === p) loading = null;
  });
  loading = p;
  return p;
}

/** Vídeos do índice para a faixa (o primeiro é o melhor), ou [] se ela não está lá. */
export function idsInIndex(idx: MusicIndex, t: { artist: string; title: string }): string[] {
  for (const k of indexKeys(t.artist, t.title)) {
    const ids = idx.map.get(k);
    if (ids?.length) return ids;
  }
  return [];
}

export async function indexLookup(t: { artist: string; title: string }): Promise<string[]> {
  const ids = idsInIndex(await loadIndex(), t);
  // Neste navegador o áudio do YouTube Music (1º do índice) já foi recusado em sites: começa pelo clipe oficial (2º).
  return clipFirstHere() && ids.length > 1 ? [ids[1], ids[0], ...ids.slice(2)] : ids;
}

// O 1º vídeo de cada música no índice é o áudio oficial do YouTube Music; o 2º, quando existe, é o clipe
// oficial. Algumas gravadoras não deixam o áudio tocar em outros sites (erro 150): quando isso acontece com
// duas músicas diferentes neste navegador, o site passa a começar pelo clipe — sem esperar o erro de novo.
const CLIP_FIRST = "musica.clipe-primeiro";
const readBlocked = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(CLIP_FIRST) || "[]") as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

/** O áudio do YouTube Music já foi recusado aqui em pelo menos duas músicas? */
export function clipFirstHere(): boolean {
  return readBlocked().length >= 2;
}

/** Registra que o 1º vídeo do índice desta música foi recusado no player (erro 101/150). `certain` = o teste do diagnóstico confirmou. */
export function noteFirstIndexIdBlocked(trackKey: string, certain = false) {
  const list = readBlocked().filter((k) => k !== trackKey);
  list.push(trackKey);
  if (certain) list.push(`${trackKey}#confirmado`);
  try {
    localStorage.setItem(CLIP_FIRST, JSON.stringify(list.slice(-10)));
  } catch {
    /* sem armazenamento */
  }
}

/** Esquece o aprendizado acima (usado quando a recusa era da rede inteira, não do áudio do YouTube Music). */
export function clearClipFirst() {
  try {
    localStorage.removeItem(CLIP_FIRST);
  } catch {
    /* sem armazenamento */
  }
}
