// Conexão "oficial" da Triton Digital (StreamTheWorld) para players HTML5:
//
// 1. Provisionamento: pergunta à Triton em qual servidor está o stream da rádio.
// 2. O áudio toca direto desse servidor, com um código de sessão (sbmid).
// 3. Sideband Metadata (SBM): um canal de eventos (Server-Sent Events) no mesmo servidor,
//    com o mesmo código, avisa em tempo real a música que entra no ar.
//
// Documentação: help.tritondigital.com/docs/sideband-metadata e /docs/provisioning-response.
// Tudo o que vem desses serviços é dado de terceiros: os endereços são validados antes de
// serem usados e os textos são mostrados como texto simples.

import type { Track } from "@/lib/now-playing";

const PROVISION_BASE = "https://playerservices.streamtheworld.com/api/livestream";
const HOST_RE = /^[a-z0-9-]{1,40}\.live\.streamtheworld\.com$/i;
const MOUNT_RE = /^[A-Za-z0-9_]{1,60}$/;
const SUFFIX_RE = /^_[A-Za-z0-9]{1,10}$/;
const CACHE_MS = 5 * 60_000;
const TIMEOUT_MS = 6000;

export interface TritonLive {
  mount: string;
  host: string;
  /** Sufixo do stream Shoutcast (ex.: "_SC"). */
  streamSuffix: string;
  /** Sufixo do canal de metadados (ex.: "_SBM"), ou null se a rádio não oferece. */
  sbmSuffix: string | null;
}

/** Nome exato do ponto de montagem de um endereço StreamTheWorld (mantém maiúsculas/minúsculas). */
export function tritonMountExact(streamUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(streamUrl);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const isRedirect = host === "playerservices.streamtheworld.com" && u.pathname.startsWith("/api/livestream-redirect/");
  if (!isRedirect && !HOST_RE.test(host)) return null;
  const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
  const mount = last.replace(/\.(aac|mp3)$/i, "").replace(/_SC$/, "");
  return MOUNT_RE.test(mount) ? mount : null;
}

const cache = new Map<string, { at: number; value: TritonLive | null }>();

/** Resultado do provisionamento já guardado (undefined = ainda não consultado ou expirado). */
export function cachedProvision(mount: string): TritonLive | null | undefined {
  const hit = cache.get(mount);
  if (!hit || Date.now() - hit.at > CACHE_MS) return undefined;
  return hit.value;
}

function byName(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS("*", name));
}

/** Lê o XML de provisionamento da Triton; null se a rádio não estiver disponível. */
export function parseProvision(xml: string, mount: string): TritonLive | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (byName(doc, "parsererror").length) return null;
  for (const mp of byName(doc, "mountpoint")) {
    const code = byName(mp, "status-code")[0]?.textContent?.trim();
    if (code !== "200") continue;
    const servers = byName(mp, "server")
      .map((s) => ({
        host: byName(s, "ip")[0]?.textContent?.trim() ?? "",
        https: byName(s, "port").some((p) => p.textContent?.trim() === "443" || p.getAttribute("type") === "https"),
      }))
      .filter((s) => HOST_RE.test(s.host));
    const server = servers.find((s) => s.https) ?? servers[0];
    if (!server) continue;
    const sse = byName(mp, "sse-sideband")[0];
    const sseOn = sse?.getAttribute("enabled") === "true";
    const sbm = sse?.getAttribute("metadataSuffix") || sse?.getAttribute("mountSuffix") || "";
    const streamSuffix = sse?.getAttribute("streamSuffix") || "_SC";
    return {
      mount,
      host: server.host.toLowerCase(),
      streamSuffix: SUFFIX_RE.test(streamSuffix) ? streamSuffix : "_SC",
      sbmSuffix: sseOn && SUFFIX_RE.test(sbm) ? sbm : null,
    };
  }
  return null;
}

/** Situação do ponto de montagem segundo a Triton (documentação "Mount Status Codes"). */
export interface TritonStatus {
  /** 200 = no ar; 404 = não existe; 453 = acesso negado (ex.: bloqueio por país/rede); 400/501 = pedido inválido. */
  code: string;
  /** Texto curto da Triton (sempre em inglês), só para mostrar. */
  message: string;
  /** Montagem alternativa que a Triton oferece quando bloqueia (código 453), se houver. */
  alternateMount: string | null;
}

/** Lê o código de situação do primeiro ponto de montagem do XML de provisionamento. */
export function parseProvisionStatus(xml: string): TritonStatus | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (byName(doc, "parsererror").length) return null;
  const mp = byName(doc, "mountpoint")[0];
  if (!mp) return null;
  const code = (byName(mp, "status-code")[0]?.textContent ?? "").trim();
  if (!/^\d{3}$/.test(code)) return null;
  const message = (byName(mp, "status-message")[0]?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const alt = byName(mp, "alternate-content")[0];
  const altMount = alt ? (byName(alt, "mount")[0]?.textContent ?? "").trim() : "";
  return { code, message, alternateMount: MOUNT_RE.test(altMount) ? altMount : null };
}

const statusCache = new Map<string, TritonStatus | null>();

/** Situação da última consulta à Triton para esta montagem (null = sem consulta ou resposta ilegível). */
export function tritonStatusOf(mount: string): TritonStatus | null {
  return statusCache.get(mount) ?? null;
}

/** Explicação em português da situação da Triton, para o teste de rádios. */
export function tritonStatusText(st: TritonStatus): string {
  if (st.code === "404") return "a StreamTheWorld diz que este ponto não existe mais (404)";
  if (st.code === "453") return "a StreamTheWorld bloqueou esta rádio para o país/rede deste aparelho (453)";
  if (st.code === "200") return "a StreamTheWorld diz que a rádio está no ar (200), mas o áudio não chegou aqui";
  return `a StreamTheWorld respondeu ${st.code}${st.message ? ` (${st.message})` : ""}`;
}

const inflight = new Map<string, Promise<TritonLive | null>>();

/** Pergunta à Triton em qual servidor tocar a rádio (com cache de 5 minutos). Lança erro se o serviço falhar. */
export function provisionTriton(mount: string): Promise<TritonLive | null> {
  const known = cachedProvision(mount);
  if (known !== undefined) return Promise.resolve(known);
  const pending = inflight.get(mount);
  if (pending) return pending;
  const p = fetchProvision(mount).finally(() => inflight.delete(mount));
  inflight.set(mount, p);
  return p;
}

async function fetchProvision(mount: string): Promise<TritonLive | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `${PROVISION_BASE}?version=1.10&mount=${encodeURIComponent(mount)}&lang=pt`;
    const res = await fetch(url, { signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const value = parseProvision(xml, mount);
    cache.set(mount, { at: Date.now(), value });
    statusCache.set(mount, parseProvisionStatus(xml));
    return value;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Código de sessão aleatório (UUID versão 4, minúsculo), exigido pela Triton a cada conexão. */
export function newSbmId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const sbmStreamUrl = (l: TritonLive, sbmid: string) =>
  `https://${l.host}/${encodeURIComponent(l.mount)}${l.streamSuffix}?sbmid=${sbmid}`;
export const sbmMetadataUrl = (l: TritonLive, sbmid: string) =>
  `https://${l.host}/${encodeURIComponent(l.mount)}${l.sbmSuffix ?? "_SBM"}?sbmid=${sbmid}`;

export type CuePoint =
  | { kind: "track"; timestamp: number; track: Track }
  | { kind: "ad"; timestamp: number; durationMs?: number };

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 200) : "");

/** Converte um evento do canal SBM em ponto de marcação (música ou intervalo); ignora o resto. */
export function parseSbmEvent(data: string): CuePoint | null {
  let msg: { type?: unknown; name?: unknown; timestamp?: unknown; parameters?: Record<string, unknown> };
  try {
    msg = JSON.parse(data);
  } catch {
    return null;
  }
  if (!msg || msg.type !== "onCuePoint") return null;
  const p = msg.parameters ?? {};
  const timestamp = Number(msg.timestamp);
  const ts = Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0;
  const dur = Number(clean(p.cue_time_duration));
  if (msg.name === "ad") return { kind: "ad", timestamp: ts, durationMs: dur > 0 ? dur : undefined };
  if (msg.name !== "track") return null;
  let title = clean(p.cue_title) || clean(p.track_title);
  let artist = clean(p.track_artist_name);
  if (!artist && title.includes(" - ")) {
    const [a, ...rest] = title.split(" - ");
    artist = (a ?? "").trim();
    title = rest.join(" - ").trim();
  }
  if (!title) return null;
  return {
    kind: "track",
    timestamp: ts,
    track: {
      title,
      artist,
      album: clean(p.track_album_name) || undefined,
      startedAt: Date.now(),
      durationMs: dur > 0 ? dur : undefined,
    },
  };
}

export type SbmState = "connecting" | "on" | "failed";

/**
 * Abre o canal de metadados. Se cair, tenta de novo com espera crescente (2 s, 4 s, 8 s, 16 s),
 * como pede a Triton, e desiste depois disso. Devolve a função que fecha o canal.
 */
export function openSideband(url: string, onCue: (c: CuePoint) => void, onState: (s: SbmState) => void): () => void {
  let es: EventSource | null = null;
  let timer = 0;
  let tries = 0;
  let closed = false;
  const connect = () => {
    if (closed) return;
    onState("connecting");
    es = new EventSource(url);
    es.onopen = () => {
      tries = 0;
      onState("on");
    };
    es.onmessage = (ev: MessageEvent<string>) => {
      const cue = parseSbmEvent(ev.data);
      if (cue) onCue(cue);
    };
    es.onerror = () => {
      es?.close();
      es = null;
      if (closed) return;
      tries += 1;
      if (tries > 4) {
        onState("failed");
        return;
      }
      timer = window.setTimeout(connect, 1000 * 2 ** tries);
    };
  };
  connect();
  return () => {
    closed = true;
    window.clearTimeout(timer);
    es?.close();
    es = null;
  };
}
