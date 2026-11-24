// Comparação "é a mesma gravação?" entre uma faixa do catálogo e um vídeo do YouTube.
// Arquivo sem DOM: é usado pelo site (src/lib/music-catalog.ts) e pelo montador do índice de
// músicas completas que roda no GitHub Actions (src/tools/indice-musicas.ts).

/** Só o que a comparação precisa saber da faixa do catálogo. */
export interface MatchTrack {
  title: string;
  artist: string;
  duration?: number;
}

/** Só o que a comparação precisa saber do vídeo. */
export interface MatchVideo {
  title: string;
  channel: string;
  duration?: number;
  /** Resultado da aba "Músicas" do YouTube Music (áudio oficial do artista/gravadora). */
  official?: boolean;
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const coreTitle = (s: string) => norm(s.replace(/\((?:feat|ft|with|part)[^)]*\)|\[[^\]]*\]|\s-\s.*(?:remaster|version|mix|edit).*$/gi, ""));

const ARTIST_SPLIT = /,|&| feat\.? | ft\.? | x | e /i;
export const firstArtist = (a: string) => a.split(ARTIST_SPLIT)[0]?.trim() || a;

const BAD = ["live", "ao vivo", "en vivo", "cover", "karaoke", "instrumental", "remix", "sped up", "slowed", "reverb", "nightcore", "8d", "reaction", "react", "tutorial", "aula", "acustico", "acoustic", "piano version", "bass boosted", "letra", "lyric", "lyrics", "legendado", "traducao", "tradução", "1 hour", "1 hora", "loop"];

/** Nota de "é a mesma gravação?" — título, artista, duração, canal oficial e palavras proibidas. */
export function scoreCandidate(track: MatchTrack, c: MatchVideo): number {
  const want = coreTitle(track.title).split(" ").filter((w) => w.length > 1 || /\d/.test(w));
  const got = norm(c.title);
  const ch = norm(c.channel);
  const artist = norm(firstArtist(track.artist));
  let s = 0;
  const hit = want.filter((w) => ` ${got} `.includes(` ${w} `)).length;
  s += want.length ? Math.round((hit / want.length) * 35) : 0;
  if (artist && (` ${got} `.includes(` ${artist} `) || ch.includes(artist))) s += 25;
  if (c.official || / topic$/.test(ch)) s += 15; // YouTube Music "Músicas" ou canal "Artista - Topic"
  if (/vevo$/.test(ch) || /official (audio|video|music video)|audio oficial|video oficial|clipe oficial/.test(got)) s += 8;
  if (track.duration && c.duration) {
    const d = Math.abs(track.duration - c.duration);
    s += d <= 3 ? 25 : d <= 8 ? 18 : d <= 20 ? 6 : d <= 45 ? -10 : -40;
  }
  const orig = norm(`${track.title} ${track.artist}`);
  for (const b of BAD) if (` ${got} `.includes(` ${norm(b)} `) && !` ${orig} `.includes(` ${norm(b)} `)) s -= b === "lyric" || b === "lyrics" || b === "letra" ? 6 : 30;
  return s;
}

/** Fração das palavras do título da faixa que aparecem no título do vídeo (0 a 1). */
export function titleCoverage(track: MatchTrack, c: MatchVideo): number {
  const want = coreTitle(track.title).split(" ").filter((w) => w.length > 1 || /\d/.test(w));
  if (!want.length) return 1;
  const got = ` ${norm(c.title)} `;
  return want.filter((w) => got.includes(` ${w} `)).length / want.length;
}

// ---- chave do índice de músicas completas
// A mesma música aparece com nomes um pouco diferentes no iTunes e no Deezer
// ("Numb" / "Numb (Remastered 2023)" / "Numb - Radio Edit"). A chave ignora essas variações,
// mas mantém o que muda a gravação (ao vivo, remix, acústico).
// "part." (participação) sai; "Part 2" fica — é outra música.
const VERSION = /\b(remaster(ed|izad[ao])?|version|vers[aã]o|edit|mono|stereo|est[eé]reo|deluxe|explicit|clean|bonus|single|album|original|feat|ft|with|participa[cç][aã]o|from|trilha|soundtrack|tema)\b|\bpart\.\s/i;
const OTHER_RECORDING = /\b(live|ao vivo|en vivo|remix|acoustic|ac[uú]stic[oa]|instrumental|karaoke|sped up|slowed|demo)\b/i;

/** Título sem as marcações de versão que não mudam a gravação. */
export function indexTitle(title: string): string {
  let s = title.replace(/\s*[([]([^)\]]*)[)\]]/g, (all, inner: string) => (VERSION.test(inner) && !OTHER_RECORDING.test(inner) ? " " : all));
  s = s.replace(/\s+[-–—]\s+(.*)$/, (all, rest: string) => (VERSION.test(rest) && !OTHER_RECORDING.test(rest) ? "" : all));
  return norm(s);
}

/** Cada artista citado ("A & B feat. C" → A, B, C), na ordem. */
export function artistsOf(artist: string): string[] {
  const list = artist
    .split(ARTIST_SPLIT)
    .map((a) => norm(a))
    .filter(Boolean);
  return list.length ? [...new Set(list)] : [norm(artist)];
}

/** Chave principal da faixa no índice: "artista principal|título". */
export const indexKey = (artist: string, title: string) => `${norm(firstArtist(artist))}|${indexTitle(title)}`;

/** Todas as chaves com que a faixa pode estar no índice (um artista por vez). */
export const indexKeys = (artist: string, title: string) => {
  const t = indexTitle(title);
  return artistsOf(artist).map((a) => `${a}|${t}`);
};
