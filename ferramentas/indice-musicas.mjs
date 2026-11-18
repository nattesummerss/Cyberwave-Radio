// Cyberwave Radio — montador do índice de músicas completas (GitHub Actions). Gerado a partir de src/tools/.

// src/tools/indice-musicas.ts
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// src/lib/music-match.ts
var norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
var coreTitle = (s) => norm(s.replace(/\((?:feat|ft|with|part)[^)]*\)|\[[^\]]*\]|\s-\s.*(?:remaster|version|mix|edit).*$/gi, ""));
var ARTIST_SPLIT = /,|&| feat\.? | ft\.? | x | e /i;
var firstArtist = (a) => a.split(ARTIST_SPLIT)[0]?.trim() || a;
var BAD = ["live", "ao vivo", "en vivo", "cover", "karaoke", "instrumental", "remix", "sped up", "slowed", "reverb", "nightcore", "8d", "reaction", "react", "tutorial", "aula", "acustico", "acoustic", "piano version", "bass boosted", "letra", "lyric", "lyrics", "legendado", "traducao", "tradu\xE7\xE3o", "1 hour", "1 hora", "loop"];
function scoreCandidate(track, c) {
  const want = coreTitle(track.title).split(" ").filter((w) => w.length > 1 || /\d/.test(w));
  const got = norm(c.title);
  const ch = norm(c.channel);
  const artist = norm(firstArtist(track.artist));
  let s = 0;
  const hit = want.filter((w) => ` ${got} `.includes(` ${w} `)).length;
  s += want.length ? Math.round(hit / want.length * 35) : 0;
  if (artist && (` ${got} `.includes(` ${artist} `) || ch.includes(artist))) s += 25;
  if (c.official || / topic$/.test(ch)) s += 15;
  if (/vevo$/.test(ch) || /official (audio|video|music video)|audio oficial|video oficial|clipe oficial/.test(got)) s += 8;
  if (track.duration && c.duration) {
    const d = Math.abs(track.duration - c.duration);
    s += d <= 3 ? 25 : d <= 8 ? 18 : d <= 20 ? 6 : d <= 45 ? -10 : -40;
  }
  const orig = norm(`${track.title} ${track.artist}`);
  for (const b of BAD) if (` ${got} `.includes(` ${norm(b)} `) && !` ${orig} `.includes(` ${norm(b)} `)) s -= b === "lyric" || b === "lyrics" || b === "letra" ? 6 : 30;
  return s;
}
function titleCoverage(track, c) {
  const want = coreTitle(track.title).split(" ").filter((w) => w.length > 1 || /\d/.test(w));
  if (!want.length) return 1;
  const got = ` ${norm(c.title)} `;
  return want.filter((w) => got.includes(` ${w} `)).length / want.length;
}
var VERSION = /\b(remaster(ed|izad[ao])?|version|vers[aã]o|edit|mono|stereo|est[eé]reo|deluxe|explicit|clean|bonus|single|album|original|feat|ft|with|participa[cç][aã]o|from|trilha|soundtrack|tema)\b|\bpart\.\s/i;
var OTHER_RECORDING = /\b(live|ao vivo|en vivo|remix|acoustic|ac[uú]stic[oa]|instrumental|karaoke|sped up|slowed|demo)\b/i;
function indexTitle(title) {
  let s = title.replace(/\s*[([]([^)\]]*)[)\]]/g, (all, inner) => VERSION.test(inner) && !OTHER_RECORDING.test(inner) ? " " : all);
  s = s.replace(/\s+[-–—]\s+(.*)$/, (all, rest) => VERSION.test(rest) && !OTHER_RECORDING.test(rest) ? "" : all);
  return norm(s);
}
var indexKey = (artist, title) => `${norm(firstArtist(artist))}|${indexTitle(title)}`;

// src/lib/yt-parse.ts
var o = (v) => v && typeof v === "object" ? v : {};
var runsText = (v) => {
  const x = o(v);
  if (typeof x.simpleText === "string") return x.simpleText;
  return Array.isArray(x.runs) ? x.runs.map((r) => String(o(r).text ?? "")).join("") : "";
};
function parseClock(s) {
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : void 0;
}
function findVideoId(v, depth = 0) {
  if (depth > 12 || !v || typeof v !== "object") return void 0;
  const x = v;
  if (typeof x.videoId === "string" && /^[\w-]{11}$/.test(x.videoId)) return x.videoId;
  for (const k of Object.keys(x)) {
    const r = findVideoId(x[k], depth + 1);
    if (r) return r;
  }
  return void 0;
}
function fromVideoRenderer(r) {
  const id = typeof r.videoId === "string" ? r.videoId : "";
  if (!/^[\w-]{11}$/.test(id)) return null;
  const len = runsText(r.lengthText);
  if (!len) return null;
  return { id, title: runsText(r.title), channel: runsText(r.ownerText) || runsText(r.longBylineText) || runsText(r.shortBylineText), duration: parseClock(len) };
}
function fromMusicItem(r) {
  const id = (typeof o(r.playlistItemData).videoId === "string" ? o(r.playlistItemData).videoId : "") || findVideoId(o(r.flexColumns));
  if (!id) return null;
  const cols = Array.isArray(r.flexColumns) ? r.flexColumns.map((c) => o(o(c).musicResponsiveListItemFlexColumnRenderer).text) : [];
  const title = runsText(cols[0]);
  const meta = Array.isArray(o(cols[1]).runs) ? o(cols[1]).runs.map((x) => String(o(x).text ?? "")) : [];
  const parts = meta.filter((t) => t.trim() && t.trim() !== "\u2022");
  let duration;
  for (const p of parts) duration ??= parseClock(p);
  for (const c of Array.isArray(r.fixedColumns) ? r.fixedColumns : []) duration ??= parseClock(runsText(o(o(c).musicResponsiveListItemFixedColumnRenderer).text));
  const kind = parts[0] && /^(m[uú]sica|song|v[ií]deo|video)$/i.test(parts[0].trim()) ? parts.shift().trim() : "";
  const channel = parts[0] ?? "";
  if (!title) return null;
  return { id, title, channel, duration, official: !/^v[ií]deo$/i.test(kind) };
}
function parseYoutubeSearch(data, max = 15) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const walk = (v, depth) => {
    if (out.length >= max || depth > 40 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x2 of v) walk(x2, depth + 1);
      return;
    }
    const x = v;
    let hit = null;
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
function lastfmTrackUrl(artist, title) {
  const part = (s) => encodeURIComponent(s.trim()).replace(/%20/g, "+");
  return `https://www.last.fm/music/${part(artist)}/_/${part(title)}`;
}
var unescapeHtml = (s) => s?.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
function lastfmVideos(html) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const m of html.matchAll(/<[a-z]+\b[^>]*\bdata-youtube-id="([\w-]{11})"[^>]*>/gi)) {
    const tag = m[0];
    const attr = (n) => unescapeHtml(tag.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1]);
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ id: m[1], track: attr("data-track-name"), artist: attr("data-artist-name") });
  }
  return out;
}
function clientVersion(prefix, suffix) {
  const d = new Date(Date.now() - 5 * 864e5);
  return `${prefix}.${d.toISOString().slice(0, 10).replace(/-/g, "")}.${suffix}`;
}
var INNERTUBE = {
  music: {
    url: "https://music.youtube.com/youtubei/v1/search?prettyPrint=false",
    body: (q, version = clientVersion("1", "01.00")) => ({
      context: { client: { clientName: "WEB_REMIX", clientVersion: version, hl: "pt", gl: "BR" } },
      query: q,
      params: "EgWKAQIIAWoMEA4QChADEAQQCRAF"
      // filtro "Músicas" (o mesmo do ytmusicapi)
    })
  },
  web: {
    url: "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
    body: (q, version = clientVersion("2", "00.00")) => ({
      context: { client: { clientName: "WEB", clientVersion: version, hl: "pt", gl: "BR" } },
      query: q,
      params: "EgIQAQ=="
      // só vídeos
    })
  },
  html: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D&hl=pt-BR&gl=BR&ucbcb=1`
};

// src/worker/musica-core.ts
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
var COOKIE = "SOCS=CAI; CONSENT=YES+";
async function timed(url, init, ms = 8e3) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
async function innertube(kind, q, ms = 5e3) {
  const cfg = INNERTUBE[kind];
  const res = await timed(cfg.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin: kind === "music" ? "https://music.youtube.com" : "https://www.youtube.com",
      cookie: COOKIE
    },
    body: JSON.stringify(cfg.body(q))
  }, ms);
  if (!res.ok) throw new Error(`${kind} ${res.status}`);
  return parseYoutubeSearch(await res.json(), 12);
}
var simple = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
async function lastfm(artist, title) {
  const res = await timed(lastfmTrackUrl(artist, title), { headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" } }, 7e3);
  if (!res.ok) throw new Error(`lastfm ${res.status}`);
  const vids = lastfmVideos(await res.text());
  const exact = vids.filter((v) => !v.track || simple(v.track) === simple(title));
  return (exact.length ? exact : vids.slice(0, 1)).map((v) => v.id).slice(0, 3);
}

// src/tools/sementes.ts
var PARADAS = {
  /** Apple Music — mais tocadas (mesmos nomes do catálogo iTunes que o site usa). */
  apple: ["br", "us"],
  /** Playlists editoriais do Deezer: Top Brasil e Top Mundo. */
  deezerPlaylists: ["1111141961", "3155776842"]
};
var GENEROS_DEEZER = [132, 116, 152, 113, 165, 85, 106, 464, 169, 75, 197, 144, 84, 129, 153, 466, 186];
var ARTISTAS = [
  // Rock, Alt Metal, Metalcore, Hardcore
  "Linkin Park",
  "Bring Me The Horizon",
  "Slipknot",
  "Breaking Benjamin",
  "Disturbed",
  "Three Days Grace",
  "System Of A Down",
  "Deftones",
  "Korn",
  "Papa Roach",
  "Architects",
  "Parkway Drive",
  "Asking Alexandria",
  "Killswitch Engage",
  "August Burns Red",
  "Bad Omens",
  "Sleep Token",
  "Spiritbox",
  "Falling In Reverse",
  "Avenged Sevenfold",
  "Bullet For My Valentine",
  "Trivium",
  "Of Mice & Men",
  "A Day To Remember",
  "Motionless In White",
  "Ice Nine Kills",
  "I Prevail",
  "Wage War",
  "Beartooth",
  "Memphis May Fire",
  "Atreyu",
  "The Devil Wears Prada",
  "While She Sleeps",
  "Northlane",
  "Polaris",
  "Fit For A King",
  "Knocked Loose",
  "Turnstile",
  "Hatebreed",
  "Stick To Your Guns",
  "Sepultura",
  "Soulfly",
  "Mudvayne",
  "Godsmack",
  "Staind",
  "Chevelle",
  "Shinedown",
  "Starset",
  "Skillet",
  "Evanescence",
  "Within Temptation",
  "Nightwish",
  "Metallica",
  "Iron Maiden",
  "Megadeth",
  "Pantera",
  "Slayer",
  "Black Sabbath",
  "Ozzy Osbourne",
  "AC/DC",
  "Guns N' Roses",
  "Foo Fighters",
  "Nirvana",
  "Pearl Jam",
  "Soundgarden",
  "Alice In Chains",
  "Red Hot Chili Peppers",
  "Queens Of The Stone Age",
  "Muse",
  "Arctic Monkeys",
  "The Killers",
  "Green Day",
  "Blink-182",
  "My Chemical Romance",
  "Paramore",
  "Fall Out Boy",
  "Twenty One Pilots",
  "Imagine Dragons",
  "Rage Against The Machine",
  "Audioslave",
  "Limp Bizkit",
  "Incubus",
  "Hollywood Undead",
  "Five Finger Death Punch",
  "In This Moment",
  "Halestorm",
  "Ghost",
  "Gojira",
  "Mastodon",
  "Lamb Of God",
  "Bad Wolves",
  "Nothing More",
  "Seether",
  "Nickelback",
  "Creed",
  "3 Doors Down",
  "The Pretty Reckless",
  "Pitty",
  "Charlie Brown Jr.",
  "Capital Inicial",
  "Legi\xE3o Urbana",
  "Tit\xE3s",
  "Skank",
  "Os Paralamas Do Sucesso",
  "Bar\xE3o Vermelho",
  "CPM 22",
  "Detonautas Roque Clube",
  "NX Zero",
  "Fresno",
  "Raimundos",
  "O Rappa",
  "Engenheiros Do Hawaii",
  "Cazuza",
  "Raul Seixas",
  "Angra",
  "Project46",
  "Black Pantera",
  "Crypta",
  // R&B
  "The Weeknd",
  "SZA",
  "Beyonc\xE9",
  "Usher",
  "Alicia Keys",
  "Rihanna",
  "Bruno Mars",
  "H.E.R.",
  "Chris Brown",
  "Frank Ocean",
  "Daniel Caesar",
  "Summer Walker",
  "Jhen\xE9 Aiko",
  "Brent Faiyaz",
  "Giveon",
  "Miguel",
  "Ne-Yo",
  "John Legend",
  "Mariah Carey",
  "Whitney Houston",
  "Janet Jackson",
  "TLC",
  "Destiny's Child",
  "Boyz II Men",
  "Aaliyah",
  "Lauryn Hill",
  "Erykah Badu",
  "D'Angelo",
  "Kehlani",
  "Khalid",
  "Tinashe",
  "Victoria Mon\xE9t",
  "Ari Lennox",
  "Jorja Smith",
  "Lucky Daye",
  "6LACK",
  "PARTYNEXTDOOR",
  "Tems",
  "Ella Mai",
  "Bryson Tiller",
  "Jeremih",
  "Mary J. Blige",
  "Toni Braxton",
  "Brandy",
  "Keyshia Cole",
  "Maxwell",
  "Anderson .Paak",
  "Silk Sonic",
  "Leon Bridges",
  "Coco Jones",
  "Muni Long",
  // Pop e sucessos internacionais
  "Taylor Swift",
  "Ed Sheeran",
  "Dua Lipa",
  "Billie Eilish",
  "Ariana Grande",
  "Justin Bieber",
  "Harry Styles",
  "Olivia Rodrigo",
  "Sabrina Carpenter",
  "Coldplay",
  "Maroon 5",
  "Lady Gaga",
  "Katy Perry",
  "Shawn Mendes",
  "Post Malone",
  "Drake",
  "Kendrick Lamar",
  "Eminem",
  "Travis Scott",
  "Doja Cat",
  "Bad Bunny",
  "Shakira",
  "Karol G",
  "Michael Jackson",
  "Queen",
  "The Beatles",
  "ABBA",
  "Madonna",
  "Elton John",
  "David Guetta",
  "Calvin Harris",
  "Avicii",
  "Alok",
  "Kygo",
  "Daft Punk",
  // Brasil
  "Anitta",
  "Ludmilla",
  "Pabllo Vittar",
  "Mar\xEDlia Mendon\xE7a",
  "Henrique & Juliano",
  "Jorge & Mateus",
  "Gusttavo Lima",
  "Z\xE9 Neto & Cristiano",
  "Maiara & Maraisa",
  "Simone Mendes",
  "Luan Santana",
  "Ana Castela",
  "Wesley Safad\xE3o",
  "Matheus & Kauan",
  "Os Bar\xF5es Da Pisadinha",
  "Xand Avi\xE3o",
  "Jo\xE3o Gomes",
  "P\xE9ricles",
  "Thiaguinho",
  "Sorriso Maroto",
  "Grupo Menos \xC9 Mais",
  "Turma do Pagode",
  "Ferrugem",
  "Dilsinho",
  "Zeca Pagodinho",
  "Alcione",
  "Ivete Sangalo",
  "Claudia Leitte",
  "Djavan",
  "Caetano Veloso",
  "Gilberto Gil",
  "Chico Buarque",
  "Tim Maia",
  "Jorge Ben Jor",
  "Marisa Monte",
  "Seu Jorge",
  "Tribalistas",
  "Kid Abelha",
  "Lulu Santos",
  "Roberto Carlos",
  "Racionais MC's",
  "Matu\xEA",
  "Filipe Ret",
  "L7NNON",
  "Veigh",
  "Orochi",
  "MC Cabelinho",
  "MC IG",
  "MC Ryan SP",
  "Kevin O Chris",
  "Pedro Sampaio",
  "Lu\xEDsa Sonza",
  "IZA",
  "Gloria Groove",
  "Liniker",
  "Melim",
  "Vitor Kley",
  "J\xE3o",
  "Marina Sena",
  "Natiruts",
  "Armandinho",
  "Hungria Hip Hop",
  "Projota",
  "Emicida",
  "Criolo",
  "BK'",
  "Djonga",
  // Synthwave / cyber
  "The Midnight",
  "Kavinsky",
  "Perturbator",
  "Carpenter Brut",
  "Gunship",
  "Timecop1983",
  "FM-84",
  "Mitch Murder",
  "Dance With The Dead",
  "Power Glove",
  "Lazerhawk",
  "Com Truise",
  "M83"
];

// src/tools/indice-musicas.ts
var DAY = 864e5;
var MIN_SCORE = 50;
var MIN_COVER = 0.6;
var MAX_IDS = 3;
var VIDEO = /^[\w-]{11}$/;
var emptyState = () => ({ v: 1, faixas: {}, falhas: {}, fila: {}, artistas: {}, sementesEm: 0, pedidosHash: "" });
var str = (v) => typeof v === "string" ? v : "";
var num = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : void 0;
var o2 = (v) => v && typeof v === "object" ? v : {};
var arr = (v) => Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var errMsg = (e) => (e instanceof Error ? e.message : String(e)).slice(0, 140);
var noFeat = (t) => t.replace(/\s*[([](?:feat|ft|with|part\.)[^)\]]*[)\]]/gi, "").trim();
var health = (nome) => ({ nome, ok: 0, falhas: 0, seguidas: 0, desligado: false, ultimoErro: "" });
function mark(h, ok, err) {
  if (ok) {
    h.ok++;
    h.seguidas = 0;
    return;
  }
  h.falhas++;
  h.seguidas++;
  h.ultimoErro = errMsg(err);
  if (h.seguidas >= 8) h.desligado = true;
}
var Limiter = class {
  constructor(gapMs) {
    this.gapMs = gapMs;
  }
  gapMs;
  next = 0;
  async wait() {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.gapMs;
    if (at > now) await sleep(at - now);
  }
};
var ytLimit = { music: new Limiter(100), web: new Limiter(100) };
var deezerLimit = new Limiter(130);
async function deezer(path) {
  for (let i = 0; i < 3; i++) {
    await deezerLimit.wait();
    const res = await timed(`https://api.deezer.com${path}`, { headers: { "user-agent": UA } }, 1e4);
    if (!res.ok) throw new Error(`deezer HTTP ${res.status}`);
    const j = o2(await res.json());
    const err = o2(j.error);
    if (j.error) {
      if (err.code === 4) {
        await sleep(5e3);
        continue;
      }
      throw new Error(`deezer: ${str(err.message) || "erro"}`);
    }
    return j;
  }
  throw new Error("deezer: limite de pedidos");
}
var deezerTracks = (j) => arr(j.data).map((x) => ({ a: str(o2(x.artist).name), t: str(x.title) || str(x.title_short), d: num(x.duration) })).filter((x) => x.a && x.t);
async function appleChart(country) {
  const res = await timed(`https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/100/songs.json`, { headers: { "user-agent": UA } }, 1e4);
  if (!res.ok) throw new Error(`apple HTTP ${res.status}`);
  return arr(o2(o2(await res.json()).feed).results).map((r) => ({ a: str(r.artistName), t: str(r.name) })).filter((x) => x.a && x.t);
}
function youtubeIdFrom(s) {
  const t = s.trim();
  if (VIDEO.test(t)) return t;
  const m = t.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})(?![\w-])/);
  return m?.[1];
}
function parsePedidos(text) {
  const out = [];
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
    out.push({ kind: "texto", linha, a: m[1].trim(), t: m[2].trim(), pin: right ? youtubeIdFrom(right) : void 0 });
  }
  return out;
}
async function main(env = process.env) {
  const t0 = Date.now();
  const minutes = Math.min(20, Math.max(0, Number(env.MUSICAS_MINUTOS || 4) || 0));
  const deadline = t0 + minutes * 6e4;
  const perArtist = Math.min(50, Math.max(1, Number(env.MUSICAS_POR_ARTISTA || 10) || 10));
  const dir = env.MUSICAS_DIR || join(env.HOME || homedir(), ".cache", "cyberwave-musicas");
  const statePath = join(dir, "estado.json");
  const outPath = env.MUSICAS_SAIDA || join("musicas", "indice.json");
  const pedidosPath = env.MUSICAS_PEDIDOS || join("musicas", "pedidos.txt");
  const siteUrl = (env.SITE_URL || "").replace(/\/+$/, "");
  const log = (s) => console.log(s);
  deezerLimit.gapMs = Math.max(0, Number(env.MUSICAS_DEEZER_INTERVALO_MS || 130) || 0);
  ytLimit.music.gapMs = ytLimit.web.gapMs = Math.max(0, Number(env.MUSICAS_YT_INTERVALO_MS || 100) || 0);
  const H = { ytm: health("YouTube Music (busca)"), yt: health("YouTube (busca)"), lastfm: health("Last.fm (v\xEDdeo da faixa)"), oembed: health("Confer\xEAncia no YouTube (oEmbed)"), deezer: health("Deezer (listas de m\xFAsicas)"), apple: health("Apple Music (paradas)") };
  const avisos = [];
  let st = emptyState();
  if (existsSync(statePath)) {
    try {
      st = { ...emptyState(), ...JSON.parse(readFileSync(statePath, "utf8")) };
    } catch {
      avisos.push("O estado salvo estava corrompido; recome\xE7ando a partir do \xEDndice publicado.");
    }
  }
  if (!Object.keys(st.faixas).length && siteUrl) {
    try {
      const res = await timed(`${siteUrl}/musicas/indice.json?t=${Date.now()}`, { headers: { "user-agent": UA } }, 2e4);
      if (res.ok) {
        const f = o2(o2(await res.json()).f);
        for (const [k, v] of Object.entries(f)) {
          const ids = Array.isArray(v) ? v.map(String).filter((x) => VIDEO.test(x)) : [];
          if (ids.length) st.faixas[k] = { a: "", t: "", ids, via: "publicado", s: 0, em: t0 };
        }
        log(`\xCDndice publicado recuperado: ${Object.keys(st.faixas).length} m\xFAsicas.`);
      }
    } catch (e) {
      log(`Sem \xEDndice publicado para recuperar (${errMsg(e)}).`);
    }
  }
  mkdirSync(dir, { recursive: true });
  const saveState = () => {
    const tmp = `${statePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(st));
    renameSync(tmp, statePath);
  };
  const writeIndex = () => {
    const f = {};
    for (const [k, e] of Object.entries(st.faixas)) if (e.ids.length) f[k] = e.ids.slice(0, MAX_IDS);
    mkdirSync(dirname(outPath) || ".", { recursive: true });
    writeFileSync(outPath, JSON.stringify({ v: 1, gerado: (/* @__PURE__ */ new Date()).toISOString(), n: Object.keys(f).length, f }));
    return Object.keys(f).length;
  };
  const existing = writeIndex();
  if (minutes <= 0) {
    log("MUSICAS_MINUTOS=0: s\xF3 publicando o \xEDndice que j\xE1 existe.");
    return { prontas: existing, novas: 0, fila: Object.keys(st.fila).length, naoEncontradas: 0, saude: Object.values(H) };
  }
  const queue = [];
  const queued = /* @__PURE__ */ new Set();
  const enqueue = (a, t, d, p, pin, force = false) => {
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
    st.fila[key] = { a, t, d: d ?? cur?.d, p: Math.min(p, cur?.p ?? p), ...pin ? { pin } : {} };
    queue.push([key, st.fila[key]]);
    queued.add(key);
  };
  const addArtist = (nome, p, id) => {
    const k = indexKey(nome, "x").split("|")[0];
    if (!k) return;
    const cur = st.artistas[k];
    if (!cur) st.artistas[k] = { nome, id, p, em: 0 };
    else {
      if (id && !cur.id) cur.id = id;
      if (p < cur.p) cur.p = p;
    }
  };
  let pedidos = [];
  if (existsSync(pedidosPath)) {
    const text = readFileSync(pedidosPath, "utf8");
    pedidos = parsePedidos(text);
    const hash = createHash("sha1").update(text).digest("hex");
    const changed = hash !== st.pedidosHash;
    for (const ped of pedidos) {
      if (ped.kind === "texto" && ped.a && ped.t) enqueue(ped.a, ped.t, void 0, 0, ped.pin, changed);
    }
    if (changed) {
      for (const ped of pedidos.filter((x) => x.kind === "deezer")) {
        try {
          let kind = ped.deezerKind;
          let id = ped.deezerId;
          if (ped.shortUrl) {
            const res = await timed(ped.shortUrl, { headers: { "user-agent": UA }, redirect: "follow" }, 15e3);
            const m = res.url.match(/deezer\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|playlist|artist)\/(\d+)/i);
            if (!m) throw new Error("link do Deezer n\xE3o reconhecido");
            kind = m[1].toLowerCase();
            id = m[2];
          }
          const path = kind === "track" ? `/track/${id}` : kind === "album" ? `/album/${id}` : kind === "playlist" ? `/playlist/${id}/tracks?limit=300` : `/artist/${id}/top?limit=25`;
          const j = await deezer(path);
          let list = deezerTracks(j);
          if (kind === "track") list = deezerTracks({ data: [j] });
          if (kind === "album") {
            const albumArtist = str(o2(j.artist).name);
            list = arr(o2(j.tracks).data).map((x) => ({ a: str(o2(x.artist).name) || albumArtist, t: str(x.title) || str(x.title_short), d: num(x.duration) })).filter((x) => x.a && x.t);
          }
          for (const x of list) enqueue(x.a, x.t, x.d, 0, void 0, true);
          mark(H.deezer, true);
          log(`Pedido "${ped.linha}": ${list.length} m\xFAsica(s).`);
        } catch (e) {
          mark(H.deezer, false, e);
          avisos.push(`Pedido n\xE3o lido: ${ped.linha} (${errMsg(e)})`);
        }
      }
      st.pedidosHash = hash;
    }
  }
  for (const [k, seed] of Object.entries(st.fila)) {
    if (queued.has(k)) continue;
    queue.push([k, seed]);
    queued.add(k);
  }
  queue.sort((a, b) => a[1].p - b[1].p);
  if (t0 - st.sementesEm > 3 * DAY) {
    const seedDeadline = t0 + (deadline - t0) * 0.25;
    const time = () => Date.now() < seedDeadline;
    let complete = true;
    const step = async (h, run) => {
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
    for (const c of PARADAS.apple) await step(H.apple, async () => (await appleChart(c)).forEach((x) => enqueue(x.a, x.t, void 0, 1)));
    for (const id of PARADAS.deezerPlaylists) await step(H.deezer, async () => deezerTracks(await deezer(`/playlist/${id}/tracks?limit=100`)).forEach((x) => enqueue(x.a, x.t, x.d, 1)));
    await step(H.deezer, async () => deezerTracks(await deezer("/chart/0/tracks?limit=100")).forEach((x) => enqueue(x.a, x.t, x.d, 1)));
    for (const nome of ARTISTAS) addArtist(nome, 2);
    for (const g of GENEROS_DEEZER)
      await step(H.deezer, async () => {
        for (const a of arr((await deezer(`/genre/${g}/artists`)).data).slice(0, 30)) if (str(a.name)) addArtist(str(a.name), 3, num(a.id));
      });
    if (complete) {
      for (const a of Object.values(st.artistas)) if (t0 - a.em > 14 * DAY) a.em = 0;
      st.sementesEm = t0;
    }
    queue.sort((a, b) => a[1].p - b[1].p);
  }
  let expanding = true;
  const expandDeadline = t0 + (deadline - t0) * 0.5;
  const expander = (async () => {
    try {
      const pending = Object.values(st.artistas).filter((a) => !a.em).sort((a, b) => a.p - b.p);
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
  const oembed = async (id) => {
    try {
      const res = await timed(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, { headers: { "user-agent": UA } }, 8e3);
      if (res.status === 401 || res.status === 403) {
        mark(H.oembed, true);
        return { ok: false, motivo: "bloqueado" };
      }
      if (res.status === 404 || res.status === 400) {
        mark(H.oembed, true);
        return { ok: false, motivo: "sumiu" };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = o2(await res.json());
      mark(H.oembed, true);
      return { ok: true, title: str(j.title), channel: str(j.author_name) };
    } catch (e) {
      mark(H.oembed, false, e);
      return { ok: false, motivo: "erro" };
    }
  };
  const isAtv = (h) => h.official === true || / - topic$/i.test(h.channel.trim());
  const ordered = (good) => {
    if (!good.length) return [];
    const best = good[0];
    const first = good.find((c) => c.atv && c.s >= best.s - 10) ?? best;
    const clip = good.find((c) => !c.atv && c !== first);
    return [first, ...clip ? [clip] : [], ...good.filter((c) => c !== first && c !== clip)];
  };
  const resolve = async (seed) => {
    if (seed.pin) {
      const e = H.oembed.desligado ? null : await oembed(seed.pin);
      if (e && !e.ok && e.motivo !== "erro") avisos.push(`O v\xEDdeo fixado para "${seed.a} - ${seed.t}" ${e.motivo === "bloqueado" ? "n\xE3o pode tocar fora do YouTube" : "n\xE3o existe mais"} (${seed.pin}).`);
      return { ids: [seed.pin], via: "pedido (v\xEDdeo fixado)", s: 100, web: false };
    }
    const track = { title: seed.t, artist: seed.a, duration: seed.d };
    const q = `${firstArtist(seed.a)} ${noFeat(seed.t)}`.trim();
    const cands = /* @__PURE__ */ new Map();
    const add = (h, via, bonus = 0) => {
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
        for (const h of await innertube("music", q, 9e3)) add(h, "YouTube Music");
        mark(H.ytm, true);
        answered = true;
      } catch (e) {
        mark(H.ytm, false, e);
      }
    }
    if (!H.yt.desligado) {
      try {
        await ytLimit.web.wait();
        for (const h of await innertube("web", q, 9e3)) add(h, "YouTube");
        mark(H.yt, true);
        answered = true;
        web = true;
      } catch (e) {
        mark(H.yt, false, e);
      }
    }
    if (bestScore() < 60 && !H.lastfm.desligado) {
      try {
        const ids2 = await lastfm(firstArtist(seed.a), noFeat(seed.t));
        mark(H.lastfm, true);
        answered = true;
        for (const id of ids2.slice(0, 2)) {
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
        if (/lastfm 404/.test(errMsg(e))) {
          mark(H.lastfm, true);
          answered = true;
        } else mark(H.lastfm, false, e);
      }
    }
    if (!answered) return "sem-fonte";
    const good = [...cands.values()].filter((c) => c.s >= MIN_SCORE && c.cov >= MIN_COVER).sort((a, b) => b.s - a.s);
    const ids = [];
    let checks = 0;
    for (const c of ordered(good)) {
      if (ids.length >= MAX_IDS) break;
      if (!c.checked && !H.oembed.desligado && checks < 4) {
        checks++;
        c.checked = await oembed(c.id);
      }
      if (c.checked && !c.checked.ok && c.checked.motivo !== "erro") continue;
      ids.push(c.id);
    }
    if (!ids.length) return null;
    const top = good.find((c) => c.id === ids[0]);
    return { ids, via: top.via, s: top.s, web };
  };
  const pendingClip = () => Object.entries(st.faixas).filter(([, e]) => !e.w && !e.via.startsWith("pedido (v\xEDdeo fixado)"));
  const enrichList = pendingClip().map(([k]) => k);
  let conferidas = 0;
  let clipes = 0;
  const enrich = async (key) => {
    const e = st.faixas[key];
    if (!e || e.w) return true;
    const [ka, kt] = key.split("|");
    const track = { title: e.t || kt, artist: e.a || ka, duration: e.d };
    const q = `${firstArtist(track.artist)} ${noFeat(track.title)}`.trim();
    let hits;
    try {
      await ytLimit.web.wait();
      hits = await innertube("web", q, 9e3);
      mark(H.yt, true);
    } catch (err) {
      mark(H.yt, false, err);
      return false;
    }
    const good = hits.filter((h) => VIDEO.test(h.id) && !isAtv(h)).map((h) => ({ id: h.id, s: scoreCandidate(track, h), cov: titleCoverage(track, h) })).filter((c) => c.s >= MIN_SCORE && c.cov >= MIN_COVER).sort((a, b) => b.s - a.s);
    const inList = good.find((c) => e.ids.includes(c.id));
    if (inList) {
      if (e.ids[0] !== inList.id && e.ids[1] !== inList.id) e.ids = [e.ids[0], inList.id, ...e.ids.slice(1).filter((x) => x !== inList.id)].slice(0, MAX_IDS);
    } else {
      for (const c of good.slice(0, 2)) {
        const chk = H.oembed.desligado ? null : await oembed(c.id);
        if (chk && !chk.ok && chk.motivo !== "erro") continue;
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
  const exemplos = [];
  const allSearchOff = () => H.ytm.desligado && H.yt.desligado && H.lastfm.desligado;
  let turn = 0;
  const worker = async (w) => {
    await sleep(w * 150);
    while (Date.now() < deadline && !allSearchOff()) {
      if (enrichList.length && !H.yt.desligado && (turn++ % 2 === 0 || !queue.length)) {
        await enrich(enrichList.shift());
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
      if (st.fila[key] !== seed) continue;
      if (st.faixas[key] && !seed.pin) {
        delete st.fila[key];
        continue;
      }
      let r;
      try {
        r = await resolve(seed);
      } catch (e) {
        log(`Erro em "${seed.a} - ${seed.t}": ${errMsg(e)}`);
        r = "sem-fonte";
      }
      if (r === "sem-fonte") {
        queue.push(item);
        if (allSearchOff()) break;
        continue;
      }
      delete st.fila[key];
      if (r) {
        st.faixas[key] = { a: seed.a, t: seed.t, ids: r.ids, via: r.via, s: r.s, em: Date.now(), ...seed.d ? { d: seed.d } : {}, ...r.web ? { w: 1 } : {} };
        delete st.falhas[key];
        novas++;
        if (exemplos.length < 6) exemplos.push(`${seed.a} \u2013 ${seed.t} \u2192 ${r.ids[0]} (${r.via}, nota ${r.s})`);
      } else {
        st.falhas[key] = { n: (st.falhas[key]?.n ?? 0) + 1, em: Date.now() };
        naoEncontradas++;
      }
      if (++done % 25 === 0) saveState();
      if (done % 200 === 0) {
        writeIndex();
        log(`\u2026 ${done} m\xFAsicas processadas (${novas} prontas nesta execu\xE7\xE3o)`);
      }
    }
  };
  await Promise.all([expander, ...[0, 1, 2, 3].map((w) => worker(w))]);
  saveState();
  const prontas = writeIndex();
  const fila = Object.keys(st.fila).length;
  const secs = Math.round((Date.now() - t0) / 1e3);
  const situacao = (h) => h.desligado ? `BLOQUEADO para os servidores do GitHub nesta execu\xE7\xE3o (${h.ultimoErro || "sem resposta"})` : h.ok + h.falhas === 0 ? "n\xE3o precisou" : h.falhas ? `respondeu ${h.ok} de ${h.ok + h.falhas} vezes (\xFAltimo erro: ${h.ultimoErro})` : `funcionando (${h.ok} pedidos)`;
  const lines = [
    `| M\xFAsicas completas prontas no site | **${prontas.toLocaleString("pt-BR")}** (+${novas} nesta execu\xE7\xE3o) |`,
    `| Esperando na fila | ${fila.toLocaleString("pt-BR")}${fila ? " \u2014 continua na pr\xF3xima execu\xE7\xE3o" : ""} |`,
    `| Sem v\xEDdeo confi\xE1vel nesta execu\xE7\xE3o | ${naoEncontradas} (tenta de novo em 7 dias) |`,
    `| Clipe oficial como 2\xAA op\xE7\xE3o (m\xFAsicas antigas) | ${conferidas} conferidas, ${clipes} clipes adicionados${pendingClip().length ? ` \u2014 faltam ${pendingClip().length.toLocaleString("pt-BR")}, continua na pr\xF3xima execu\xE7\xE3o` : " \u2014 todas conferidas"} |`,
    ...Object.values(H).map((h) => `| ${h.nome} | ${situacao(h)} |`),
    `| Pedidos (musicas/pedidos.txt) | ${pedidos.length ? `${pedidos.length} linha(s)` : "nenhum"} |`,
    `| Tempo | ${Math.floor(secs / 60)} min ${String(secs % 60).padStart(2, "0")} s |`
  ];
  log(lines.join("\n").replace(/\*\*/g, ""));
  if (allSearchOff()) {
    const msg = `O YouTube e o Last.fm n\xE3o responderam aos servidores do GitHub nesta execu\xE7\xE3o; o site continua com as ${prontas} m\xFAsicas que j\xE1 estavam no \xEDndice.`;
    avisos.push(msg);
    if (env.GITHUB_ACTIONS) console.log(`::warning title=M\xFAsicas::${msg}`);
  }
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `
### \xCDndice de m\xFAsicas completas

| | |
|---|---|
${lines.join("\n")}
` + (exemplos.length ? `
Exemplos desta execu\xE7\xE3o:
${exemplos.map((x) => `- ${x}`).join("\n")}
` : "") + (avisos.length ? `
Avisos:
${avisos.map((x) => `- ${x}`).join("\n")}
` : "") + `
Para incluir m\xFAsicas, edite **musicas/pedidos.txt** no reposit\xF3rio (uma por linha: \`Artista - M\xFAsica\`).
`
    );
  }
  return { prontas, novas, fila, naoEncontradas, saude: Object.values(H) };
}
var argv1 = typeof process !== "undefined" ? process.argv[1] ?? "" : "";
if (/indice-musicas\.(mjs|js|ts)$/.test(argv1)) {
  main().catch((e) => {
    console.log(`::warning title=M\xFAsicas::O \xEDndice de m\xFAsicas n\xE3o foi atualizado: ${errMsg(e)}`);
  });
}
export {
  main,
  parsePedidos,
  youtubeIdFrom
};
