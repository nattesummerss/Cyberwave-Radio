import { forSpeech } from "@/lib/andra-lexicon";
// Voz da apresentadora ANDRA-18.
//
// 1) Voz neural feminina gravada em MP3 pelo GitHub Actions (pasta voz/): igual em qualquer
//    aparelho e navegador, inclusive celular e área de trabalho virtual (AVD).
// 2) Fala sem MP3 (ex.: antes da primeira gravação): voz feminina em português do próprio
//    navegador, escolhendo a mais natural disponível. Vozes masculinas nunca são usadas.
// 3) Sem voz feminina no aparelho: só a legenda aparece, no ritmo da fala.

export type Segment = { text: string; audio?: string | null };
export type VoiceKind = "neural" | "navegador" | "legenda";

const MANIFEST_URL = "./voz/manifest.json";
const MANIFEST_TTL = 10 * 60_000;
const SAFE_AUDIO = /^voz\/[a-z0-9_-]{4,80}\.mp3$/i;

export const isSafeAudio = (p: unknown): p is string => typeof p === "string" && SAFE_AUDIO.test(p);

export interface VoiceManifest {
  voice: string;
  engine: string;
  phrases: Record<string, string>;
}

let manifestAt = 0;
let manifestP: Promise<VoiceManifest | null> | null = null;

export function loadManifest(): Promise<VoiceManifest | null> {
  if (manifestP && Date.now() - manifestAt < MANIFEST_TTL) return manifestP;
  manifestAt = Date.now();
  manifestP = fetch(MANIFEST_URL, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((raw: unknown) => {
      if (!raw || typeof raw !== "object") return null;
      const o = raw as Record<string, unknown>;
      const phrases: Record<string, string> = {};
      if (o.phrases && typeof o.phrases === "object") {
        for (const [k, v] of Object.entries(o.phrases as Record<string, unknown>)) if (isSafeAudio(v)) phrases[k] = v;
      }
      return {
        voice: typeof o.voice === "string" ? o.voice.slice(0, 80) : "",
        engine: typeof o.engine === "string" ? o.engine.slice(0, 20) : "",
        phrases,
      };
    })
    .catch(() => null);
  return manifestP;
}

// ---------- Voz do navegador (reserva) ----------

const FEMALE =
  /francisca|thalita|luciana|maria|fernanda|vit[oó]ria|camila|let[ií]cia|yara|raquel|joana|catarina|helena|brenda|elza|giovanna|leila|manuela|sabrina|beatriz|female|feminin|mulher|google portugu[eê]s do brasil/i;
const MALE = /daniel|ant[oô]nio|felipe|f[aá]bio|j[uú]lio|donato|humberto|nicolau|val[eé]rio|duarte|cristiano|ricardo|macerio|\bmale\b|masculin/i;

function scoreVoice(v: SpeechSynthesisVoice): number {
  const name = `${v.name} ${v.voiceURI}`;
  if (MALE.test(name) && !/female/i.test(name)) return -1;
  if (!FEMALE.test(name)) return -1;
  const lang = v.lang.replace("_", "-").toLowerCase();
  let score = lang === "pt-br" ? 50 : lang.startsWith("pt") ? 20 : 0;
  if (!score) return -1;
  if (/natural|neural|online|premium|enhanced|aprimorad/i.test(name)) score += 30;
  if (/francisca|thalita/i.test(name)) score += 10;
  if (/google/i.test(name)) score += 8;
  return score;
}

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;
function voices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  voicesReady ??= new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    window.setTimeout(done, 1500);
  });
  return voicesReady;
}

/** Melhor voz feminina em português do navegador, ou null se não houver. */
export async function browserVoice(): Promise<SpeechSynthesisVoice | null> {
  const list = await voices();
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -1;
  for (const v of list) {
    const sc = scoreVoice(v);
    if (sc > bestScore) {
      best = v;
      bestScore = sc;
    }
  }
  return bestScore >= 0 ? best : null;
}

// ---------- Movimento da boca ----------
//
// MP3 neural: o som passa por um analisador (Web Audio) e a boca segue a energia da voz.
// Voz do navegador: cada palavra avisada pelo navegador vira uma sequência de sílabas.
// Sem nenhuma das duas leituras, a apresentadora usa um ritmo de fala sintético.

const OPEN: Record<string, number> = { a: 1, e: 0.72, o: 0.8, i: 0.42, u: 0.4 };

function plain(t: string) {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Sílabas de uma palavra em português (aproximado): [abertura 0..1, peso da duração]. */
export function syllables(word: string): [number, number][] {
  const w = plain(word).replace(/[^a-z]/g, "");
  const out: [number, number][] = [];
  const groups = w.match(/[^aeiouy]*[aeiouy]+[^aeiouy]*?(?=[^aeiouy]?[aeiouy]|$)|[^aeiouy]+$/g) ?? [];
  for (const g of groups) {
    const v = g.match(/[aeiouy]/)?.[0] ?? "";
    const closed = /^[mbp]/.test(g);
    out.push([v ? (OPEN[v] ?? 0.45) * (closed ? 0.85 : 1) : 0.15, Math.max(1, g.length)]);
  }
  return out.length ? out : [[0.3, 1]];
}

type Pulse = { at: number; dur: number; open: number };

let audioCtx: AudioContext | null = null;
function voiceCtx(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") return null;
  try {
    audioCtx ??= new AudioContext();
    return audioCtx;
  } catch {
    return null;
  }
}

// ---------- Cartão da apresentadora (public/host-rig.js) ----------
// O movimento da boca é feito pelo host-rig.js: com a voz do navegador ele segue cada palavra
// (bind); com o MP3 neural ele lê o som pelo analisador window.cwHostAnalyser.

type HostRigApi = { bind?(u: SpeechSynthesisUtterance, text: string): void; setTalking?(on: boolean): void };
const hostRig = (): HostRigApi | null => (window as unknown as { CyberwaveRig?: HostRigApi }).CyberwaveRig ?? null;
function setHostAnalyser(an: AnalyserNode | null) {
  const w = window as unknown as { cwHostAnalyser?: AnalyserNode };
  if (an) w.cwHostAnalyser = an;
  else delete w.cwHostAnalyser;
}

// ---------- Locutora ----------

export class Speaker {
  private token = 0;
  private running = 0;
  private audio: HTMLAudioElement | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Uint8Array<ArrayBuffer> | null = null;
  private pulses: Pulse[] = [];
  private env = 0;
  private silent = false;
  private envAt = 0;
  /** Chamado a cada palavra falada pela voz do navegador (para gestos). */
  onWord: ((word: string) => void) | null = null;

  /**
   * Abertura da boca agora (0..1). null = falando sem leitura do som (a animação usa um ritmo
   * sintético); 0 = em silêncio.
   */
  level(): number | null {
    if (!this.busy() || this.silent) return 0;
    const now = performance.now();
    if (this.analyser && this.buf && this.audio && !this.audio.paused) {
      this.analyser.getByteTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) {
        const v = (this.buf[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.buf.length);
      const target = Math.min(1, Math.max(0, (rms - 0.015) * 5.5));
      const dt = Math.max(1, now - this.envAt);
      this.envAt = now;
      this.env += (target - this.env) * (1 - Math.exp(-dt / (target > this.env ? 25 : 70)));
      return this.env;
    }
    if (this.pulses.length) {
      while (this.pulses.length && this.pulses[0]!.at + this.pulses[0]!.dur < now) this.pulses.shift();
      const p = this.pulses[0];
      if (!p || p.at > now) return 0.05;
      const k = (now - p.at) / p.dur;
      return p.open * Math.sin(Math.min(1, k) * Math.PI) ** 0.7;
    }
    return null;
  }

  /** Agenda as sílabas de um texto a partir de `start`, ocupando `totalMs`. */
  private schedule(text: string, start: number, totalMs: number) {
    const words = text.split(/\s+/).filter(Boolean);
    const weights = words.map((w) => syllables(w).reduce((n, [, d]) => n + d, 0) + 1.5);
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    let t = start;
    const out: Pulse[] = [];
    words.forEach((w, i) => {
      const span = (totalMs * weights[i]!) / sum;
      const syl = syllables(w);
      const sd = syl.reduce((n, [, d]) => n + d, 0);
      let at = t;
      for (const [open, d] of syl) {
        const dur = (span * 0.85 * d) / sd;
        out.push({ at, dur, open });
        at += dur;
      }
      if (/[.,;:!?]$/.test(w)) t += span * 0.1;
      t += span;
    });
    this.pulses = out;
  }

  private wordPulses(word: string, msPerChar: number) {
    const now = performance.now();
    const syl = syllables(word);
    const sd = syl.reduce((n, [, d]) => n + d, 0);
    const span = Math.max(140, plain(word).length * msPerChar);
    let at = Math.max(now, this.pulses.length ? this.pulses[this.pulses.length - 1]!.at + this.pulses[this.pulses.length - 1]!.dur : now);
    if (at - now > 400) at = now;
    const add: Pulse[] = [];
    for (const [open, d] of syl) {
      const dur = (span * 0.85 * d) / sd;
      add.push({ at, dur, open });
      at += dur;
    }
    this.pulses = [...this.pulses.filter((p) => p.at + p.dur >= now), ...add];
  }

  /** Está falando agora. */
  busy() {
    return this.running !== 0 && this.running === this.token;
  }

  /** Para de falar na hora. */
  stop() {
    this.token++;
    this.pulses = [];
    this.analyser = null;
    setHostAnalyser(null);
    hostRig()?.setTalking?.(false);
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio = null;
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }

  /**
   * Fala os trechos em sequência. `onSegment` recebe a legenda de cada trecho e o tipo de voz usado.
   * Resolve quando termina ou quando `stop()` é chamado.
   */
  async speak(segments: Segment[], onSegment: (text: string, kind: VoiceKind) => void): Promise<void> {
    this.stop();
    const token = this.token;
    this.running = token;
    try {
      await this.run(segments, token, onSegment);
    } finally {
      if (this.running === token) this.running = 0;
    }
  }

  private async run(segments: Segment[], token: number, onSegment: (text: string, kind: VoiceKind) => void): Promise<void> {
    for (const seg of segments) {
      if (token !== this.token) return;
      if (!seg.text.trim()) continue;
      let done = false;
      if (seg.audio && isSafeAudio(seg.audio)) {
        onSegment(seg.text, "neural");
        done = await this.playFile(seg.audio, seg.text, token);
      }
      if (token !== this.token) return;
      if (!done) {
        const v = await browserVoice();
        if (token !== this.token) return;
        if (v) {
          onSegment(seg.text, "navegador");
          done = await this.utter(seg.text, v, token);
        }
      }
      if (token !== this.token) return;
      if (!done) {
        onSegment(seg.text, "legenda");
        this.silent = true;
        await this.wait(Math.max(2500, seg.text.length * 60), token);
        this.silent = false;
      }
      this.pulses = [];
      this.analyser = null;
      this.silent = true;
      await this.wait(350, token);
      this.silent = false;
    }
  }

  private playFile(src: string, text: string, token: number): Promise<boolean> {
    return new Promise((resolve) => {
      const a = new Audio();
      a.preload = "auto";
      this.audio = a;
      let settled = false;
      const end = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearInterval(check);
        hostRig()?.setTalking?.(false);
        setHostAnalyser(null);
        resolve(ok);
      };
      // Se a fala for interrompida, libera a sequência.
      const check = window.setInterval(() => {
        if (token !== this.token) end(true);
      }, 200);
      a.addEventListener("ended", () => end(true));
      a.addEventListener("error", () => end(false));
      a.addEventListener("playing", () => {
        if (token !== this.token) return;
        setHostAnalyser(this.analyser);
        hostRig()?.setTalking?.(true);
        if (this.analyser) return;
        // Sem leitura do som: as sílabas do texto ocupam a duração do áudio.
        const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : text.length * 62;
        this.schedule(text, performance.now(), Math.max(400, d - (a.currentTime || 0) * 1000));
      });
      a.src = src;
      this.analyser = null;
      this.pulses = [];
      const ctx = voiceCtx();
      const route = (): Promise<void> => {
        if (!ctx) return Promise.resolve();
        const ready = ctx.state === "running" ? Promise.resolve() : ctx.resume().catch(() => {});
        return Promise.race([ready, new Promise<void>((r) => window.setTimeout(r, 300))]).then(() => {
          if (ctx.state !== "running" || token !== this.token) return;
          try {
            // O som só passa pelo analisador se o contexto estiver rodando (senão a voz ficaria muda).
            const srcNode = ctx.createMediaElementSource(a);
            const an = ctx.createAnalyser();
            an.fftSize = 1024;
            srcNode.connect(an);
            an.connect(ctx.destination);
            this.analyser = an;
            this.buf = new Uint8Array(new ArrayBuffer(an.fftSize));
            this.env = 0;
          } catch {
            this.analyser = null;
          }
        });
      };
      route().then(() => a.play()).catch(() => end(false));
    });
  }

  private utter(shown: string, voice: SpeechSynthesisVoice, token: number): Promise<boolean> {
    // A voz lê a versão com a pronúncia corrigida (andra-lexicon.ts); a legenda mostra o original.
    const text = forSpeech(shown);
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang || "pt-BR";
      u.rate = 1.02;
      u.pitch = 1.08;
      let settled = false;
      const end = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearInterval(check);
        resolve(ok);
      };
      const check = window.setInterval(() => {
        if (token !== this.token) end(true);
      }, 200);
      u.onend = () => end(true);
      u.onerror = (e) => end(e.error === "interrupted" || e.error === "canceled");
      const msPerChar = 64 / (u.rate || 1);
      let gotWord = false;
      u.onboundary = (e) => {
        if (token !== this.token || (e.name && e.name !== "word")) return;
        gotWord = true;
        const len = e.charLength || (text.slice(e.charIndex).match(/^\S+/) ?? [""])[0].length;
        const word = text.slice(e.charIndex, e.charIndex + len);
        this.wordPulses(word, msPerChar);
        this.onWord?.(word);
      };
      u.onstart = () => {
        // Navegadores que não avisam cada palavra: agenda o texto inteiro pelo ritmo médio.
        window.setTimeout(() => {
          if (!gotWord && token === this.token) this.schedule(text, performance.now(), text.length * msPerChar);
        }, 300);
      };
      // Boca e gestos acompanham cada palavra (host-rig.js).
      try {
        hostRig()?.bind?.(u, text);
      } catch {
        /* cartão ainda não carregou */
      }
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      // Alguns navegadores não avisam o fim: limite de segurança.
      window.setTimeout(() => end(true), 4000 + text.length * 110);
    });
  }

  private wait(ms: number, token: number): Promise<void> {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (token !== this.token || Date.now() - started >= ms) resolve();
        else window.setTimeout(tick, 100);
      };
      tick();
    });
  }
}
