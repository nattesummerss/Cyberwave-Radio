// Busca o endereço de transmissão de uma rádio no diretório público Radio Browser
// (https://www.radio-browser.info, dados em domínio público), na hora de tocar.
//
// Usado para rádios cujo endereço muda com frequência ou não foi possível conferir na hora de
// montar o catálogo. O diretório testa os streams periodicamente; aqui só usamos entradas que
// passaram no último teste e que batem com o nome esperado. O resultado fica guardado por 12 h.

import type { StationLookup } from "@/data/stations";

const MIRRORS = ["https://all.api.radio-browser.info", "https://de1.api.radio-browser.info", "https://nl1.api.radio-browser.info", "https://at1.api.radio-browser.info"];
const CACHE_KEY = "radio.lookup";
const CACHE_MS = 12 * 60 * 60_000;
const TIMEOUT_MS = 8_000;
const MAX_URLS = 3;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

interface Entry {
  name?: unknown;
  url_resolved?: unknown;
  url?: unknown;
  lastcheckok?: unknown;
  votes?: unknown;
  codec?: unknown;
}

function readCache(): Record<string, { at: number; urls: string[] }> {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as unknown;
    return raw && typeof raw === "object" ? (raw as Record<string, { at: number; urls: string[] }>) : {};
  } catch {
    return {};
  }
}

function writeCache(key: string, urls: string[]) {
  try {
    const all = readCache();
    all[key] = { at: Date.now(), urls };
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* sem armazenamento */
  }
}

/** Escolhe os endereços: só http(s), nome com todas as palavras exigidas, https primeiro, mais votados primeiro. */
export function pickUrls(entries: unknown, lookup: StationLookup): string[] {
  if (!Array.isArray(entries)) return [];
  const must = (lookup.match ?? []).map(fold);
  const anyOf = (lookup.matchAny ?? []).map(fold);
  const none = (lookup.exclude ?? []).map(fold);
  const scored: { url: string; score: number }[] = [];
  for (const raw of entries.slice(0, 60)) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Entry;
    if (e.lastcheckok !== 1 && e.lastcheckok !== true) continue;
    const name = typeof e.name === "string" ? fold(e.name) : "";
    const hay = ` ${name} `;
    if (must.some((w) => !hay.includes(w))) continue;
    if (anyOf.length && !anyOf.some((w) => hay.includes(w))) continue;
    if (none.some((w) => hay.includes(w))) continue;
    const candidate = typeof e.url_resolved === "string" && e.url_resolved ? e.url_resolved : typeof e.url === "string" ? e.url : "";
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    // O site é https: o navegador bloqueia áudio http (conteúdo misto). Só serve https.
    if (url.protocol !== "https:") continue;
    // Listas de reprodução (.m3u/.pls) não tocam direto no <audio>.
    if (/\.(m3u|pls|asx)(\?|$)/i.test(url.pathname)) continue;
    const votes = typeof e.votes === "number" ? e.votes : 0;
    scored.push({ url: url.href, score: votes });
  }
  scored.sort((a, b) => b.score - a.score);
  const out: string[] = [];
  for (const s of scored) if (!out.includes(s.url) && out.length < MAX_URLS) out.push(s.url);
  return out;
}

async function query(base: string, lookup: StationLookup, signal: AbortSignal): Promise<unknown> {
  const params = new URLSearchParams({ name: lookup.query, hidebroken: "true", order: "votes", reverse: "true", limit: "40" });
  if (lookup.country) params.set("countrycode", lookup.country);
  const res = await fetch(`${base}/json/stations/search?${params}`, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Endereços de transmissão encontrados no diretório (vazio se nada bater). */
export async function lookupStreamUrls(lookup: StationLookup): Promise<string[]> {
  const key = `${lookup.country ?? ""}|${lookup.query}|${(lookup.match ?? []).join(",")}|${(lookup.matchAny ?? []).join(",")}|${(lookup.exclude ?? []).join(",")}`;
  const cached = readCache()[key];
  if (cached && Date.now() - cached.at < CACHE_MS && Array.isArray(cached.urls) && cached.urls.length) return cached.urls.slice(0, MAX_URLS);
  for (const base of MIRRORS) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const urls = pickUrls(await query(base, lookup, ctrl.signal), lookup);
      if (urls.length) writeCache(key, urls);
      return urls;
    } catch {
      /* tenta o próximo espelho */
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw new Error("diretório indisponível");
}
