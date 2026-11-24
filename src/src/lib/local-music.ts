// Músicas do aparelho (offline) — como a "biblioteca local" do Spotube.
// Os arquivos que o ouvinte escolhe ficam guardados no próprio navegador (IndexedDB), só naquele
// aparelho: tocam sem internet, com nome/artista/capa lidos das etiquetas ID3 do MP3 (ou do nome do arquivo).
// Nada é enviado para servidor nenhum.

export interface LocalSong {
  id: string;
  title: string;
  artist: string;
  album?: string;
  size: number;
  type: string;
  added: number;
  blob: Blob;
  art?: Blob;
}

const DB_NAME = "cyberwave-musicas";
const STORE = "faixas";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("Este navegador não guarda arquivos (IndexedDB indisponível)."));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB"));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r ? r.result : undefined);
      t.onerror = () => reject(t.error ?? new Error("IndexedDB"));
      t.onabort = () => reject(t.error ?? new Error("Sem espaço no aparelho"));
    });
  } finally {
    db.close();
  }
}

export async function listLocal(): Promise<LocalSong[]> {
  const all = ((await tx<LocalSong[]>("readonly", (s) => s.getAll() as IDBRequest<LocalSong[]>)) ?? []) as LocalSong[];
  return all.sort((a, b) => a.artist.localeCompare(b.artist, "pt-BR") || a.title.localeCompare(b.title, "pt-BR"));
}

export async function getLocal(id: string): Promise<LocalSong | undefined> {
  return (await tx<LocalSong>("readonly", (s) => s.get(id) as IDBRequest<LocalSong>)) ?? undefined;
}

let playingUrl: string | null = null;
/** Endereço temporário (blob:) para tocar a faixa guardada; o anterior é liberado. */
export async function localPlayUrl(id: string): Promise<string> {
  const song = await getLocal(id);
  if (!song) throw new Error("A música não está mais guardada neste aparelho.");
  if (playingUrl) URL.revokeObjectURL(playingUrl);
  playingUrl = URL.createObjectURL(song.blob);
  return playingUrl;
}

const artUrls = new Map<string, string>();
/** Capa guardada (um endereço por faixa, reaproveitado). */
export function localArtUrl(song: Pick<LocalSong, "id" | "art">): string | undefined {
  if (!song.art) return undefined;
  let u = artUrls.get(song.id);
  if (!u) {
    u = URL.createObjectURL(song.art);
    artUrls.set(song.id, u);
  }
  return u;
}

export async function removeLocal(id: string): Promise<void> {
  await tx("readwrite", (s) => {
    s.delete(id);
  });
}

export async function clearLocal(): Promise<void> {
  await tx("readwrite", (s) => {
    s.clear();
  });
}

export async function storageInfo(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && e.quota ? { usage: e.usage ?? 0, quota: e.quota } : null;
  } catch {
    return null;
  }
}

export const fmtBytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

// ---------------------------------------------------------------- etiquetas (ID3)
interface Tags {
  title?: string;
  artist?: string;
  album?: string;
  art?: Blob;
}

const syncsafe = (b: Uint8Array, i: number) => ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];

function decodeText(enc: number, bytes: Uint8Array): string {
  const label = enc === 0 ? "iso-8859-1" : enc === 1 ? "utf-16" : enc === 2 ? "utf-16be" : "utf-8";
  try {
    return new TextDecoder(label).decode(bytes).replace(/\0+$/g, "").split("\0")[0].trim();
  } catch {
    return "";
  }
}

/** Lê ID3v2.2/2.3/2.4 (título, artista, álbum, capa) do começo de um MP3. */
export function parseId3v2(b: Uint8Array): Tags {
  const out: Tags = {};
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return out;
  const ver = b[3];
  const end = Math.min(b.length, 10 + syncsafe(b, 6));
  let i = 10;
  if (b[5] & 0x40 && ver >= 3) i += ver === 4 ? syncsafe(b, 10) : be32(b, 10) + 4; // cabeçalho estendido
  const idLen = ver === 2 ? 3 : 4;
  const hdrLen = ver === 2 ? 6 : 10;
  while (i + hdrLen <= end) {
    const id = String.fromCharCode(...b.subarray(i, i + idLen));
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    const size = ver === 2 ? (b[i + 3] << 16) | (b[i + 4] << 8) | b[i + 5] : ver === 4 ? syncsafe(b, i + 4) : be32(b, i + 4);
    const start = i + hdrLen;
    if (size <= 0 || start + size > end) break;
    const data = b.subarray(start, start + size);
    if (id === "TIT2" || id === "TT2") out.title ||= decodeText(data[0], data.subarray(1));
    else if (id === "TPE1" || id === "TP1") out.artist ||= decodeText(data[0], data.subarray(1));
    else if (id === "TALB" || id === "TAL") out.album ||= decodeText(data[0], data.subarray(1));
    else if ((id === "APIC" || id === "PIC") && !out.art) {
      const enc = data[0];
      let p = 1;
      let mime = "image/jpeg";
      if (id === "PIC") {
        mime = String.fromCharCode(...data.subarray(1, 4)).toLowerCase() === "png" ? "image/png" : "image/jpeg";
        p = 4;
      } else {
        const z = data.indexOf(0, 1);
        mime = String.fromCharCode(...data.subarray(1, z)) || mime;
        p = z + 1;
      }
      p += 1; // tipo da imagem
      if (enc === 1 || enc === 2) {
        while (p + 1 < data.length && !(data[p] === 0 && data[p + 1] === 0)) p += 2;
        p += 2;
      } else {
        while (p < data.length && data[p] !== 0) p++;
        p += 1;
      }
      if (p < data.length) out.art = new Blob([data.slice(p)], { type: mime.includes("/") ? mime : `image/${mime}` });
    }
    i = start + size;
  }
  return out;
}

/** ID3v1 (128 bytes no fim do arquivo). */
export function parseId3v1(b: Uint8Array): Tags {
  if (b.length !== 128 || b[0] !== 0x54 || b[1] !== 0x41 || b[2] !== 0x47) return {};
  const txt = (s: number) => decodeText(0, b.subarray(s, s + 30));
  return { title: txt(3) || undefined, artist: txt(33) || undefined, album: txt(63) || undefined };
}

/** "01 - Artista - Música.mp3" → { artist, title } */
export function tagsFromName(name: string): { title: string; artist: string } {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_/g, " ").replace(/^\s*\d{1,3}\s*[-.)]\s*/, "").trim();
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  return { artist: "Arquivo do aparelho", title: base || name };
}

async function readTags(file: File): Promise<Tags> {
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    let tags: Tags = {};
    if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      const len = Math.min(file.size, 10 + syncsafe(head, 6) + 10);
      tags = parseId3v2(new Uint8Array(await file.slice(0, Math.min(len, 8 * 1024 * 1024)).arrayBuffer()));
    }
    if ((!tags.title || !tags.artist) && file.size > 128) {
      const v1 = parseId3v1(new Uint8Array(await file.slice(file.size - 128).arrayBuffer()));
      tags = { ...v1, ...Object.fromEntries(Object.entries(tags).filter(([, v]) => v)) };
    }
    return tags;
  } catch {
    return {};
  }
}

const AUDIO_EXT = /\.(mp3|m4a|aac|mp4|ogg|oga|opus|wav|flac|webm)$/i;

/** Guarda os arquivos escolhidos. Devolve quantos entraram e quantos foram ignorados. */
export async function addLocalFiles(files: File[], onProgress?: (done: number, total: number) => void): Promise<{ added: number; skipped: number }> {
  const audio = files.filter((f) => f.type.startsWith("audio/") || AUDIO_EXT.test(f.name));
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* o navegador pode recusar; os arquivos ainda ficam guardados */
  }
  let added = 0;
  for (const [n, f] of audio.entries()) {
    const tags = await readTags(f);
    const byName = tagsFromName(f.name);
    const song: LocalSong = {
      id: `${f.name}|${f.size}|${f.lastModified}`,
      title: tags.title || byName.title,
      artist: tags.artist || byName.artist,
      album: tags.album || undefined,
      size: f.size,
      type: f.type || "audio/mpeg",
      added: Date.now(),
      blob: f,
      art: tags.art,
    };
    await tx("readwrite", (s) => {
      s.put(song);
    });
    added++;
    onProgress?.(n + 1, audio.length);
  }
  return { added, skipped: files.length - audio.length };
}
