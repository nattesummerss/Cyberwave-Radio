// Rádios descobertas automaticamente (passo "Descobrir rádios novas" do .github/workflows/noticias.yml).
//
// Uma vez por dia o GitHub procura no diretório público Radio Browser rádios da StreamTheWorld (as únicas
// que tocam na rede da empresa/AVD) para as abas R&B, Rock internacional, Esportes, Internacionais e
// Web e outras cidades, confere se cada uma toca e publica radios-extras.json junto com o site.
// Aqui o site lê esse arquivo, confere cada entrada (só endereços da StreamTheWorld, textos curtos e
// simples) e junta as rádios às abas. A última lista fica guardada no navegador para abrir sem espera.

import type { Station } from "@/data/stations";
import { tritonMountExact } from "@/lib/triton-live";

export type ExtraTab = "rnb" | "rock" | "sports" | "intl" | "web";

export interface ExtrasInfo {
  stations: Station[];
  /** Quando o GitHub fez a última busca (ms desde 1970); null se não informado. */
  updatedAt: number | null;
}

const EXTRAS_URL = "./radios-extras.json";
const STORAGE_KEY = "radio.descobertas";
const URL_RE = /^https:\/\/playerservices\.streamtheworld\.com\/api\/livestream-redirect\/([A-Za-z0-9_]{3,40})\.(aac|mp3)$/;
const ID_RE = /^extra-[a-z0-9-]{2,60}$/;
const TABS: readonly ExtraTab[] = ["rnb", "rock", "sports", "intl", "web"];
const MAX_STATIONS = 1500;
const STW = "https://playerservices.streamtheworld.com/api/livestream-redirect/";
/** Rádios descobertas há menos que isso ganham o selo NOVA. */
export const NEW_FOR_MS = 3 * 24 * 3600 * 1000;

const EMPTY: ExtrasInfo = { stations: [], updatedAt: null };

/** Mesma rádio em formatos diferentes (WRATFMAACIHR, WRATFM) vira a mesma chave. Igual a key_of() do GitHub. */
export function mountKey(mount: string): string {
  let k = mount.toUpperCase().replace(/_SC$/, "");
  for (let i = 0; i < 3; i++) {
    const n = k.replace(/(?:IHR|_ADP|_?AAC\d?|_MP3)$/, "").replace(/_(?:24|32|40|48|56|64|96|128|192)$/, "");
    if (n === k || n.length < 3) break;
    k = n;
  }
  return k;
}

/** Chave da rádio da StreamTheWorld a partir do endereço; null para outros servidores. */
export function stationKey(url: string): string | null {
  const mount = tritonMountExact(url);
  return mount ? mountKey(mount) : null;
}

const text = (v: unknown, max: number): string =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f\u007f<>{}\\]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

const time = (v: unknown): number | null => {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/** Confere o conteúdo de radios-extras.json e transforma em rádios do catálogo (as que já estão no site ficam de fora). */
export function parseExtras(raw: unknown, builtIn: readonly Station[]): ExtrasInfo {
  if (!raw || typeof raw !== "object") return EMPTY;
  const list = (raw as { stations?: unknown }).stations;
  if (!Array.isArray(list)) return EMPTY;
  const taken = new Set<string>();
  for (const s of builtIn) {
    for (const u of [s.streamUrl, ...(s.tritonCandidates ?? []).map((m) => `${STW}${m}.aac`)]) {
      const k = u ? stationKey(u) : null;
      if (k) taken.add(k);
    }
  }
  const ids = new Set(builtIn.map((s) => s.id));
  const out: Station[] = [];
  for (const item of list.slice(0, MAX_STATIONS)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const url = typeof o.url === "string" ? o.url : "";
    const tab = TABS.find((t) => t === o.tab);
    const m = URL_RE.exec(url);
    if (!ID_RE.test(id) || ids.has(id) || !m || !tab) continue;
    const key = mountKey(m[1]!);
    const name = text(o.name, 60);
    if (taken.has(key) || name.length < 2) continue;
    const fala = text(o.fala, 200);
    const bitrate = typeof o.bitrate === "number" && Number.isInteger(o.bitrate) && o.bitrate >= 8 && o.bitrate <= 512 ? o.bitrate : undefined;
    ids.add(id);
    taken.add(key);
    out.push({
      id,
      name,
      shortName: name.length > 18 ? `${name.slice(0, 17)}…` : name,
      city: null,
      place: text(o.place, 40) || "Web",
      genre: text(o.genre, 40) || "Variedades",
      streamUrl: url,
      codec: m[2] === "mp3" ? "MP3" : "AAC",
      ...(bitrate ? { bitrate } : {}),
      ...(tab === "intl" ? { intl: true } : tab === "rock" ? { rock: true } : tab === "rnb" ? { rnb: true } : tab === "sports" ? { sports: true } : {}),
      extra: true,
      addedAt: time(o.addedAt) ?? 0,
      ...(fala.startsWith("Você está ouvindo ") ? { fala } : {}),
    });
  }
  // As mais novas primeiro (logo depois das rádios fixas de cada aba).
  out.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  return { stations: out, updatedAt: time((raw as { updatedAt?: unknown }).updatedAt) };
}

/** Última lista recebida, guardada neste navegador (para a aba já abrir com as rádios descobertas). */
export function cachedExtras(builtIn: readonly Station[]): ExtrasInfo {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseExtras(JSON.parse(raw), builtIn) : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Busca radios-extras.json publicado pelo GitHub. null = não deu para ler agora (fica a lista guardada). */
export async function loadExtras(builtIn: readonly Station[]): Promise<ExtrasInfo | null> {
  try {
    const r = await fetch(EXTRAS_URL, { cache: "no-cache" });
    if (r.status === 404) {
      // Site ainda sem o arquivo (o passo do GitHub não rodou): nenhuma rádio descoberta.
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* sem armazenamento */
      }
      return EMPTY;
    }
    if (!r.ok) return null;
    const body = await r.text();
    const info = parseExtras(JSON.parse(body), builtIn);
    try {
      if (body.length < 2_000_000) localStorage.setItem(STORAGE_KEY, body);
    } catch {
      /* armazenamento cheio ou bloqueado: só não guarda */
    }
    return info;
  } catch {
    return null;
  }
}

/** Rádio descoberta há pouco tempo (selo NOVA). */
export const isNewExtra = (s: Station, now = Date.now()) => !!s.extra && !!s.addedAt && now - s.addedAt < NEW_FOR_MS && s.addedAt <= now + 3600_000;
