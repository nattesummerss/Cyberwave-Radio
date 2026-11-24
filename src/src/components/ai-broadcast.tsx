import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Eye, EyeOff, Mic, MicOff, Send, TriangleAlert, Volume2, X } from "lucide-react";
import { streamUrlOf, type Station } from "@/data/stations";
import { fetchNowPlaying, isOnAirNow, tidyName, tritonMount, type Track } from "@/lib/now-playing";
import { useLiveMeta } from "@/lib/live-meta";
import { ago, interleave, isUrgent, useNews, type NewsFeed, type NewsItem } from "@/lib/news";
import { cn } from "@/lib/utils";
import { Clock, Corners } from "@/components/cyber";
import { ANDRA_NAME, helloId, phrases, stationLine } from "@/lib/andra-script";
import { AgentChat, agentEndpoint, sentences, type AgentLink } from "@/lib/andra-agent";
import { loadManifest, Speaker, type Segment, type VoiceKind, type VoiceManifest } from "@/lib/andra-voice";
import { moodFor } from "@/lib/andra-mood";

/**
 * "Transmissão I.A.": a apresentadora ANDRA-18 (foto animada em tempo real, ver src/lib/andra-rig.ts) que apresenta, como
 * num telejornal, as manchetes das fontes escolhidas (CNN Brasil, BBC News Brasil, Fox News,
 * Revista Oeste e Ancapsu), interrompe com plantões urgentes do dia e comenta a rádio que
 * está tocando. Ela só repete o título publicado por cada fonte, sempre com o nome da fonte
 * e o link para a matéria; não escreve nem resume notícias.
 * Aparece apenas em tela de computador (mouse e largura de 1024 px ou mais).
 */

export type BroadcastStatus = "idle" | "loading" | "playing" | "paused" | "error";

const TYPE_MS = 32;
const HOLD_MS = 4200;
const HOLD_NEWS_MS = 6500;
const HOLD_URGENT_MS = 9000;
const NEWS_IN_SCHEDULE = 12;
const MAX_INTERRUPTS = 3;
const STORAGE_KEY = "radio.ia-visivel";
const SEEN_KEY = "radio.plantoes-vistos";
const VOICE_KEY = "radio.andra-voz";
/** Giro automático de notícias falado (com a rádio tocando e a voz automática ligada). */
const NEWS_ROUND_MS = 30 * 60_000;
const NEWS_READ = 5;
const PHRASES = phrases();

/** Evento para o cartão da ANDRA-18 (public/host.js). */
function hostEvent(name: string, detail?: Record<string, unknown>) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}
type HostRig = { gesture(n: string): void; emote(n: string, ms?: number): void };
const hostRig = () => (window as unknown as { CyberwaveRig?: HostRig }).CyberwaveRig ?? null;
const VOICE_BTN =
  "inline-flex items-center gap-1.5 rounded border border-cw-yellow/40 bg-black/60 px-2.5 py-1 text-cw-yellow hover:bg-cw-yellow/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cw-yellow";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Hora atual, atualizada a cada 30 s (hora certa e "há X min"). */
function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

interface Bulletin {
  key: string;
  tag: string;
  text: string;
  kind: "radio" | "news" | "urgent";
  news?: NewsItem;
}

type Mode = "standby" | "connecting" | "lost" | "event" | "news" | "music";

const MODE_LABEL: Record<Mode, string> = {
  standby: "EM ESPERA",
  connecting: "CONECTANDO",
  lost: "SINAL PERDIDO",
  event: "EVENTO AO VIVO",
  news: "JORNAL AO VIVO",
  music: "PROGRAMAÇÃO MUSICAL",
};

function modeOf(status: BroadcastStatus, station: Station | null): Mode {
  if (!station || status === "idle" || status === "paused") return "standby";
  if (status === "loading") return "connecting";
  if (status === "error") return "lost";
  if (station.sports) return "event";
  if (/not[ií]cia/i.test(station.genre)) return "news";
  return "music";
}

function greeting(d: Date) {
  const h = d.getHours();
  return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const mhz = (f: number) => f.toFixed(1).replace(".", ",");
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}h${String(d.getMinutes()).padStart(2, "0")}`;

function cityName(s: Station) {
  return s.city === "sp" ? "São Paulo" : s.city === "rj" ? "Rio de Janeiro" : s.city === "bh" ? "Belo Horizonte" : "da web";
}

function where(s: Station) {
  if (s.frequency) return `${mhz(s.frequency)} megahertz, direto de ${s.place ?? cityName(s)}`;
  return s.place ? `transmissão web direto de ${s.place}` : "transmissão pela internet";
}

/** Boletins sobre a rádio (abertura, sintonia, música, hora certa, catálogo). */
function radioBulletins(opts: {
  mode: Mode;
  station: Station | null;
  track: Track | null;
  trackKnown: boolean;
  now: Date;
  total: number;
  sports: number;
  favorites: number;
  hasNews: boolean;
}): Bulletin[] {
  const { mode, station, track, trackKnown, now, total, sports, favorites, hasNews } = opts;
  const b = (key: string, tag: string, text: string): Bulletin => ({ key: `r:${key}`, tag, text, kind: "radio" });
  const hello = `${greeting(now)}. Eu sou ANDRA-18, apresentadora virtual da Cyberwave Radio.`;
  const clock = b("hora", "HORA CERTA", `Hora certa: ${hhmm(now)}. Você está conectado à Cyberwave Radio.`);
  const catalog = b(
    "catalogo",
    "CATÁLOGO",
    `São ${total} estações no catálogo, ${sports} delas na aba Esportes.${favorites ? ` Você tem ${favorites} ${favorites === 1 ? "favorita salva" : "favoritas salvas"}.` : ""}`,
  );

  if (mode === "connecting" && station) {
    return [b("conexao", "CONEXÃO", `Estabelecendo link com ${station.name}. Ajustando o sinal, aguarde alguns segundos.`)];
  }
  if (mode === "lost" && station) {
    return [
      b("alerta1", "ALERTA", `Sinal perdido com ${station.name}. A emissora não respondeu agora.`),
      b("alerta2", "ALERTA", "Toque em Tentar de novo ou escolha outra estação no dial."),
    ];
  }
  if (mode === "standby" || !station) {
    return [
      b("abertura", "ABERTURA", `${hello} ${hasNews ? "Acompanhe as principais manchetes do momento." : "Estamos no ar."}`),
      b(
        "sintonia",
        "SINTONIA",
        station ? `Última estação sintonizada: ${station.name}. Aperte o play para ouvir enquanto acompanha o noticiário.` : "Escolha uma estação no dial para ouvir enquanto acompanha o noticiário.",
      ),
      clock,
      catalog,
    ];
  }

  const list: Bulletin[] = [];
  if (mode === "event") {
    list.push(
      b("abertura", "EVENTO AO VIVO", `${hello} No rádio, cobertura esportiva ao vivo pela ${station.name}.`),
      b("sintonia", "SINTONIA", `${station.name}: ${where(station)}. Narração e lances direto da cabine da emissora.`),
    );
  } else if (mode === "news") {
    list.push(
      b("abertura", "ABERTURA", `${hello} No rádio, o noticiário ao vivo da ${station.name}.`),
      b("sintonia", "SINTONIA", `${station.name}: ${where(station)}.`),
    );
  } else {
    list.push(
      b("abertura", "ABERTURA", `${hello} No rádio, ${station.name}.`),
      b("sintonia", "SINTONIA", `${station.name}: ${where(station)}. Gênero: ${station.genre}.`),
    );
  }
  if (track?.title) {
    const text = track.artist ? `No ar agora: ${tidyName(track.title)}, de ${tidyName(track.artist)}.` : `No ar agora: ${tidyName(track.title)}.`;
    list.push(b("faixa", "TOCANDO AGORA", text));
  } else if (mode === "music") {
    list.push(
      b(
        "faixa",
        "TOCANDO AGORA",
        trackKnown ? "Aguardando a emissora informar a próxima faixa." : "Esta emissora não envia o nome da música. Siga curtindo a programação.",
      ),
    );
  }
  list.push(clock, catalog);
  return list;
}

function newsLead(it: NewsItem) {
  if (it.source === "ancapsu") return "No canal Ancapsu";
  if (it.lang === "en") return `Na ${it.sourceName}, em inglês`;
  return `Segundo a ${it.sourceName}`;
}

function newsBulletin(it: NewsItem, urgent: boolean, interrupt = false): Bulletin {
  return {
    key: `${interrupt ? "u" : "n"}:${it.id}`,
    tag: interrupt ? "PLANTÃO URGENTE" : urgent ? "PLANTÃO" : "MANCHETE",
    text: `${interrupt ? "Interrompemos para um plantão. " : ""}${newsLead(it)}: ${it.title}`,
    kind: urgent ? "urgent" : "news",
    news: it,
  };
}

/** Abertura, depois duas manchetes para cada boletim da rádio. */
function mergeSchedule(radio: Bulletin[], news: Bulletin[]): Bulletin[] {
  if (news.length === 0) return radio;
  const out: Bulletin[] = [];
  let r = 0;
  let n = 0;
  if (radio[0]) out.push(radio[r++]!);
  while (n < news.length || r < radio.length) {
    for (let k = 0; k < 2 && n < news.length; k++) out.push(news[n++]!);
    if (r < radio.length) out.push(radio[r++]!);
  }
  return out;
}

/** Música informada pela rádio: primeiro o canal em tempo real, depois o histórico (só lê o que o painel "Tocando agora" já buscou). */
function useCurrentTrack(station: Station | null, active: boolean): { track: Track | null; known: boolean } {
  const live = useLiveMeta();
  const mount = station ? tritonMount(streamUrlOf(station)) : null;
  const np = useQuery({
    queryKey: ["now-playing", mount],
    queryFn: ({ signal }) => fetchNowPlaying(mount as string, signal),
    enabled: false,
  });
  if (!station || !active) return { track: null, known: !!mount };
  const liveTrack = live.stationId === station.id ? live.current : null;
  if (liveTrack) return { track: liveTrack, known: true };
  const latest = np.data?.[0];
  return { track: latest && isOnAirNow(latest) ? latest : null, known: !!mount };
}

function readSeen(): Set<string> {
  try {
    const v = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/**
 * Lugar da apresentadora no painel. O cartão #cw-host (host.html, animado por host-rig.js e host.js)
 * fica no index.html; aqui ele é trazido para dentro do painel e devolvido à guarda quando o painel some.
 */
function HostSlot({ alert }: { alert: boolean }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [missing, setMissing] = useState(false);
  useLayoutEffect(() => {
    const slot = slotRef.current;
    const host = document.getElementById("cw-host");
    if (!slot || !host) {
      setMissing(true);
      return;
    }
    slot.appendChild(host);
    return () => {
      (document.getElementById("cw-host-guarda") ?? document.body).appendChild(host);
    };
  }, []);
  useEffect(() => {
    document.getElementById("cw-host")?.classList.toggle("cw-alert", alert);
  }, [alert]);
  if (missing) {
    return (
      <p className="p-4 font-mono text-xs text-cw-yellow">
        ANDRA-18 não carregou: confira se host.css, host.js, host-rig.js e assets/host.png foram enviados ao GitHub junto com o index.html.
      </p>
    );
  }
  return <div ref={slotRef} className="cw-host-slot flex h-full items-start justify-center p-3" />;
}

const Ticker = memo(function Ticker({ items, alert }: { items: string[]; alert: boolean }) {
  const chars = items.reduce((n, t) => n + t.length + 6, 0);
  const duration = Math.max(40, Math.round(chars * 0.2));
  const row = (copy: number) => (
    <div className="flex shrink-0 items-center" aria-hidden={copy === 1 ? "true" : undefined}>
      {items.map((t, i) => (
        <span key={i} className="flex items-center whitespace-nowrap">
          <span className="px-4">{t}</span>
          <span className="text-cw-red">◆</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="relative flex h-8 items-stretch overflow-hidden border-t border-cw-yellow/30 bg-black font-mono text-xs text-cw-yellow">
      <span
        className={cn(
          "z-10 flex shrink-0 items-center bg-cw-red px-3 font-cyber text-[11px] font-black tracking-widest text-white",
          alert && "ai-alert-flash",
        )}
      >
        {alert ? "URGENTE" : "ÚLTIMAS"}
      </span>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div className="ai-marquee flex w-max items-center py-1.5" style={{ animationDuration: `${duration}s` }}>
          {row(0)}
          {row(1)}
        </div>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Painel                                                               */
/* ------------------------------------------------------------------ */

export function AiBroadcast(props: {
  station: Station | null;
  status: BroadcastStatus;
  total: number;
  sports: number;
  favorites: number;
  /** Abaixa (true) ou devolve (false) o volume da rádio enquanto a apresentadora fala. */
  onDuck?: (on: boolean) => void;
}) {
  const [visible, setVisible] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const toggle = () =>
    setVisible((v) => {
      try {
        localStorage.setItem(STORAGE_KEY, v ? "0" : "1");
      } catch {
        /* navegador sem armazenamento: só não lembra a escolha */
      }
      return !v;
    });

  if (!visible) {
    return (
      <div className="flex items-center justify-between gap-3 rounded border border-cw-yellow/25 bg-black/60 px-4 py-2 font-mono text-xs text-gray-300">
        <span>
          <span className="text-cw-yellow">CW NEWS</span> // Transmissão I.A. oculta
        </span>
        <button
          type="button"
          onClick={toggle}
          className="inline-flex items-center gap-1.5 rounded border border-cw-yellow/40 px-2.5 py-1 text-cw-yellow hover:bg-cw-yellow/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cw-yellow"
        >
          <Eye className="size-3.5" aria-hidden="true" /> Mostrar apresentadora
        </button>
      </div>
    );
  }
  return <BroadcastPanel {...props} onHide={toggle} />;
}

const dayTime = (ts: number) => {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? hhmm(d) : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${hhmm(d)}`;
};

const SITE_STATE_TEXT: Record<NewsFeed["site"]["state"], (f: NewsFeed) => string> = {
  ok: (f) => `publicado pelo GitHub, atualizado às ${f.site.updatedAt ? dayTime(f.site.updatedAt) : "?"}.`,
  antigo: (f) =>
    `desatualizado (última atualização ${f.site.updatedAt ? dayTime(f.site.updatedAt) : "desconhecida"}). O agendamento do GitHub Actions parou ou está atrasado.`,
  vazio: () => "publicado pelo GitHub, mas sem manchetes: as fontes não responderam aos servidores do GitHub.",
  ausente: (f) => `não encontrado (${f.site.error || "sem resposta"}). O GitHub Actions ainda não publicou as notícias.`,
};

/** Painel "Status das notícias": diz de onde veio cada fonte ou por que falhou. */
function NewsDiagnostics({ feed, onClose }: { feed: NewsFeed; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  return (
    <div
      id="ai-news-diag"
      role="region"
      aria-label="Status das notícias"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="absolute inset-x-3 top-9 bottom-3 z-20 overflow-y-auto rounded border border-cw-cyan/60 bg-black p-3 font-mono text-[11px] leading-snug text-gray-300 shadow-[0_0_24px_rgba(0,240,255,0.15)]"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-cyber text-xs font-black tracking-[0.2em] text-cw-yellow">STATUS DAS NOTÍCIAS</p>
        <button
          ref={close}
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded border border-cw-yellow/40 px-2 py-0.5 text-gray-300 hover:text-cw-yellow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cw-yellow"
        >
          <X className="size-3.5" aria-hidden="true" /> Fechar
        </button>
      </div>
      <p>
        <span className="text-cw-cyan">Arquivo do site (noticias.json):</span> {SITE_STATE_TEXT[feed.site.state](feed)}
      </p>
      <ul className="mt-2 space-y-1">
        {feed.sources.map((s) => (
          <li key={s.id} className="flex gap-2">
            <span aria-hidden="true" className={s.ok ? "text-cw-cyan" : "text-cw-red"}>
              {s.ok ? "✓" : "✗"}
            </span>
            <span>
              <span className="text-gray-100">{s.name}</span>
              <span className="sr-only">{s.ok ? " funcionando" : " com falha"}</span>
              {" — "}
              {s.count > 0
                ? `${s.count} ${s.count === 1 ? "manchete" : "manchetes"} ${s.via === "direto" ? "(conexão direta)" : "(GitHub)"}`
                : s.ok
                  ? "sem manchetes recentes"
                  : "sem resposta"}
              {s.error && <span className="text-gray-500"> • {s.error}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-gray-500">
        Conexão direta: quando falta alguma fonte no arquivo do GitHub, o navegador busca o feed dela pelo serviço público rss2json.com
        (guardado por 15 min).
      </p>
    </div>
  );
}

function BroadcastPanel({
  station,
  status,
  total,
  sports,
  favorites,
  onHide,
  onDuck,
}: {
  station: Station | null;
  status: BroadcastStatus;
  total: number;
  sports: number;
  favorites: number;
  onHide: () => void;
  onDuck?: (on: boolean) => void;
}) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const now = useMinute();
  const mode = modeOf(status, station);
  const active = status === "playing";
  const { track, known } = useCurrentTrack(station, active);
  const trackKey = track ? `${track.artist}|${track.title}` : "";

  // Manchetes (arquivo noticias.json publicado pelo GitHub junto com o site)
  const newsQuery = useNews(true);
  const feed = newsQuery.data;
  const nowMs = now.getTime();
  const newsItems = useMemo(() => feed?.items ?? [], [feed]);
  const urgentIds = useMemo(() => new Set(newsItems.filter((i) => isUrgent(i, nowMs)).map((i) => i.id)), [newsItems, nowMs]);

  // Plantões: interrompem a programação uma vez por sessão (no máximo os 3 mais recentes de cada vez).
  const [seen, setSeen] = useState<Set<string>>(readSeen);
  const pending = useMemo(
    () =>
      newsItems
        .filter((i) => urgentIds.has(i.id) && !seen.has(i.id))
        .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)),
    [newsItems, urgentIds, seen],
  );
  useEffect(() => {
    if (pending.length <= MAX_INTERRUPTS) return;
    setSeen((s) => new Set([...s, ...pending.slice(MAX_INTERRUPTS).map((i) => i.id)]));
  }, [pending]);
  useEffect(() => {
    try {
      sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
    } catch {
      /* sem armazenamento */
    }
  }, [seen]);
  const interruptItem = mode === "connecting" || mode === "lost" ? null : (pending[0] ?? null);

  // ---------- Voz da ANDRA-18 ----------
  const speakerRef = useRef<Speaker | null>(null);
  speakerRef.current ??= new Speaker();
  const [manifest, setManifest] = useState<VoiceManifest | null>(null);
  useEffect(() => {
    let alive = true;
    loadManifest().then((m) => alive && setManifest(m));
    const t = window.setInterval(() => loadManifest().then((m) => alive && setManifest(m)), 10 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  const [autoVoice, setAutoVoice] = useState<boolean>(() => {
    try {
      return localStorage.getItem(VOICE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const toggleAutoVoice = () =>
    setAutoVoice((v) => {
      try {
        localStorage.setItem(VOICE_KEY, v ? "0" : "1");
      } catch {
        /* sem armazenamento */
      }
      return !v;
    });
  const [caption, setCaption] = useState<{ text: string; kind: VoiceKind; tag: string } | null>(null);
  const [lastKind, setLastKind] = useState<VoiceKind | null>(null);
  const onDuckRef = useRef(onDuck);
  onDuckRef.current = onDuck;

  const phrase = (id: string): Segment => ({ text: PHRASES[id] ?? "", audio: manifest?.phrases[id] ?? null });
  // Anúncio da rádio: as descobertas automaticamente (e as do ouvinte) não estão na lista fixa de falas.
  const stationPhrase = (s: Station): Segment => ({ text: PHRASES[`radio-${s.id}`] ?? stationLine(s), audio: manifest?.phrases[`radio-${s.id}`] ?? null });
  const newsSegment = (it: NewsItem): Segment => ({ text: it.speech || `${newsLead(it)}: ${it.title}`, audio: it.audio ?? null });

  const talk = (segments: Segment[], tag: string, newsTexts?: Set<string>) => {
    const sp = speakerRef.current!;
    onDuckRef.current?.(true);
    let first = true;
    sp.speak(segments, (text, kind) => {
      setCaption({ text, kind, tag });
      setLastKind(kind);
      // Avisa o cartão da ANDRA-18 (host.js): legenda, gestos e expressão de acordo com a fala.
      hostEvent("cw:speak", { text, tag, kind, mood: moodFor(text, tag), news: !!newsTexts?.has(text), first });
      first = false;
    }).finally(() => {
      // Só limpa se esta fala não foi substituída por outra.
      if (speakerRef.current === sp && !sp.busy()) {
        setCaption(null);
        onDuckRef.current?.(false);
        hostEvent("cw:speakend");
      }
    });
  };
  const silenceVoice = () => {
    speakerRef.current?.stop();
    setCaption(null);
    onDuckRef.current?.(false);
  };
  useEffect(() => () => {
    speakerRef.current?.stop();
    onDuckRef.current?.(false);
  }, []);

  const present = () => {
    const segs = [phrase(helloId(new Date(), Math.random() < 0.5 ? 1 : 2))];
    if (station && (mode === "music" || mode === "news" || mode === "event")) segs.push(stationPhrase(station));
    else segs.push(phrase("sem-radio"));
    talk(segs, "APRESENTAÇÃO");
  };
  const readNews = () => {
    const urgentFirst = [...newsItems.filter((i) => urgentIds.has(i.id)), ...interleave(newsItems.filter((i) => !urgentIds.has(i.id)), NEWS_READ)];
    const top = urgentFirst.slice(0, NEWS_READ);
    const segs = top.map(newsSegment);
    talk(top.length ? [phrase("noticias-abre"), ...segs, phrase("noticias-fecha")] : [phrase("noticias-vazio")], "NOTÍCIAS", new Set(segs.map((g) => g.text)));
  };
  // ---------- Conversa com o agente de I.A. (Copilot Studio) ----------
  const chatRef = useRef<AgentChat | null>(null);
  chatRef.current ??= new AgentChat();
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answerLinks, setAnswerLinks] = useState<AgentLink[]>([]);
  const [agentReady, setAgentReady] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    agentEndpoint().then((e) => alive && setAgentReady(!!e));
    return () => {
      alive = false;
    };
  }, []);
  const askAbort = useRef<AbortController | null>(null);
  const ask = async (q: string) => {
    const text = q.trim().slice(0, 500);
    if (!text || asking) return;
    askAbort.current?.abort();
    const ctrl = new AbortController();
    askAbort.current = ctrl;
    setAsking(true);
    setAnswerLinks([]);
    speakerRef.current?.stop();
    setCaption({ text: `“${text}”`, kind: "legenda", tag: "PERGUNTA" });
    hostEvent("cw:listen");
    try {
      const reply = await chatRef.current!.ask(text, ctrl.signal);
      setQuestion("");
      setAnswerLinks(reply.links);
      talk((sentences(reply.text).length ? sentences(reply.text) : ["Não tenho uma resposta agora."]).map((t) => ({ text: t })), "RESPOSTA");
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const why = err instanceof Error ? err.message : "erro";
      setCaption({ text: `Não consegui falar com o agente agora (${why}).`, kind: "legenda", tag: "SEM CONEXÃO" });
      window.setTimeout(() => setCaption((c) => (c?.tag === "SEM CONEXÃO" ? null : c)), 8000);
    } finally {
      if (askAbort.current === ctrl) setAsking(false);
    }
  };
  useEffect(() => () => askAbort.current?.abort(), []);

  // Pergunta por voz (Chrome e Edge; outros navegadores mostram só a caixa de texto).
  type Recog = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
  const RecogCtor = (window as unknown as { SpeechRecognition?: new () => Recog; webkitSpeechRecognition?: new () => Recog }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => Recog }).webkitSpeechRecognition;
  const [listening, setListening] = useState(false);
  const recogRef = useRef<Recog | null>(null);
  const toggleMic = () => {
    if (!RecogCtor) return;
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    speakerRef.current?.stop();
    const r = new RecogCtor();
    r.lang = "pt-BR";
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) finalText += res[0]!.transcript;
        else interim += res[0]!.transcript;
      }
      setQuestion((finalText + interim).trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setCaption({ text: "O navegador bloqueou o microfone. Libere o acesso ao microfone para este site.", kind: "legenda", tag: "MICROFONE" });
    };
    r.onend = () => {
      setListening(false);
      recogRef.current = null;
      if (finalText.trim()) void ask(finalText);
    };
    recogRef.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  };
  useEffect(() => () => recogRef.current?.abort(), []);

  const autoVoiceRef = useRef(autoVoice);
  autoVoiceRef.current = autoVoice;
  const actionsRef = useRef({ present, readNews, talk, silenceVoice });
  actionsRef.current = { present, readNews, talk, silenceVoice };

  // Compatível com o roteiro da host: window.CyberwaveHost.speak(texto), .readNews(), .present(), .stop()
  useEffect(() => {
    const w = window as unknown as { CyberwaveHost?: unknown };
    const api = {
      fromSite: true,
      autoVoice: () => autoVoiceRef.current,
      busy: () => !!speakerRef.current?.busy(),
      speak: (text: unknown) => typeof text === "string" && text.trim() && actionsRef.current.talk([{ text: text.slice(0, 400) }], "AO VIVO"),
      readNews: () => actionsRef.current.readNews(),
      present: () => actionsRef.current.present(),
      stop: () => actionsRef.current.silenceVoice(),
    };
    w.CyberwaveHost = api;
    return () => {
      if (w.CyberwaveHost === api) delete w.CyberwaveHost;
    };
  }, []);

  const live = mode === "music" || mode === "news" || mode === "event";
  // Rádio nova no ar: avisa o cartão da ANDRA-18 (gesto de apresentar).
  const stationEvRef = useRef<string | null>(null);
  useEffect(() => {
    if (!live || !station || stationEvRef.current === station.id) return;
    stationEvRef.current = station.id;
    hostEvent("cw:stationchange", { name: station.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, station?.id]);
  // Voz automática: anuncia a rádio quando começa a tocar, lê plantões e faz o giro de notícias.
  const announcedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoVoice || !live || !station || announcedRef.current === station.id) return;
    announcedRef.current = station.id;
    actionsRef.current.talk([stationPhrase(station)], "SINTONIA");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVoice, live, station?.id]);
  const spokenAlertsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!autoVoice || !interruptItem || spokenAlertsRef.current.has(interruptItem.id)) return;
    // O navegador só libera som depois de um clique na página.
    const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
    if (nav.userActivation && !nav.userActivation.hasBeenActive) return;
    spokenAlertsRef.current.add(interruptItem.id);
    const seg = newsSegment(interruptItem);
    actionsRef.current.talk([phrase("plantao-abre"), seg, phrase("plantao-fecha")], "PLANTÃO URGENTE", new Set([seg.text]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVoice, interruptItem?.id]);
  useEffect(() => {
    if (!autoVoice || !live) return;
    const t = window.setInterval(() => {
      if (!speakerRef.current?.busy()) actionsRef.current.readNews();
    }, NEWS_ROUND_MS);
    return () => window.clearInterval(t);
  }, [autoVoice, live]);

  const schedule = useMemo(() => {
    const radio = radioBulletins({ mode, station, track, trackKnown: known, now, total, sports, favorites, hasNews: newsItems.length > 0 });
    if (mode === "connecting" || mode === "lost") return radio;
    const news = interleave(newsItems, NEWS_IN_SCHEDULE).map((it) => newsBulletin(it, urgentIds.has(it.id)));
    return mergeSchedule(radio, news);
  }, [mode, station, track, known, now, total, sports, favorites, newsItems, urgentIds]);

  // Recomeça o programa quando muda a rádio, o estado do player ou a música.
  const sceneKey = `${mode}|${station?.id ?? ""}|${trackKey}`;
  const [scene, setScene] = useState(sceneKey);
  const [index, setIndex] = useState(0);
  if (scene !== sceneKey) {
    setScene(sceneKey);
    const [prevMode, prevStation] = scene.split("|");
    const trackAt = schedule.findIndex((b) => b.key === "r:faixa");
    setIndex(prevMode === mode && prevStation === (station?.id ?? "") && trackAt >= 0 ? trackAt : 0);
  }

  const current: Bulletin | undefined = interruptItem ? newsBulletin(interruptItem, true, true) : schedule[index % Math.max(1, schedule.length)];
  const text = current?.text ?? "";
  const [typing, setTyping] = useState<{ key: string; n: number }>({ key: "", n: 0 });
  const typed = typing.key === current?.key ? typing.n : 0;
  const done = reduced || typed >= text.length;
  const [hold, setHold] = useState(false);

  const curKey = current?.key ?? "";
  const curKind = current?.kind;
  const curNewsId = current?.news?.id;
  useEffect(() => {
    if (!curKey) return;
    if (!done) {
      const t = window.setTimeout(() => setTyping((s) => ({ key: curKey, n: (s.key === curKey ? s.n : 0) + 1 })), TYPE_MS);
      return () => window.clearTimeout(t);
    }
    if (hold || caption) return;
    const isInterrupt = curKey.startsWith("u:");
    const wait = isInterrupt ? HOLD_URGENT_MS : curKind === "radio" ? HOLD_MS : HOLD_NEWS_MS;
    const t = window.setTimeout(
      () => {
        if (isInterrupt && curNewsId) setSeen((s) => new Set([...s, curNewsId]));
        else if (schedule.length > 1) setIndex((i) => (i + 1) % schedule.length);
      },
      reduced ? wait * 1.5 : wait,
    );
    return () => window.clearTimeout(t);
  }, [curKey, curKind, curNewsId, done, typed, hold, caption, schedule.length, reduced]);

  // Plantão na tela (mesmo sem voz): a apresentadora reage.
  useEffect(() => {
    if (curKey.startsWith("u:")) hostRig()?.gesture("lean");
  }, [curKey]);
  // Música nova: avisa o cartão (gesto; com "Voz automática" ela anuncia a faixa).
  const lastTrackRef = useRef("");
  useEffect(() => {
    if (!trackKey || !active || lastTrackRef.current === trackKey) return;
    const first = !lastTrackRef.current;
    lastTrackRef.current = trackKey;
    if (first || !track?.title) return;
    hostEvent("cw:trackchange", { title: tidyName(track.title), artist: track.artist ? tidyName(track.artist) : "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey, active]);
  const shown = done ? text : text.slice(0, typed);
  const alert = !!current?.key.startsWith("u:");
  const news = current?.news;
  const tickerItems = useMemo(() => {
    const items: string[] = [];
    const urgent = newsItems.filter((i) => urgentIds.has(i.id)).slice(0, 3);
    for (const u of urgent) items.push(`PLANTÃO • ${u.sourceName.toUpperCase()}: ${u.title}`);
    if (station && live) {
      items.push(`NO RÁDIO: ${station.name.toUpperCase()}${station.frequency ? ` ${mhz(station.frequency)} MHZ` : ""}`);
      if (track?.title) items.push(`TOCANDO: ${[track.artist, track.title].filter(Boolean).map((v) => tidyName(v)).join(" — ").toUpperCase()}`);
    } else if (station && mode === "lost") {
      items.push(`SINAL PERDIDO: ${station.name.toUpperCase()}`);
    }
    for (const it of interleave(newsItems, 12)) if (!urgentIds.has(it.id)) items.push(`${it.sourceName.toUpperCase()}: ${it.title}`);
    items.push(`HORA CERTA ${hhmm(now).toUpperCase()}`);
    if (newsItems.length === 0) items.push(`${total} ESTAÇÕES NO CATÁLOGO`, `${ANDRA_NAME} // APRESENTADORA I.A.`);
    return items;
  }, [newsItems, urgentIds, station, live, mode, track, now, total]);

  const newsStatus = newsQuery.isPending
    ? "NOTÍCIAS: CONECTANDO…"
    : !feed
      ? "SEM NOTÍCIAS NO MOMENTO"
      : feed.items.length > 0
        ? `NOTÍCIAS ${feed.updatedAt ? hhmm(new Date(feed.updatedAt)) : ""} • ${feed.sourcesOk}/${feed.sourcesTotal} FONTES${feed.direct ? " • DIRETO" : ""}`
        : feed.site.state === "ausente"
          ? "SEM NOTÍCIAS • ARQUIVO NÃO PUBLICADO"
          : "SEM NOTÍCIAS • FONTES SEM RESPOSTA";
  const [diagOpen, setDiagOpen] = useState(false);
  const diagButton = useRef<HTMLButtonElement>(null);
  const closeDiag = () => {
    setDiagOpen(false);
    diagButton.current?.focus();
  };

  const scheduleCount = schedule.length;
  const position = interruptItem ? null : (index % Math.max(1, scheduleCount)) + 1;

  return (
    <section aria-labelledby="ai-title" className="cw-glass relative overflow-hidden" data-alert={alert ? "true" : "false"}>
      <Corners />
      {/* Barra superior */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-b px-4 py-2 font-mono text-xs",
          alert ? "ai-alert-bar border-cw-red/70" : "border-cw-yellow/30 bg-black/70",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-cyber text-[10px] font-black tracking-widest",
              alert ? "bg-white text-cw-red" : "bg-cw-red text-white",
            )}
          >
            <span aria-hidden="true" className="ai-led size-1.5 rounded-full bg-current" />
            AO VIVO
          </span>
          <h2 id="ai-title" className="truncate font-cyber text-sm font-extrabold tracking-[0.2em] text-cw-yellow">
            {alert ? (
              <span className="flex items-center gap-2 text-white">
                <TriangleAlert className="size-4" aria-hidden="true" /> PLANTÃO URGENTE
              </span>
            ) : (
              <>
                CW NEWS <span className="text-cw-red">//</span> <span className="text-cw-cyan">JORNAL I.A.</span>
              </>
            )}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-cw-yellow">
          <span className="hidden rounded border border-cw-cyan/50 px-2 py-0.5 text-[10px] tracking-widest text-cw-cyan xl:inline">
            RÁDIO: {MODE_LABEL[mode]}
          </span>
          <Clock />
          <button
            type="button"
            onClick={onHide}
            className="inline-flex items-center gap-1 rounded border border-cw-yellow/30 px-2 py-0.5 text-[11px] text-gray-300 hover:text-cw-yellow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cw-yellow"
          >
            <EyeOff className="size-3.5" aria-hidden="true" /> Ocultar
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,404px)_minmax(0,1fr)]">
        <div className="min-h-0 overflow-hidden border-b border-cw-yellow/20 bg-[#07070c] lg:border-r lg:border-b-0">
          <HostSlot alert={alert} />
        </div>

        <div
          className="relative flex min-h-0 min-w-0 flex-col justify-between gap-3 p-4 sm:p-5"
          onMouseEnter={() => setHold(true)}
          onMouseLeave={() => setHold(false)}
          onFocus={() => setHold(true)}
          onBlur={() => setHold(false)}
        >
          <div className="flex items-center justify-between gap-3 font-mono text-[11px] tracking-widest text-gray-400 uppercase">
            <span>
              <span className="text-cw-cyan">{ANDRA_NAME}</span> • Apresentadora virtual
              {position !== null && scheduleCount > 1 && (
                <span className="ml-2 text-gray-500 tabular-nums">
                  {String(position).padStart(2, "0")}/{String(scheduleCount).padStart(2, "0")}
                </span>
              )}
              {hold && <span className="ml-2 text-cw-yellow">• PAUSADO</span>}
            </span>
            <button
              ref={diagButton}
              type="button"
              aria-expanded={diagOpen}
              aria-controls="ai-news-diag"
              title="Ver o status de cada fonte de notícia"
              disabled={!feed}
              onClick={() => setDiagOpen((v) => !v)}
              className={cn(
                "inline-flex min-w-0 items-center gap-1 rounded px-1 uppercase hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cw-yellow disabled:no-underline",
                feed && feed.items.length > 0 ? "text-cw-cyan" : feed ? "text-cw-yellow" : "text-gray-500",
              )}
            >
              <span className="truncate">{newsStatus}</span>
              {feed && <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", diagOpen && "rotate-180")} aria-hidden="true" />}
            </button>
          </div>

          {diagOpen && feed && <NewsDiagnostics feed={feed} onClose={closeDiag} />}

          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p
                key={caption ? `voz:${caption.tag}` : current?.key}
                className={cn(
                  "ai-tag-in inline-block px-2.5 py-0.5 font-cyber text-xs font-black tracking-[0.25em]",
                  caption
                    ? caption.tag === "PLANTÃO URGENTE"
                      ? "bg-cw-red text-white"
                      : "bg-cw-cyan text-black"
                    : alert || current?.kind === "urgent" || mode === "lost"
                      ? "bg-cw-red text-white"
                      : "bg-cw-yellow text-black",
                  alert && "ai-alert-flash",
                )}
              >
                {caption ? `${ANDRA_NAME} • ${caption.tag}` : current?.tag}
              </p>
              {!caption && news && (
                <p className="font-mono text-[11px] tracking-wider text-gray-300 uppercase">
                  <span className="text-cw-cyan">{news.sourceName}</span>
                  {news.publishedAt !== null && <span> • {ago(news.publishedAt, nowMs)}</span>}
                  {news.lang === "en" && <span className="text-gray-500"> • em inglês</span>}
                </p>
              )}
            </div>
            {caption ? (
              <p aria-live="polite" className="cw-scrollbar max-h-[5.5rem] min-h-[4.5rem] overflow-y-auto font-mono text-lg leading-snug text-white xl:text-xl">
                {caption.text}
              </p>
            ) : (
            <p className={cn("line-clamp-3 min-h-[4.5rem] font-mono text-lg leading-snug xl:text-xl", alert ? "text-white" : "text-gray-100")}>
              <span className="sr-only">{text}</span>
              <span aria-hidden="true">
                {shown}
                <span className={cn("ai-caret ml-0.5 inline-block h-[1.1em] w-2.5 translate-y-[0.15em]", alert ? "bg-cw-red" : "bg-cw-cyan", done && "opacity-60")} />
              </span>
            </p>
            )}
          </div>

          <form
            className="flex items-center gap-1.5 font-mono text-xs"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <label htmlFor="andra-ask" className="sr-only">
              Pergunte à {ANDRA_NAME}
            </label>
            <input
              id="andra-ask"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              autoComplete="off"
              disabled={agentReady === false}
              placeholder={
                agentReady === false
                  ? "Agente de I.A. ainda não configurado (arquivo agente.json)"
                  : listening
                    ? "Ouvindo… fale sua pergunta"
                    : `Pergunte à ${ANDRA_NAME}: notícias, esportes, música…`
              }
              className="min-w-0 flex-1 rounded border border-cw-cyan/40 bg-black/70 px-2.5 py-1.5 text-gray-100 placeholder:text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cw-yellow disabled:opacity-60"
            />
            {RecogCtor && (
              <button
                type="button"
                onClick={toggleMic}
                disabled={agentReady === false || asking}
                aria-pressed={listening}
                aria-label={listening ? "Parar de ouvir" : "Perguntar por voz"}
                title={listening ? "Parar de ouvir" : "Perguntar por voz"}
                className={cn(VOICE_BTN, "px-2 disabled:opacity-40", listening && "ai-alert-flash border-cw-red text-cw-red")}
              >
                {listening ? <MicOff className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
              </button>
            )}
            <button
              type="submit"
              disabled={agentReady === false || asking || !question.trim()}
              aria-label="Enviar pergunta"
              className={cn(VOICE_BTN, "px-2 disabled:opacity-40")}
            >
              {asking ? <span className="text-[10px]">PENSANDO…</span> : <Send className="size-4" aria-hidden="true" />}
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]" role="group" aria-label={`Controles da ${ANDRA_NAME}`}>
            {/* Apresentar, Notícias e Silenciar ficam no cartão da ANDRA-18. */}
            <button
              type="button"
              aria-pressed={autoVoice}
              onClick={toggleAutoVoice}
              title="Anuncia a rádio, lê plantões urgentes e faz um giro de notícias a cada 30 minutos"
              className={cn(VOICE_BTN, autoVoice ? "border-cw-cyan/70 text-cw-cyan" : "text-gray-400")}
            >
              <Volume2 className="size-3.5" aria-hidden="true" /> Voz automática: {autoVoice ? "ligada" : "desligada"}
            </button>
            <span className="ml-auto text-[10px] tracking-wider text-gray-500 uppercase" title={manifest?.voice ? `Voz neural: ${manifest.voice}` : undefined}>
              Voz:{" "}
              {lastKind === "navegador"
                ? "navegador (feminina)"
                : lastKind === "legenda"
                  ? "só legenda neste aparelho"
                  : manifest && Object.keys(manifest.phrases).length > 0
                    ? "neural feminina"
                    : "aguardando gravação"}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {caption?.tag === "RESPOSTA" && answerLinks.length > 0 ? (
              <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label="Fontes da resposta">
                {answerLinks.map((l) => (
                  <li key={l.url}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-56 items-center gap-1.5 rounded border border-cw-cyan/50 bg-black/60 px-2.5 py-1 font-mono text-[11px] text-cw-cyan hover:bg-cw-cyan/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cw-yellow"
                    >
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{l.title}</span>
                      <span className="sr-only">, abre em nova aba</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : !caption && news ? (
              <a
                href={news.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded border border-cw-cyan/50 bg-black/60 px-2.5 py-1 font-mono text-[11px] text-cw-cyan hover:bg-cw-cyan/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cw-yellow"
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                Ler na fonte ({news.sourceName})<span className="sr-only">, abre em nova aba</span>
              </a>
            ) : (
              <dl className="flex min-w-0 flex-wrap gap-2 font-mono text-[11px]">
                <div className="flex gap-1.5 rounded border border-cw-yellow/30 bg-black/60 px-2 py-1">
                  <dt className="text-gray-400">ESTAÇÃO</dt>
                  <dd className="max-w-48 truncate text-cw-yellow">{station?.name ?? "—"}</dd>
                </div>
                <div className="flex gap-1.5 rounded border border-cw-yellow/30 bg-black/60 px-2 py-1">
                  <dt className="text-gray-400">SINAL</dt>
                  <dd className="text-cw-yellow">{station?.frequency ? `${mhz(station.frequency)} MHz` : station ? "WEB" : "—"}</dd>
                </div>
                <div className="flex gap-1.5 rounded border border-cw-cyan/30 bg-black/60 px-2 py-1">
                  <dt className="text-gray-400">RÁDIO</dt>
                  <dd className="text-cw-cyan">{MODE_LABEL[mode]}</dd>
                </div>
              </dl>
            )}
            <p className="max-w-md text-right font-mono text-[10px] leading-tight text-gray-500">
              Manchetes de CNN Brasil, BBC News Brasil, Fox News, Revista Oeste e Ancapsu, com link para a matéria. As respostas às
              perguntas são geradas por I.A. com busca na web e podem conter erros: confira nas fontes.
            </p>
          </div>
        </div>
      </div>

      <Ticker items={tickerItems} alert={alert} />
    </section>
  );
}
