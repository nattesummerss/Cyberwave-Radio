// Estabilidade das rádios em cada aparelho (computador, celular, área de trabalho virtual / AVD).
//
// - Lembra o endereço que funcionou quando o principal falhou, para a próxima vez começar por ele.
// - Testa as rádios no próprio aparelho (a rede de uma empresa ou de uma AVD pode bloquear
//   servidores que funcionam em casa) e guarda o resultado neste navegador.

import { mp3StreamUrl, setResolvedStream, streamUrlOf, type Station } from "@/data/stations";
import { lookupStreamUrls } from "@/lib/station-lookup";
import { provisionTriton, tritonMountExact, tritonStatusOf, tritonStatusText } from "@/lib/triton-live";
import { SITE_VERSION } from "@/lib/version";

const OK_KEY = "radio.ok-url";
const TEST_KEY = "radio.teste";

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
    return v && typeof v === "object" ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* navegador sem armazenamento: só não lembra */
  }
}

const isHttps = (u: string) => /^https:\/\//i.test(u);
const STW_REDIRECT = "https://playerservices.streamtheworld.com/api/livestream-redirect/";

/** Endereço de reserva que tocou da última vez (quando o principal falhou). */
export function rememberedUrl(stationId: string): string | null {
  const v = readJson<Record<string, unknown>>(OK_KEY, {})[stationId];
  return typeof v === "string" && isHttps(v) ? v : null;
}
export function rememberUrl(stationId: string, url: string | null) {
  const all = readJson<Record<string, string>>(OK_KEY, {});
  if (url && isHttps(url)) all[stationId] = url;
  else delete all[stationId];
  writeJson(OK_KEY, all);
}

export type ProbeResult = { ok: boolean; ms: number; url: string; error: string };

/**
 * Tenta tocar o endereço sem som e espera o primeiro áudio chegar.
 * Usa um elemento <audio> igual ao do player, então o resultado vale para este aparelho e esta rede.
 */
export function probeStream(url: string, timeoutMs = 12_000): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    const a = new Audio();
    a.muted = true;
    a.preload = "auto";
    let done = false;
    const finish = (ok: boolean, error = "") => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      a.removeAttribute("src");
      try {
        a.load();
      } catch {
        /* ignora */
      }
      resolve({ ok, ms: Math.round(performance.now() - started), url, error });
    };
    const timer = window.setTimeout(() => finish(false, "sem resposta em " + Math.round(timeoutMs / 1000) + " s"), timeoutMs);
    a.addEventListener("playing", () => finish(true));
    a.addEventListener("loadeddata", () => finish(true));
    a.addEventListener("error", () => {
      const code = a.error?.code;
      finish(false, code === 4 ? "formato ou endereço recusado" : code === 2 ? "falha de rede" : "erro ao tocar");
    });
    a.src = url;
    a.play().catch(() => {
      /* o resultado vem pelos eventos acima */
    });
  });
}

export type StationCheck = { id: string; ok: boolean; ms: number; error: string; url: string };
export type CheckReport = { at: number; results: Record<string, StationCheck> };

export function readReport(): CheckReport | null {
  const r = readJson<CheckReport | null>(TEST_KEY, null);
  return r && typeof r.at === "number" && r.results && typeof r.results === "object" ? r : null;
}
export function saveReport(r: CheckReport) {
  writeJson(TEST_KEY, r);
}

/** Endereços a testar para uma rádio, na mesma ordem que o player usa. */
export function candidateUrls(s: Station): string[] {
  const list = [rememberedUrl(s.id), streamUrlOf(s), mp3StreamUrl(s)].filter((u): u is string => !!u && isHttps(u));
  return [...new Set(list)];
}

/** Testa uma rádio: o primeiro endereço que tocar vale. */
export async function checkStation(s: Station, timeoutMs?: number): Promise<StationCheck> {
  let urls = candidateUrls(s);
  // Rádio sem endereço fixo (ex.: Nativa, Energia 97): pergunta à StreamTheWorld, como o player faz.
  if (!urls.length && s.tritonCandidates?.length) {
    for (const m of s.tritonCandidates) {
      if (await provisionTriton(m).catch(() => null)) {
        urls = [`${STW_REDIRECT}${m}.aac`];
        break;
      }
    }
  }
  if (!urls.length && s.lookup) urls = await lookupStreamUrls(s.lookup).catch(() => [] as string[]);
  if (!urls.length) return { id: s.id, ok: false, ms: 0, url: "", error: "nenhum endereço encontrado" };
  let last: ProbeResult | null = null;
  for (const url of urls) {
    last = await probeStream(url, timeoutMs);
    if (last.ok) {
      if (!s.streamUrl) setResolvedStream(s.id, url);
      return { id: s.id, ok: true, ms: last.ms, url, error: "" };
    }
  }
  const error = last?.error ?? "falhou";
  return { id: s.id, ok: false, ms: last?.ms ?? 0, url: last?.url ?? "", error: await withTritonReason(urls, error) };
}

/**
 * Rádio da StreamTheWorld que não tocou: pergunta à Triton o motivo (404 = não existe mais; 453 = bloqueada para
 * o país/rede deste aparelho) e junta ao erro. Sem resposta da Triton, fica só o erro do navegador.
 */
async function withTritonReason(urls: string[], error: string): Promise<string> {
  const mount = urls.map(tritonMountExact).find((m): m is string => !!m);
  if (!mount) return error;
  await provisionTriton(mount).catch(() => null);
  const st = tritonStatusOf(mount);
  return st ? `${error}; ${tritonStatusText(st)}` : error;
}

const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return "?";
  }
};

/** Aba do site em que a rádio aparece (para o relatório). */
export function tabOf(s: Station): string {
  if (s.custom) return "Minhas rádios";
  if (s.outside) return "Fora da empresa";
  if (s.sports) return "Esportes";
  if (s.city === "sp") return "São Paulo";
  if (s.city === "rj") return "Rio de Janeiro";
  if (s.city === "bh") return "Belo Horizonte";
  if (s.rock) return "Rock";
  if (s.rnb) return "R&B";
  if (s.intl) return "Internacionais";
  return "Web";
}

/**
 * Texto do teste para colar numa mensagem de suporte: cada rádio com o servidor que respondeu (ou não).
 * Mostra quais servidores a rede deste aparelho deixa tocar (ex.: na AVD, só alguns passam).
 */
export function stationCheckReport(stations: Station[], report: CheckReport): string {
  const rows = stations.filter((s) => report.results[s.id]);
  const ok = rows.filter((s) => report.results[s.id]!.ok);
  const bad = rows.filter((s) => !report.results[s.id]!.ok);
  const urlOf = (s: Station) => report.results[s.id]!.url || streamUrlOf(s);
  const hosts = (list: Station[]) => {
    const count = new Map<string, number>();
    for (const s of list) {
      const u = urlOf(s);
      const h = u ? hostOf(u) : "sem endereço";
      count.set(h, (count.get(h) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([h, n]) => `${h} (${n})`).join(", ") || "nenhum";
  };
  const line = (s: Station) => {
    const r = report.results[s.id]!;
    const u = urlOf(s);
    return `${r.ok ? "OK    " : "FALHOU"} [${tabOf(s)}${s.extra ? " • descoberta" : ""}] ${s.name} — ${r.ok ? `${(r.ms / 1000).toFixed(1)} s` : r.error} — ${u ? hostOf(u) : "sem endereço"}`;
  };
  const main = rows.filter((s) => !s.outside);
  const outside = rows.filter((s) => s.outside);
  const found = rows.filter((s) => s.extra);
  const okIn = (list: Station[]) => list.filter((s) => report.results[s.id]!.ok).length;
  return [
    `Cyberwave Radio ${SITE_VERSION} — teste de rádios neste aparelho (${new Date(report.at).toLocaleString("pt-BR")})`,
    `Navegador: ${typeof navigator !== "undefined" ? navigator.userAgent : "?"}`,
    `Resultado: ${ok.length} tocaram • ${bad.length} não tocaram • ${rows.length}/${stations.length} testadas`,
    `Abas principais: ${okIn(main)} de ${main.length} tocaram • Aba Fora da empresa: ${okIn(outside)} de ${outside.length} tocaram (na rede da empresa elas não tocam)`,
    ...(found.length ? [`Rádios descobertas automaticamente (já contadas nas abas principais): ${okIn(found)} de ${found.length} tocaram`] : []),
    `Servidores que tocaram: ${hosts(ok)}`,
    `Servidores que falharam: ${hosts(bad)}`,
    "",
    ...bad.map(line),
    ...ok.map(line),
  ].join("\n");
}

/* ---------- Teste feito pelo GitHub (radios-status.json, publicado junto com o site) ---------- */

export interface ServerCheck {
  ok: boolean;
  /** Endereço que respondeu quando não foi o principal (reserva ou diretório). */
  url: string | null;
  /** Testes seguidos sem resposta. */
  fails: number;
}

let serverChecks: Record<string, ServerCheck> = {};
let serverP: Promise<void> | null = null;
const serverListeners = new Set<() => void>();

/** Carrega (uma vez por sessão) o resultado do último teste das rádios feito pelo GitHub. */
export function loadServerChecks(): Promise<void> {
  serverP ??= fetch("./radios-status.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((raw: unknown) => {
      const st = raw && typeof raw === "object" ? (raw as { stations?: unknown }).stations : null;
      if (!st || typeof st !== "object") return;
      const out: Record<string, ServerCheck> = {};
      for (const [id, v] of Object.entries(st as Record<string, unknown>)) {
        if (!v || typeof v !== "object") continue;
        const o = v as Record<string, unknown>;
        out[id] = {
          ok: o.ok === true,
          url: typeof o.url === "string" && isHttps(o.url) && o.url.length < 500 ? o.url : null,
          fails: typeof o.fails === "number" && Number.isFinite(o.fails) ? Math.max(0, Math.floor(o.fails)) : 0,
        };
      }
      serverChecks = out;
      serverListeners.forEach((f) => f());
    })
    .catch(() => {});
  return serverP;
}
export function serverCheck(id: string): ServerCheck | null {
  return serverChecks[id] ?? null;
}
/** Avisa quando o resultado do GitHub chegar (para mostrar os selos "instável"). */
export function onServerChecks(f: () => void): () => void {
  serverListeners.add(f);
  return () => serverListeners.delete(f);
}
