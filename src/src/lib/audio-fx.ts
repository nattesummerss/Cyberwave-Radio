// Leitura do som de verdade para o espectro de frequência e os medidores VU.
//
// O navegador só deixa o site "ouvir" o áudio de outra empresa quando o servidor da rádio
// libera isso (cabeçalho CORS). Por isso o player tem dois elementos de áudio:
//  - um "analisado" (crossorigin), ligado a um AnalyserNode da Web Audio API;
//  - um comum, usado quando a rádio não libera a leitura (aí a animação fica simulada).
// Só é usado no computador: no celular, passar o som pela Web Audio pode cortar a rádio
// quando a tela bloqueia (iPhone).

import { useSyncExternalStore } from "react";

export interface FxGraph {
  ctx: AudioContext;
  el: HTMLAudioElement;
  spectrum: AnalyserNode;
  left: AnalyserNode;
  right: AnalyserNode;
  gain: GainNode;
}

export const FX_SUPPORTED =
  typeof window !== "undefined" &&
  typeof window.AudioContext === "function" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

let graph: FxGraph | null = null;

/** Monta (no clique do usuário) o contexto de áudio ligado ao elemento analisado. */
export function ensureFx(el: HTMLAudioElement | null): FxGraph | null {
  if (!FX_SUPPORTED || !el) return null;
  if (!graph) {
    try {
      const ctx = new AudioContext({ latencyHint: "playback" });
      const src = ctx.createMediaElementSource(el);
      const spectrum = ctx.createAnalyser();
      spectrum.fftSize = 2048;
      spectrum.smoothingTimeConstant = 0.72;
      spectrum.minDecibels = -90;
      spectrum.maxDecibels = -22;
      const split = ctx.createChannelSplitter(2);
      const left = ctx.createAnalyser();
      const right = ctx.createAnalyser();
      left.fftSize = 1024;
      right.fftSize = 1024;
      const gain = ctx.createGain();
      // Os medidores L/R não vão para a saída; um ganho zero garante que o navegador os processe.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      src.connect(spectrum);
      spectrum.connect(gain);
      gain.connect(ctx.destination);
      src.connect(split);
      split.connect(left, 0);
      split.connect(right, 1);
      left.connect(sink);
      right.connect(sink);
      sink.connect(ctx.destination);
      graph = { ctx, el, spectrum, left, right, gain };
    } catch {
      return null;
    }
  }
  if (graph.ctx.state === "suspended") graph.ctx.resume().catch(() => {});
  return graph;
}

export function fxGraph(): FxGraph | null {
  return graph;
}

export function setFxVolume(volume: number, muted: boolean) {
  if (graph) graph.gain.gain.value = muted ? 0 : Math.max(0, Math.min(1, volume / 100));
}

/* ---------- Quais servidores liberam a leitura do áudio (lembrado no navegador) ---------- */

const HOSTS_KEY = "radio.fx-hosts";
const RETRY_MS = 3 * 24 * 60 * 60_000;
type HostMemo = Record<string, { ok: boolean; at: number }>;

function hostKey(url: string): string | null {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith(".live.streamtheworld.com") ? "live.streamtheworld.com" : h;
  } catch {
    return null;
  }
}

function readHosts(): HostMemo {
  try {
    const v = JSON.parse(localStorage.getItem(HOSTS_KEY) ?? "{}");
    return v && typeof v === "object" ? (v as HostMemo) : {};
  } catch {
    return {};
  }
}

/** false = servidor já recusou a leitura (nos últimos 3 dias); senão vale tentar. */
export function fxAllowedFor(url: string): boolean {
  const key = hostKey(url);
  if (!key) return false;
  const memo = readHosts()[key];
  return !(memo && !memo.ok && Date.now() - memo.at < RETRY_MS);
}

export function rememberFx(url: string, ok: boolean) {
  const key = hostKey(url);
  if (!key) return;
  try {
    const all = readHosts();
    all[key] = { ok, at: Date.now() };
    localStorage.setItem(HOSTS_KEY, JSON.stringify(all));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

/* ---------- Estado "sincronizado com o áudio" ---------- */

let live = false;
const liveListeners = new Set<() => void>();

export function setVizLive(on: boolean) {
  if (live === on) return;
  live = on;
  liveListeners.forEach((l) => l());
  syncLoop();
}

/** true quando o espectro e o VU estão lendo o som de verdade. */
export function useVizLive(): boolean {
  return useSyncExternalStore(
    (cb) => {
      liveListeners.add(cb);
      return () => liveListeners.delete(cb);
    },
    () => live,
    () => false,
  );
}

/* ---------- Leitura quadro a quadro (um único laço para todos os medidores) ---------- */

export const BANDS = 40;

export interface VizFrame {
  /** Altura de cada barra do espectro, de 0 a 1 (graves à esquerda). */
  bands: Float32Array;
  left: number;
  right: number;
}

type FrameListener = (f: VizFrame) => void;
const frameListeners = new Set<FrameListener>();
let raf = 0;
let freq: Uint8Array<ArrayBuffer> | null = null;
let wave: Float32Array<ArrayBuffer> | null = null;
let edges: number[] = [];
const frame: VizFrame = { bands: new Float32Array(BANDS), left: 0, right: 0 };

function bandEdges(g: FxGraph) {
  const bins = g.spectrum.frequencyBinCount;
  const hzPerBin = g.ctx.sampleRate / g.spectrum.fftSize;
  const lo = 45;
  const hi = Math.min(16_000, g.ctx.sampleRate / 2 - hzPerBin);
  const out: number[] = [];
  for (let i = 0; i <= BANDS; i++) {
    const hz = lo * Math.pow(hi / lo, i / BANDS);
    out.push(Math.min(bins - 1, Math.max(1, Math.round(hz / hzPerBin))));
  }
  return out;
}

function level(an: AnalyserNode): number {
  if (!wave || wave.length !== an.fftSize) wave = new Float32Array(an.fftSize);
  an.getFloatTimeDomainData(wave);
  let sum = 0;
  for (let i = 0; i < wave.length; i++) sum += wave[i]! * wave[i]!;
  const rms = Math.sqrt(sum / wave.length);
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 42) / 40));
}

function tick() {
  raf = 0;
  const g = graph;
  if (!g || !live || frameListeners.size === 0) return;
  if (!freq || freq.length !== g.spectrum.frequencyBinCount) {
    freq = new Uint8Array(g.spectrum.frequencyBinCount);
    edges = bandEdges(g);
  }
  g.spectrum.getByteFrequencyData(freq);
  for (let b = 0; b < BANDS; b++) {
    const from = edges[b]!;
    const to = Math.max(from, edges[b + 1]! - 1);
    let peak = 0;
    for (let i = from; i <= to; i++) peak = Math.max(peak, freq[i]!);
    const target = Math.pow(peak / 255, 1.35);
    const prev = frame.bands[b]!;
    // Sobe rápido, desce devagar (como um analisador de verdade).
    frame.bands[b] = target > prev ? target : prev + (target - prev) * 0.18;
  }
  const l = level(g.left);
  let r = level(g.right);
  if (r === 0 && l > 0) r = l; // rádio em mono
  frame.left = l > frame.left ? frame.left + (l - frame.left) * 0.6 : frame.left + (l - frame.left) * 0.12;
  frame.right = r > frame.right ? frame.right + (r - frame.right) * 0.6 : frame.right + (r - frame.right) * 0.12;
  frameListeners.forEach((fn) => fn(frame));
  raf = requestAnimationFrame(tick);
}

function syncLoop() {
  const want = live && !!graph && frameListeners.size > 0;
  if (want && !raf) raf = requestAnimationFrame(tick);
  if (!want && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  if (!live) {
    frame.bands.fill(0);
    frame.left = 0;
    frame.right = 0;
  }
}

export function subscribeViz(fn: FrameListener): () => void {
  frameListeners.add(fn);
  syncLoop();
  return () => {
    frameListeners.delete(fn);
    syncLoop();
  };
}

/** Há som saindo do elemento analisado? (para descobrir se a leitura está funcionando) */
export function fxHasSignal(): boolean {
  const g = graph;
  if (!g) return false;
  const buf = new Float32Array(g.left.fftSize);
  for (const an of [g.left, g.right]) {
    an.getFloatTimeDomainData(buf);
    for (let i = 0; i < buf.length; i++) if (buf[i] !== 0) return true;
  }
  return false;
}
