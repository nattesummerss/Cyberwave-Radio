import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type SyntheticEvent } from "react";
import { Slider as SliderPrimitive, Tabs as TabsPrimitive } from "radix-ui";
import {
  AudioWaveform,
  CirclePlay,
  Heart,
  ListMusic,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  Music2,
  Podcast,
  BookHeadphones,
} from "lucide-react";
import { toast } from "sonner";
import { NowPlayingPanel } from "@/components/now-playing";
import { AiBroadcast } from "@/components/ai-broadcast";
import { MusicLibrary } from "@/components/music-library";
import { PodcastLibrary } from "@/components/podcast-library";
import { Clock, Corners, Spectrum, VuMeter } from "@/components/cyber";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { EmptyState } from "@/components/empty-state";
import {
  MINHAS_STORAGE_KEY,
  newMinhaRadio,
  playableUrl,
  toStations,
  type MinhaRadio,
} from "@/lib/minhas-radios";
import { useConfirm } from "@/hooks/use-confirm";
import { liveMeta } from "@/lib/live-meta";
import { ensureFx, FX_SUPPORTED, fxAllowedFor, fxGraph, fxHasSignal, rememberFx, setFxVolume, setVizLive, useVizLive } from "@/lib/audio-fx";
import {
  cachedProvision,
  newSbmId,
  openSideband,
  provisionTriton,
  sbmMetadataUrl,
  sbmStreamUrl,
  tritonMountExact,
  type CuePoint,
  type TritonLive,
} from "@/lib/triton-live";
import { lookupStreamUrls } from "@/lib/station-lookup";
import { loadServerChecks, onServerChecks, rememberedUrl, rememberUrl, serverCheck } from "@/lib/stream-health";
import { StationCheckDialog } from "@/components/station-check";
import { cachedExtras, isNewExtra, loadExtras, type ExtrasInfo } from "@/lib/radio-extras";
import { cn } from "@/lib/utils";
import {
  BAND_MAX,
  BAND_MIN,
  CITIES,
  mp3StreamUrl,
  rescueLookupOf,
  setResolvedStream,
  STATIONS,
  type BandId,
  type CityId,
  type Station,
} from "@/data/stations";

type PlayStatus = "idle" | "loading" | "playing" | "paused" | "error";
/** Uma tentativa de tocar: endereço + se usa o elemento de áudio analisado (espectro/VU reais). */
type Attempt = { url: string; fx: boolean };
/** Sem áudio depois deste tempo, o endereço é dado como fora do ar (redes de empresa/AVD às vezes só "seguram" a conexão). */
const LOAD_TIMEOUT_MS = 15_000;
/** Áudio parado (buffer vazio) por este tempo durante a reprodução: reconecta. */
const STALL_MS = 12_000;
const MAX_RECONNECTS = 2;
/** Cada endereço: primeiro com leitura do som (espectro/VU reais), depois sem. */
const attemptsFor = (urls: string[]): Attempt[] =>
  urls.flatMap((url) => (fxGraph() && fxAllowedFor(url) ? [{ url, fx: true }, { url, fx: false }] : [{ url, fx: false }]));

const STATUS_TONE: Record<PlayStatus, { led: string; ledText: string; tag: string; feed: string }> = {
  playing: {
    led: "bg-cw-yellow shadow-[0_0_8px_#fcee0a]",
    ledText: "text-cw-yellow",
    tag: "AO VIVO",
    feed: "Transmitindo ao vivo.",
  },
  loading: {
    led: "bg-cw-cyan shadow-[0_0_8px_#00f0ff] motion-safe:animate-pulse",
    ledText: "text-cw-cyan",
    tag: "CONECTANDO",
    feed: "Conectando ao stream…",
  },
  error: {
    led: "bg-cw-red shadow-[0_0_8px_#ff003c]",
    ledText: "text-cw-red",
    tag: "SEM SINAL",
    feed: "Sem sinal: não foi possível conectar a esta rádio.",
  },
  paused: {
    led: "bg-red-500 shadow-[0_0_6px_#ef4444]",
    ledText: "text-gray-400",
    tag: "OFFLINE",
    feed: "Em espera. Aperte o play para sintonizar.",
  },
  idle: {
    led: "bg-red-500 shadow-[0_0_6px_#ef4444]",
    ledText: "text-gray-400",
    tag: "OFFLINE",
    feed: "Em espera. Aperte o play para sintonizar.",
  },
};

/** Cada gênero ganha uma das três cores neon (sempre a mesma para o mesmo gênero). */
const NEON_TILE = [
  "border-cw-yellow/70 text-cw-yellow shadow-[0_0_10px_rgba(252,238,10,0.25)]",
  "border-cw-cyan/70 text-cw-cyan shadow-[0_0_10px_rgba(0,240,255,0.25)]",
  "border-cw-red/70 text-cw-red shadow-[0_0_10px_rgba(255,0,60,0.2)]",
];
const tileTone = (genre: string) => {
  let h = 0;
  for (const ch of genre) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NEON_TILE[h % NEON_TILE.length];
};

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cw-yellow";

const DEFAULT_STATION_ID = "sp-alpha";
const BANDS: { id: BandId; name: string }[] = [
  ...CITIES,
  { id: "sports", name: "Esportes" },
  { id: "web", name: "Web e outras cidades" },
  { id: "intl", name: "Internacionais" },
  { id: "rock", name: "Rock internacional" },
  { id: "rnb", name: "R&B" },
  { id: "fora", name: "Fora da empresa" },
];
const CITY_NAME: Record<CityId, string> = { sp: "São Paulo", rj: "Rio de Janeiro", bh: "Belo Horizonte" };

const fmtFreq = (f: number) => f.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const bandOf = (s: Station): BandId =>
  s.outside ? "fora" : s.sports ? "sports" : (s.city ?? (s.rock ? "rock" : s.rnb ? "rnb" : s.intl ? "intl" : "web"));
/** Abas mostradas como lista de cartões (as demais usam o dial FM). */
const isShelf = (b: BandId) => b === "sports" || b === "web" || b === "intl" || b === "rock" || b === "rnb" || b === "fora";
const placeOf = (s: Station) => (s.city ? CITY_NAME[s.city] : s.place ?? (s.custom ? "Minha rádio" : "Web"));
const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* armazenamento indisponível: segue só na sessão */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/** Distribui os rótulos do dial em faixas para não se sobreporem (base: 712 px úteis). */
function assignLanes(stations: Station[]) {
  const width = 712;
  const lastEnd: number[] = [];
  const lanes: Record<string, number> = {};
  [...stations]
    .sort((a, b) => (a.frequency ?? 0) - (b.frequency ?? 0))
    .forEach((s) => {
      const x = (((s.frequency ?? BAND_MIN) - BAND_MIN) / (BAND_MAX - BAND_MIN)) * width;
      const w = s.shortName.length * 7.2 + 20;
      const start = x - w / 2;
      let lane = lastEnd.findIndex((end) => start > end + 6);
      if (lane === -1) lane = lastEnd.length < 3 ? lastEnd.length : lastEnd.indexOf(Math.min(...lastEnd));
      lastEnd[lane] = x + w / 2;
      lanes[s.id] = lane;
    });
  return lanes;
}

const pct = (f: number) => ((f - BAND_MIN) / (BAND_MAX - BAND_MIN)) * 100;
const TICKS = Array.from({ length: 41 }, (_, i) => 88 + i * 0.5);

function TunerDial({
  stations,
  currentId,
  onTune,
}: {
  stations: Station[];
  currentId: string | null;
  onTune: (s: Station) => void;
}) {
  const lanes = useMemo(() => assignLanes(stations), [stations]);
  const current = stations.find((s) => s.id === currentId);
  const LANE_H = 34;
  const SCALE_TOP = 112;

  return (
    <div className="tuner-glass relative overflow-hidden rounded border border-cw-yellow/40 bg-black/90 shadow-neon-yellow">
      <div aria-hidden="true" className="scanlines pointer-events-none absolute inset-0" />
      <div className="cw-scrollbar relative overflow-x-auto pb-1">
        <div className="relative mx-auto h-[182px] min-w-[760px] px-6">
          <div className="relative h-full">
            {stations.map((s) => {
              const lane = lanes[s.id] ?? 0;
              const isCurrent = s.id === currentId;
              const top = 8 + lane * LANE_H;
              return (
                <div key={s.id}>
                  <span
                    aria-hidden="true"
                    className={cn("absolute w-px -translate-x-1/2", isCurrent ? "bg-cw-red" : "bg-cw-yellow/30")}
                    style={{ left: `${pct(s.frequency ?? BAND_MIN)}%`, top: top + 26, height: SCALE_TOP - top - 26 }}
                  />
                  <button
                    type="button"
                    onClick={() => onTune(s)}
                    aria-current={isCurrent ? "true" : undefined}
                    aria-label={`${s.name}, ${fmtFreq(s.frequency ?? 0)} FM${unstableNow(s) ? ", instável no último teste" : ""}`}
                    className={cn(
                      "dial-marker absolute -translate-x-1/2 rounded border px-2 py-1 font-mono text-xs whitespace-nowrap transition-colors",
                      FOCUS,
                      isCurrent
                        ? "border-cw-yellow bg-cw-yellow font-bold text-black shadow-neon-yellow"
                        : "border-cw-yellow/40 bg-black/80 text-cw-yellow hover:bg-cw-yellow/15 hover:text-white",
                    )}
                    style={{ left: `${pct(s.frequency ?? BAND_MIN)}%`, top }}
                  >
                    {s.shortName}
                    {unstableNow(s) && (
                      <span aria-hidden="true" title="Não respondeu nos últimos testes automáticos" className="ml-1 rounded-sm bg-cw-red px-0.5 text-[9px] font-bold text-white">
                        !
                      </span>
                    )}
                  </button>
                </div>
              );
            })}

            <svg
              aria-hidden="true"
              className="absolute inset-x-0 h-9 w-full"
              style={{ top: SCALE_TOP }}
              viewBox="0 0 1000 36"
              preserveAspectRatio="none"
            >
              <line x1="0" x2="1000" y1="1" y2="1" className="stroke-cw-yellow/50" vectorEffect="non-scaling-stroke" />
              {TICKS.map((f) => {
                const major = Number.isInteger(f) && f % 2 === 0;
                const x = pct(f) * 10;
                return (
                  <line
                    key={f}
                    x1={x}
                    x2={x}
                    y1="1"
                    y2={major ? 22 : Number.isInteger(f) ? 14 : 8}
                    className={major ? "stroke-cw-yellow/80" : "stroke-cw-yellow/35"}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
            {TICKS.filter((f) => Number.isInteger(f) && f % 4 === 0).map((f) => (
              <span
                key={f}
                aria-hidden="true"
                className="absolute -translate-x-1/2 font-mono text-xs text-cw-yellow/80 tabular-nums"
                style={{ left: `${pct(f)}%`, top: SCALE_TOP + 26 }}
              >
                {f}
              </span>
            ))}

            {current?.frequency && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute w-0.5 -translate-x-1/2 bg-cw-red shadow-[0_0_12px_#ff003c] transition-[left] duration-500 ease-out"
                style={{ left: `${pct(current.frequency)}%`, top: SCALE_TOP - 12, height: 44 }}
              >
                <span className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rotate-45 bg-cw-red shadow-neon-red" />
              </span>
            )}
            <span aria-hidden="true" className="absolute right-0 font-mono text-xs text-cw-cyan" style={{ top: SCALE_TOP + 46 }}>
              MHz
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A rádio não respondeu nos 2 últimos testes do GitHub (pode tocar no Brasil mesmo assim). */
function unstableNow(station: Station): boolean {
  const chk = station.custom ? null : serverCheck(station.id);
  return !!chk && !chk.ok && chk.fails >= 2;
}

function StationTile({ station, size = "md" }: { station: Station; size?: "md" | "lg" }) {
  const unstable = unstableNow(station);
  return (
    <span className="relative shrink-0">
      <span
        aria-hidden="true"
        className={cn(
          "grid place-items-center rounded border bg-black font-cyber font-bold",
          tileTone(station.genre),
          size === "lg" ? "size-14 text-lg" : "size-10 text-xs",
        )}
      >
        {initials(station.name) || "R"}
      </span>
      {unstable && (
        <span
          className="absolute -top-1 -right-1 rounded-sm bg-cw-red px-0.5 font-mono text-[8px] leading-tight font-bold text-white"
          title="Não respondeu nos últimos testes automáticos; pode estar fora do ar"
        >
          !<span className="sr-only"> rádio instável no último teste</span>
        </span>
      )}
    </span>
  );
}

const cardClass = (isCurrent: boolean) =>
  cn(
    "flex w-full items-center gap-3 rounded border p-2.5 text-left transition-colors",
    FOCUS,
    isCurrent
      ? "border-cw-yellow bg-cw-yellow/10 shadow-neon-yellow"
      : "border-cw-yellow/20 bg-black/60 hover:border-cw-yellow/60 hover:bg-cw-yellow/5",
  );

function WebShelf({
  stations,
  currentId,
  onTune,
}: {
  stations: Station[];
  currentId: string | null;
  onTune: (s: Station) => void;
}) {
  return (
    <ul className="cw-scrollbar grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
      {stations.map((s) => {
        const isCurrent = s.id === currentId;
        return (
          <li key={s.id}>
            <button type="button" onClick={() => onTune(s)} aria-current={isCurrent ? "true" : undefined} className={cardClass(isCurrent)}>
              <StationTile station={s} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">
                  {isNewExtra(s) && (
                    <span
                      data-testid="selo-nova"
                      title="Rádio descoberta automaticamente nos últimos 3 dias"
                      className="mr-1.5 rounded-sm bg-cw-cyan px-1 py-px align-[1px] font-mono text-[9px] font-bold tracking-wider text-black"
                    >
                      NOVA
                    </span>
                  )}
                  {s.name}
                </span>
                <span className="block truncate font-mono text-xs text-gray-400">
                  {s.genre} · {placeOf(s)}
                  {s.frequency ? ` ${fmtFreq(s.frequency)} FM` : ""}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Aviso no fim da aba: quantas rádios entraram pela busca automática diária do GitHub. */
function ExtrasNote({ count, band, updatedAt }: { count: number; band: BandId; updatedAt: number | null }) {
  if (!count) return null;
  const when = updatedAt
    ? new Date(updatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <p data-testid={`descobertas-${band}`} className="mt-2 font-mono text-[11px] leading-relaxed text-gray-400">
      Inclui {count} {count === 1 ? "rádio descoberta" : "rádios descobertas"} automaticamente, todas da StreamTheWorld (toca na rede da
      empresa). O GitHub procura rádios novas uma vez por dia{when ? ` (última busca: ${when})` : ""}. <span className="text-cw-cyan">NOVA</span>{" "}
      = chegou nos últimos 3 dias.
    </p>
  );
}

function MinhasGrid({
  stations,
  currentId,
  busy,
  onTune,
  onRemove,
}: {
  stations: Station[];
  currentId: string | null;
  busy: boolean;
  onTune: (s: Station) => void;
  onRemove: (s: Station) => void;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {stations.map((s) => {
        const isCurrent = s.id === currentId;
        const playable = !!s.streamUrl || !!s.lookup;
        return (
          <li key={s.id} className="relative">
            <button
              type="button"
              onClick={() => onTune(s)}
              disabled={!playable}
              aria-current={isCurrent ? "true" : undefined}
              className={cn(cardClass(isCurrent), "pr-12 disabled:cursor-not-allowed disabled:opacity-60")}
            >
              <StationTile station={s} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{s.name}</span>
                <span className="block truncate font-mono text-xs text-gray-400">
                  {playable ? s.genre : "Endereço de stream inválido"}
                </span>
              </span>
              {isCurrent && busy && <span className="font-mono text-xs font-bold text-cw-yellow">NO AR</span>}
            </button>
            <button
              type="button"
              onClick={() => onRemove(s)}
              aria-label={`Remover ${s.name}`}
              className={cn(
                "absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded text-gray-400 hover:bg-cw-red/15 hover:text-cw-red",
                FOCUS,
              )}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const fieldClass =
  "h-9 rounded border-gray-700 bg-black font-mono text-sm text-gray-100 placeholder:text-gray-500 focus-visible:border-cw-yellow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cw-yellow";
const labelClass = "font-mono text-[11px] tracking-wider text-gray-300 uppercase";

/** Formulário "Adicionar feed": salva uma rádio própria neste navegador. */
function AddStationForm({ onAdd }: { onAdd: (input: { name: string; streamUrl: string; genre: string }) => void }) {
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({});

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const url = String(data.get("url") ?? "").trim();
    const genre = String(data.get("genre") ?? "").trim() || "Variedades";
    const next: { name?: string; url?: string } = {};
    if (!name) next.name = "Informe o nome da rádio.";
    const parsed = playableUrl(url);
    if (!url) next.url = "Informe o endereço do stream.";
    else if (!parsed) next.url = "Use um endereço válido que comece com https://";
    else if (/\.(m3u8?|pls)$/i.test(new URL(parsed).pathname))
      next.url = "Esse endereço é uma lista (.m3u, .m3u8 ou .pls). Use o endereço direto do áudio.";
    setErrors(next);
    if (next.name || next.url || !parsed) {
      form.querySelector<HTMLInputElement>(next.name ? "#st-name" : "#st-url")?.focus();
      return;
    }
    onAdd({ name, streamUrl: parsed, genre });
    form.reset();
  }

  return (
    <section
      id="adicionar"
      aria-labelledby="adicionar-title"
      className="flex flex-col rounded-lg border border-cw-cyan/30 bg-black/60 p-4 md:col-span-4"
    >
      <h2 id="adicionar-title" className="font-cyber text-xs font-bold tracking-wider text-cw-cyan uppercase">
        Adicionar feed
      </h2>
      <p className="mt-1 mb-3 text-xs text-gray-400">
        Cole o endereço direto do stream (MP3 ou AAC). A rádio fica salva só neste navegador.
      </p>
      <form className="flex flex-1 flex-col gap-3" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-1">
          <Label htmlFor="st-name" className={labelClass}>Nome</Label>
          <Input
            id="st-name"
            name="name"
            autoComplete="off"
            maxLength={120}
            placeholder="Ex.: Rock 101"
            className={fieldClass}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "st-name-err" : undefined}
          />
          {errors.name && <p id="st-name-err" className="text-xs text-cw-red">{errors.name}</p>}
        </div>
        <div className="grid gap-1">
          <Label htmlFor="st-url" className={labelClass}>Endereço do stream</Label>
          <Input
            id="st-url"
            name="url"
            type="url"
            inputMode="url"
            placeholder="https://playerservices.streamtheworld.com/..."
            autoComplete="off"
            maxLength={250}
            className={fieldClass}
            aria-invalid={!!errors.url}
            aria-describedby={errors.url ? "st-url-err" : undefined}
          />
          {errors.url && <p id="st-url-err" className="text-xs text-cw-red">{errors.url}</p>}
        </div>
        <div className="grid gap-1">
          <Label htmlFor="st-genre" className={labelClass}>Gênero</Label>
          <Input id="st-genre" name="genre" autoComplete="off" maxLength={60} placeholder="Variedades" className={fieldClass} />
        </div>
        <button
          type="submit"
          className={cn(
            "mt-auto w-full rounded border border-cw-yellow/50 bg-cw-yellow/20 py-2 font-cyber text-xs font-bold tracking-wider text-cw-yellow uppercase shadow-neon-yellow transition hover:bg-cw-yellow hover:text-black",
            FOCUS,
          )}
        >
          + Adicionar rádio
        </button>
      </form>
    </section>
  );
}

export function HomePage() {
  const audioRef = useRef<HTMLAudioElement>(null);
  /** Elemento com leitura do som (crossorigin) para o espectro e o VU sincronizados com a música. */
  const fxRef = useRef<HTMLAudioElement>(null);
  /** Elemento que está tocando agora (o comum ou o analisado). */
  const activeRef = useRef<HTMLAudioElement | null>(null);
  const attemptInfoRef = useRef<Attempt | null>(null);
  /** Endereço cuja tentativa com leitura do som falhou (para lembrar se o servidor não libera). */
  const fxFailedUrlRef = useRef<string | null>(null);
  const watchRef = useRef(0);
  const loadTimerRef = useRef(0);
  const stallTimerRef = useRef(0);
  const reconnectsRef = useRef(0);
  const lastTimeRef = useRef(0);
  /** Endereços já tentados nesta sintonia e sintonia em que a busca de reserva já foi feita. */
  const triedRef = useRef<Set<string>>(new Set());
  const rescuedRef = useRef(-1);
  const stoppingRef = useRef(false);
  const confirm = useConfirm();

  const [saved, setSaved] = usePersistentState<MinhaRadio[]>(MINHAS_STORAGE_KEY, []);
  const [favorites, setFavorites] = usePersistentState<string[]>("radio.favoritas", []);
  const [volume, setVolume] = usePersistentState<number>("radio.volume", 80);
  const [currentId, setCurrentId] = usePersistentState<string | null>("radio.ultima", DEFAULT_STATION_ID);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<PlayStatus>("idle");
  const statusRef = useRef<PlayStatus>("idle");
  statusRef.current = status;
  const [hidden, setHidden] = usePersistentState<string[]>("radio.ocultas", []);
  // Resultado do teste automático das rádios (GitHub): endereço que funciona e selos "instável".
  const [, setChecksAt] = useState(0);
  useEffect(() => {
    void loadServerChecks();
    return onServerChecks(() => setChecksAt(Date.now()));
  }, []);
  const [checkOpen, setCheckOpen] = useState(false);
  /** Rádio sendo sintonizada e endereços de reserva ainda não tentados (redirecionador, MP3). */
  const tuningRef = useRef<Station | null>(null);
  const fallbackRef = useRef<Attempt[]>([]);
  /** Cada tentativa de tocar ganha um número; respostas de tentativas antigas são ignoradas. */
  const attemptRef = useRef(0);
  /** Cada sintonia ganha um número; respostas atrasadas do provisionamento são ignoradas. */
  const tuneRef = useRef(0);
  /** Canal de metadados em tempo real da Triton (aberto quando o áudio começa a tocar). */
  const sbmRef = useRef<{ metaUrl: string; streamUrl: string; stationId: string } | null>(null);
  const closeSbmRef = useRef<(() => void) | null>(null);
  const cuesRef = useRef<CuePoint[]>([]);

  const [searchOpen, setSearchOpen] = useState(false);
  const vizLive = useVizLive();

  // Rádios descobertas pelo GitHub (radios-extras.json): a lista guardada abre na hora; a do site chega em seguida.
  const [extras, setExtras] = useState<ExtrasInfo>(() => cachedExtras(STATIONS));
  useEffect(() => {
    let alive = true;
    void loadExtras(STATIONS).then((x) => {
      if (alive && x) setExtras(x);
    });
    return () => {
      alive = false;
    };
  }, []);
  const catalog = useMemo(() => [...STATIONS, ...extras.stations], [extras]);
  const sportsCount = useMemo(() => catalog.filter((s) => bandOf(s) === "sports").length, [catalog]);
  const minhas = useMemo(() => toStations(saved), [saved]);
  const all = useMemo(() => [...catalog, ...minhas], [catalog, minhas]);
  // Uma rádio que saiu do catálogo (ou foi removida) volta para a padrão.
  const current = all.find((s) => s.id === currentId) ?? STATIONS.find((s) => s.id === DEFAULT_STATION_ID) ?? null;
  const [band, setBand] = useState<BandId>(() => (current?.custom ? "web" : current ? bandOf(current) : "sp"));

  const bandStations = useCallback(
    (b: BandId) => {
      const visible = (s: Station) => s.id === currentId || !hidden.includes(s.id);
      const list = catalog.filter((s) => bandOf(s) === b && visible(s));
      return isShelf(b) ? list : list.sort((x, y) => (x.frequency ?? 0) - (y.frequency ?? 0));
    },
    [catalog, hidden, currentId],
  );

  // Volume pedido pela host virtual (ela abaixa a música enquanto fala); null = sem interferência.
  const [hostLevel, setHostLevel] = useState<number | null>(null);
  useEffect(() => {
    const level = hostLevel === null ? volume : Math.min(volume, hostLevel * 100);
    const a = audioRef.current;
    if (a) {
      a.volume = level / 100;
      a.muted = muted;
    }
    // No elemento analisado o volume é aplicado depois da leitura, para o espectro não "encolher".
    setFxVolume(level, muted);
  }, [volume, muted, hostLevel]);

  // Ponte para a host virtual: window.cwAudio é o áudio que está tocando (o volume lido/gravado por
  // ela passa pelo controle de volume do site) e window.cwAnalyser é o analisador do espectro.
  useEffect(() => {
    const w = window as unknown as { cwAudio?: unknown; cwAnalyser?: unknown };
    const target = () => activeRef.current ?? audioRef.current;
    const proxy = new Proxy({} as HTMLAudioElement, {
      get(_t, prop) {
        if (prop === "volume") return volumeRef.current.volume / 100;
        const el = target();
        if (!el) return undefined;
        const v = Reflect.get(el, prop, el) as unknown;
        return typeof v === "function" ? (v as (...args: unknown[]) => unknown).bind(el) : v;
      },
      set(_t, prop, value) {
        if (prop === "volume") {
          const n = Number(value);
          if (Number.isFinite(n)) setHostLevel(n >= volumeRef.current.volume / 100 - 0.001 ? null : Math.max(0, Math.min(1, n)));
          return true;
        }
        const el = target();
        if (el) Reflect.set(el, prop, value, el);
        return true;
      },
    });
    w.cwAudio = proxy;
    return () => {
      if (w.cwAudio === proxy) delete w.cwAudio;
    };
  }, []);
  const volumeRef = useRef({ volume, muted });
  volumeRef.current = { volume, muted };

  useEffect(() => {
    if (!current || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.name,
      artist: current.frequency ? `${fmtFreq(current.frequency)} FM · ${placeOf(current)}` : placeOf(current),
      album: "Cyberwave Radio",
    });
  }, [current]);

  /** Fecha só o canal de metadados (a configuração continua, para reabrir no mesmo endereço). */
  const closeChannel = useCallback(() => {
    closeSbmRef.current?.();
    closeSbmRef.current = null;
    cuesRef.current = [];
  }, []);
  const closeSbm = useCallback(() => {
    closeChannel();
    sbmRef.current = null;
  }, [closeChannel]);
  useEffect(() => closeSbm, [closeSbm]);

  const stopWatch = useCallback(() => {
    window.clearTimeout(watchRef.current);
    watchRef.current = 0;
    window.clearTimeout(loadTimerRef.current);
    loadTimerRef.current = 0;
    window.clearTimeout(stallTimerRef.current);
    stallTimerRef.current = 0;
  }, []);
  /** Só o vigia do som analisado (os vigias de carregamento e travamento continuam). */
  const stopFxWatch = useCallback(() => {
    window.clearTimeout(watchRef.current);
    watchRef.current = 0;
  }, []);
  useEffect(() => stopWatch, [stopWatch]);

  /** Para e esvazia um elemento de áudio sem disparar o aviso de erro. */
  const silence = useCallback((el: HTMLAudioElement | null) => {
    if (!el || !el.getAttribute("src")) return;
    stoppingRef.current = true;
    el.pause();
    el.removeAttribute("src");
    el.load();
    stoppingRef.current = false;
  }, []);

  // Já descobre o servidor da rádio atual, para o play começar sem espera.
  const currentMount = current && !current.custom ? tritonMountExact(current.streamUrl) : null;
  useEffect(() => {
    if (currentMount && cachedProvision(currentMount) === undefined) provisionTriton(currentMount).catch(() => {});
  }, [currentMount]);

  const playUrl = useCallback((next: Attempt) => {
    const useFx = next.fx && !!fxRef.current && !!fxGraph();
    const a = useFx ? fxRef.current : audioRef.current;
    if (!a) return;
    stopWatch();
    setVizLive(false);
    silence(useFx ? audioRef.current : fxRef.current);
    activeRef.current = a;
    attemptInfoRef.current = { url: next.url, fx: useFx };
    triedRef.current.add(next.url);
    const attempt = ++attemptRef.current;
    a.src = next.url;
    setStatus("loading");
    lastTimeRef.current = 0;
    loadTimerRef.current = window.setTimeout(() => {
      loadTimerRef.current = 0;
      if (attempt !== attemptRef.current || activeRef.current !== a) return;
      failRef.current("tempo esgotado");
    }, LOAD_TIMEOUT_MS);
    a.play().catch((err: unknown) => {
      if (attempt !== attemptRef.current) return;
      // Troca de rádio no meio do carregamento, ou formato não suportado (tratado no onError do áudio).
      if (err instanceof DOMException && (err.name === "AbortError" || err.name === "NotSupportedError")) return;
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        // O navegador só deixa tocar depois de um toque do usuário.
        window.clearTimeout(loadTimerRef.current);
        setStatus("idle");
        toast("Toque no play para começar a tocar.");
        return;
      }
      setStatus("error");
    });
  }, [silence, stopWatch]);
  const failRef = useRef<(why: string) => void>(() => {});

  /** Se um endereço não tocar, passa para o próximo (servidor direto → redirecionador → MP3). */
  const tryNext = useCallback((): boolean => {
    const next = fallbackRef.current.shift();
    if (!next) return false;
    const s = tuningRef.current;
    if (sbmRef.current && next.url === sbmRef.current.streamUrl) {
      // Mesmo endereço, outro elemento de áudio: o canal reabre quando voltar a tocar.
      closeChannel();
    } else {
      closeSbm();
      if (s) liveMeta.setSource(s.id, "off");
    }
    playUrl(next);
    return true;
  }, [closeChannel, closeSbm, playUrl]);

  /**
   * Depois que o elemento analisado começa a tocar, confere se a leitura do som funciona.
   * Se só chegar silêncio (servidor ou navegador bloqueando), toca o mesmo endereço no
   * elemento comum, para a música nunca ficar muda.
   */
  const watchFx = useCallback(() => {
    stopFxWatch();
    const a = fxRef.current;
    const info = attemptInfoRef.current;
    if (!a || !info?.fx) return;
    const started = performance.now();
    const startTime = a.currentTime;
    const check = () => {
      watchRef.current = 0;
      if (activeRef.current !== a || attemptInfoRef.current !== info || a.paused) return;
      if (fxHasSignal()) {
        rememberFx(info.url, true);
        setVizLive(true);
        return;
      }
      const elapsed = performance.now() - started;
      if ((a.currentTime - startTime > 2.5 && elapsed > 3000) || elapsed > 12_000) {
        rememberFx(info.url, false);
        if (fallbackRef.current[0]?.url !== info.url) fallbackRef.current.unshift({ url: info.url, fx: false });
        tryNext();
        return;
      }
      watchRef.current = window.setTimeout(check, 250);
    };
    watchRef.current = window.setTimeout(check, 250);
  }, [stopFxWatch, tryNext]);

  /**
   * Última tentativa: procura a mesma rádio no diretório Radio Browser (endereços https que
   * passaram no último teste do diretório) e tenta os que ainda não foram tentados.
   */
  const rescue = useCallback((): boolean => {
    const s = tuningRef.current;
    if (!s || rescuedRef.current === tuneRef.current) return false;
    const lookup = rescueLookupOf(s);
    if (!lookup) return false;
    rescuedRef.current = tuneRef.current;
    const token = tuneRef.current;
    setStatus("loading");
    lookupStreamUrls(lookup)
      .catch(() => [] as string[])
      .then((urls) => {
        if (token !== tuneRef.current) return;
        const fresh = urls.filter((u) => !triedRef.current.has(u));
        fallbackRef.current = attemptsFor(fresh);
        if (!tryNext()) setStatus("error");
      });
    return true;
  }, [tryNext]);

  /** Endereço atual falhou (erro, tempo esgotado ou travou de vez): próximo de reserva, depois a busca. */
  const failAttempt = useCallback(
    (why: string) => {
      stopWatch();
      setVizLive(false);
      // Endereço que nem respondeu: não adianta tentar o mesmo de novo (só com outro elemento de áudio).
      const failedUrl = attemptInfoRef.current?.url;
      if (why === "tempo esgotado" && failedUrl) fallbackRef.current = fallbackRef.current.filter((a) => a.url !== failedUrl);
      if (tryNext() || rescue()) return;
      const el = activeRef.current;
      console.error("audio playback failed", {
        why,
        mediaErrorCode: el?.error?.code,
        station: tuningRef.current && !tuningRef.current.custom ? tuningRef.current.id : "minha-radio",
        canPlayAac: el?.canPlayType("audio/aac") || "no",
        canPlayMp3: el?.canPlayType("audio/mpeg") || "no",
      });
      setStatus("error");
    },
    [stopWatch, tryNext, rescue],
  );
  failRef.current = failAttempt;

  /** Reconecta no mesmo endereço (queda curta de rede); depois de algumas vezes, passa para a reserva. */
  const reconnect = useCallback(() => {
    const info = attemptInfoRef.current;
    if (!info) return;
    if (reconnectsRef.current >= MAX_RECONNECTS) {
      failAttempt("travou");
      return;
    }
    reconnectsRef.current++;
    playUrl(info);
  }, [failAttempt, playUrl]);

  const armStall = useCallback(() => {
    if (stallTimerRef.current) return;
    stallTimerRef.current = window.setTimeout(() => {
      stallTimerRef.current = 0;
      if (statusRef.current === "paused" || statusRef.current === "idle") return;
      reconnect();
    }, STALL_MS);
  }, [reconnect]);
  const clearStall = () => {
    window.clearTimeout(stallTimerRef.current);
    stallTimerRef.current = 0;
  };

  /** Aplica as músicas avisadas pelo canal quando o áudio chega ao ponto em que elas entram no ar. */
  const flushCues = useCallback(() => {
    const a = activeRef.current;
    const sbm = sbmRef.current;
    if (!a || !sbm || cuesRef.current.length === 0) return;
    const now = a.currentTime * 1000;
    const waiting: CuePoint[] = [];
    for (const cue of cuesRef.current) {
      // Relógio muito diferente do áudio (mais de 2 min à frente): mostra logo.
      if (cue.timestamp > now + 250 && cue.timestamp - now < 120_000) {
        waiting.push(cue);
        continue;
      }
      if (cue.kind === "track") liveMeta.setTrack(sbm.stationId, { ...cue.track, startedAt: Date.now() });
      else liveMeta.setAd(sbm.stationId, cue.durationMs);
    }
    cuesRef.current = waiting;
  }, []);

  const openSbmIfReady = useCallback(() => {
    const a = activeRef.current;
    const sbm = sbmRef.current;
    if (!a || !sbm || closeSbmRef.current || a.src !== sbm.streamUrl) return;
    const { stationId } = sbm;
    closeSbmRef.current = openSideband(
      sbm.metaUrl,
      (cue) => {
        cuesRef.current.push(cue);
        flushCues();
      },
      (state) => liveMeta.setSource(stationId, state),
    );
  }, [flushCues]);

  const stop = useCallback(() => {
    tuneRef.current++;
    attemptRef.current++;
    fallbackRef.current = [];
    closeSbm();
    stopWatch();
    setVizLive(false);
    silence(audioRef.current);
    silence(fxRef.current);
    activeRef.current = null;
    attemptInfoRef.current = null;
    setStatus("paused");
  }, [closeSbm, silence, stopWatch]);

  // Uma música sob demanda começou: a rádio para.
  useEffect(() => {
    const onMusic = () => stop();
    document.addEventListener("cw:music-play", onMusic);
    return () => document.removeEventListener("cw:music-play", onMusic);
  }, [stop]);

  const tuneSelfRef = useRef<((s: Station) => void) | null>(null);
  const tune = useCallback(
    (s: Station) => {
      // Músicas sob demanda param quando a rádio começa.
      document.dispatchEvent(new CustomEvent("cw:radio-play"));
      setCurrentId(s.id);
      if (!s.custom) setBand(bandOf(s));
      tuningRef.current = s;
      fallbackRef.current = [];
      fxFailedUrlRef.current = null;
      triedRef.current = new Set();
      reconnectsRef.current = 0;
      closeSbm();
      // Prepara a leitura do som ainda dentro do clique (o navegador exige um toque do usuário).
      const g = ensureFx(fxRef.current);
      if (g) {
        setFxVolume(volumeRef.current.volume, volumeRef.current.muted);
        (window as unknown as { cwAnalyser?: AnalyserNode }).cwAnalyser = g.spectrum;
      }
      liveMeta.reset(s.id);
      // Endereço achado pelo teste do GitHub para rádios sem endereço fixo (ex.: Nativa).
      const checked = s.custom ? null : serverCheck(s.id);
      if (!s.streamUrl && checked?.ok && checked.url) {
        setResolvedStream(s.id, checked.url);
        tuneSelfRef.current?.({ ...s, streamUrl: checked.url, tritonCandidates: undefined, lookup: s.lookup });
        return;
      }
      if (!s.streamUrl && (s.tritonCandidates?.length || s.lookup)) {
        // Endereço descoberto na hora: 1) pergunta à StreamTheWorld quais nomes existem;
        // 2) se nenhum, procura no diretório Radio Browser.
        const token = ++tuneRef.current;
        setStatus("loading");
        const viaLookup = () => {
          if (!s.lookup) return Promise.resolve<string[]>([]);
          return lookupStreamUrls(s.lookup).catch(() => [] as string[]);
        };
        const viaTriton = async (): Promise<string | null> => {
          const names = s.tritonCandidates ?? [];
          if (!names.length) return null;
          const found = await Promise.all(names.map((m) => (cachedProvision(m) !== undefined ? Promise.resolve(cachedProvision(m) ?? null) : provisionTriton(m).catch(() => null))));
          const i = found.findIndex((x) => !!x);
          return i >= 0 ? names[i]! : null;
        };
        viaTriton().then(async (mount) => {
          if (token !== tuneRef.current) return;
          if (mount) {
            setResolvedStream(s.id, `https://playerservices.streamtheworld.com/api/livestream-redirect/${mount}.aac`);
            tuneSelfRef.current?.({ ...s, streamUrl: `https://playerservices.streamtheworld.com/api/livestream-redirect/${mount}.aac`, tritonCandidates: undefined });
            return;
          }
          const urls = await viaLookup();
          if (token !== tuneRef.current) return;
          if (!urls.length) {
            setStatus("error");
            return;
          }
          const attempts = attemptsFor(urls);
          fallbackRef.current = attempts.slice(1);
          if (attempts[0]) playUrl(attempts[0]);
        });
        return;
      }
      if (!s.streamUrl) {
        stop();
        setStatus("error");
        return;
      }
      const token = ++tuneRef.current;
      // Se da última vez só a reserva tocou neste aparelho, começa por ela.
      // Ordem: o que tocou neste aparelho, o que o teste do GitHub achou, o principal, a reserva em MP3.
      const serverUrl = s.custom ? null : (serverCheck(s.id)?.url ?? null);
      const backups = [s.custom ? null : rememberedUrl(s.id), serverUrl, s.streamUrl, mp3StreamUrl(s)].filter(
        (u, i, arr): u is string => !!u && arr.indexOf(u) === i,
      );
      const begin = (live: TritonLive | null) => {
        if (token !== tuneRef.current) return;
        let urls = backups;
        if (live?.sbmSuffix && backups[0] === s.streamUrl) {
          // Toca direto do servidor da Triton com o código da sessão, para receber a música em tempo real.
          const sbmid = newSbmId();
          const streamUrl = sbmStreamUrl(live, sbmid);
          sbmRef.current = { metaUrl: sbmMetadataUrl(live, sbmid), streamUrl, stationId: s.id };
          urls = [streamUrl, ...backups];
        }
        const attempts = attemptsFor(urls.length ? urls : [s.streamUrl]);
        fallbackRef.current = attempts.slice(1);
        if (attempts[0]) playUrl(attempts[0]);
      };
      const mount = tritonMountExact(s.streamUrl);
      if (!mount) return begin(null);
      const known = cachedProvision(mount);
      if (known !== undefined) return begin(known);
      setStatus("loading");
      provisionTriton(mount).then(begin, () => begin(null));
    },
    [setCurrentId, playUrl, stop, closeSbm],
  );
  tuneSelfRef.current = tune;

  // Internet voltou (Wi-Fi, VPN ou AVD reconectada): retoma a rádio que estava tentando tocar.
  useEffect(() => {
    const onOnline = () => {
      const s = tuningRef.current;
      if (s && (statusRef.current === "error" || statusRef.current === "loading")) tuneSelfRef.current?.(s);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const onAudioPlaying = (el: HTMLAudioElement) => {
    if (el !== activeRef.current) return;
    window.clearTimeout(loadTimerRef.current);
    loadTimerRef.current = 0;
    clearStall();
    setStatus("playing");
    openSbmIfReady();
    const info = attemptInfoRef.current;
    if (!info) return;
    const s = tuningRef.current;
    if (s && !s.custom && s.streamUrl) {
      // Guarda a reserva que funcionou (o endereço principal e o de sessão da Triton não precisam).
      const isPrimary = info.url === s.streamUrl || info.url === sbmRef.current?.streamUrl || info.url === mp3StreamUrl(s);
      if (isPrimary) {
        if (info.url === s.streamUrl || info.url === sbmRef.current?.streamUrl) rememberUrl(s.id, null);
      } else rememberUrl(s.id, info.url);
    }
    if (info.fx) watchFx();
    else if (fxFailedUrlRef.current === info.url) {
      // Só tocou sem a leitura do som: o servidor não libera o áudio para análise.
      rememberFx(info.url, false);
      fxFailedUrlRef.current = null;
    }
  };

  const onAudioError = (el: HTMLAudioElement) => {
    // Sem erro registrado, ou elemento que não está mais em uso: o áudio já mudou para outra tentativa.
    if (el !== activeRef.current || stoppingRef.current || !el.getAttribute("src") || !el.error) return;
    const info = attemptInfoRef.current;
    if (info?.fx) fxFailedUrlRef.current = info.url;
    failAttempt("erro " + (el.error?.code ?? ""));
  };

  const audioEvents = {
    preload: "none" as const,
    onPlaying: (e: SyntheticEvent<HTMLAudioElement>) => onAudioPlaying(e.currentTarget),
    onTimeUpdate: (e: SyntheticEvent<HTMLAudioElement>) => {
      const el = e.currentTarget;
      if (el !== activeRef.current) return;
      flushCues();
      if (el.currentTime > lastTimeRef.current + 0.5) {
        lastTimeRef.current = el.currentTime;
        clearStall();
        // Tocando bem por um tempo: zera a contagem de reconexões.
        if (el.currentTime > 60) reconnectsRef.current = 0;
      }
    },
    onWaiting: (e: SyntheticEvent<HTMLAudioElement>) => {
      if (e.currentTarget !== activeRef.current) return;
      setStatus((st) => (st === "playing" ? "loading" : st));
      if (statusRef.current === "playing") armStall();
    },
    onStalled: (e: SyntheticEvent<HTMLAudioElement>) => {
      if (e.currentTarget === activeRef.current && statusRef.current === "playing") armStall();
    },
    onEnded: (e: SyntheticEvent<HTMLAudioElement>) => {
      // Transmissão ao vivo não tem fim: o servidor derrubou a conexão.
      if (e.currentTarget === activeRef.current && !stoppingRef.current && attemptInfoRef.current) reconnect();
    },
    onError: (e: SyntheticEvent<HTMLAudioElement>) => onAudioError(e.currentTarget),
  };

  const togglePlay = () => {
    if (!current) return;
    if (status === "playing" || status === "loading") stop();
    else tune(current);
  };

  const step = (dir: 1 | -1) => {
    if (!current) return;
    const list = current.custom ? minhas : bandStations(bandOf(current));
    const i = list.findIndex((s) => s.id === current.id);
    const next = list[(i + dir + list.length) % list.length];
    if (next) tune(next);
  };

  const isFav = current ? favorites.includes(current.id) : false;
  const toggleFav = () => {
    if (!current) return;
    setFavorites((f) => (f.includes(current.id) ? f.filter((x) => x !== current.id) : [...f, current.id]));
  };

  const addCustom = (input: { name: string; streamUrl: string; genre: string }) => {
    const radio = newMinhaRadio(input);
    setSaved((list) => [...(Array.isArray(list) ? list : []), radio]);
    toast.success(`${radio.name} adicionada`);
  };

  const removeCustom = async (s: Station) => {
    const ok = await confirm({
      title: `Remover ${s.name}?`,
      confirmLabel: "Remover",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    if (s.id === currentId) {
      stop();
      setCurrentId(null);
    }
    setSaved((list) => (Array.isArray(list) ? list.filter((r) => r?.id !== s.id) : []));
    setFavorites((f) => f.filter((x) => x !== s.id));
    toast.success(`${s.name} removida`);
  };

  const favStations = favorites.map((id) => all.find((s) => s.id === id)).filter((s): s is Station => !!s);
  const presets = Array.from({ length: 6 }, (_, i) => favStations[i] ?? null);
  const tone = STATUS_TONE[status];
  const playing = status === "playing";
  const busy = status === "playing" || status === "loading";
  const bandName = current?.custom ? "Minhas rádios" : (BANDS.find((b) => b.id === (current ? bandOf(current) : band))?.name ?? "");

  const goToAddForm = () => {
    const el = document.getElementById("st-name");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    (el as HTMLInputElement | null)?.focus({ preventScroll: true });
  };

  const squareBtn = cn(
    "grid size-11 place-items-center rounded border border-cw-yellow/40 bg-gray-900 text-cw-yellow shadow-neon-yellow transition hover:bg-yellow-950 disabled:opacity-40",
    FOCUS,
  );

  return (
    <>
      <header className="sticky top-0 z-40 bg-cw-black/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="cw-cut-btn grid size-10 shrink-0 place-items-center bg-cw-yellow">
              <AudioWaveform className="size-6 text-black" strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 font-cyber text-base font-extrabold tracking-widest sm:text-lg">
                <span className="cw-glitch cw-glow-text text-xl text-cw-yellow sm:text-2xl" data-text="CYBERWAVE">
                  CYBERWAVE
                </span>
                <span className="cw-cut-btn bg-cw-cyan px-2.5 py-0.5 text-[10px] font-black tracking-[0.3em] text-black sm:text-xs">
                  RADIO
                </span>
              </h1>
              <p className="hidden font-mono text-[11px] text-gray-400 sm:block">
                {all.length} estações • SP • RJ • BH • Esportes • Web • Rock • R&B • Fora da empresa
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <div
              aria-hidden="true"
              className="hidden items-center gap-2 rounded border border-cw-yellow/30 bg-black/60 px-3 py-1 font-mono text-xs sm:flex"
            >
              <span className={cn("size-2 rounded-sm", tone.led)} />
              <span className={tone.ledText}>{tone.tag}</span>
            </div>
            <a
              href="#musicas"
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById("musicas");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
                el?.focus({ preventScroll: true });
              }}
              className={cn(
                "flex items-center gap-1.5 rounded border border-cw-cyan/40 bg-gray-900 px-3.5 py-1.5 font-mono text-xs font-semibold text-cw-cyan transition-all hover:bg-cyan-950",
                FOCUS,
              )}
            >
              <Music2 className="size-4" aria-hidden="true" /> Músicas
            </a>
            <a
              href="#podcasts"
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById("podcasts");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
                el?.focus({ preventScroll: true });
              }}
              className={cn(
                "flex items-center gap-1.5 rounded border border-cw-yellow/40 bg-gray-900 px-3.5 py-1.5 font-mono text-xs font-semibold text-cw-yellow transition-all hover:bg-yellow-950",
                FOCUS,
              )}
            >
              <Podcast className="size-4" aria-hidden="true" /> Podcasts
            </a>
            <a
              href="#audiolivros"
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById("audiolivros");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
                el?.focus({ preventScroll: true });
              }}
              className={cn(
                "flex items-center gap-1.5 rounded border border-cw-yellow/40 bg-gray-900 px-3.5 py-1.5 font-mono text-xs font-semibold text-cw-yellow transition-all hover:bg-yellow-950",
                FOCUS,
              )}
            >
              <BookHeadphones className="size-4" aria-hidden="true" /> Audiolivros
            </a>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={cn(
                "flex items-center gap-1.5 rounded border border-cw-yellow/40 bg-gray-900 px-3.5 py-1.5 font-mono text-xs font-semibold text-cw-yellow shadow-neon-yellow transition-all hover:bg-yellow-950",
                FOCUS,
              )}
            >
              <Search className="size-4" aria-hidden="true" /> Buscar
            </button>
            <button
              type="button"
              onClick={goToAddForm}
              className={cn(
                "cw-cut-btn flex items-center gap-1.5 bg-cw-yellow px-4 py-1.5 pr-5 font-cyber text-xs font-bold tracking-wider text-black uppercase transition-all hover:bg-yellow-200",
                FOCUS,
              )}
            >
              <Plus className="size-4" aria-hidden="true" /> Adicionar
            </button>
          </div>
        </div>
        <div aria-hidden="true" className="cw-hazard h-1 w-full opacity-80" />
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-3 py-5 sm:px-6" data-host-level={hostLevel ?? undefined}>
        <audio ref={audioRef} {...audioEvents} />
        {/* Mesmo player, mas com leitura do som liberada pela rádio (espectro e VU sincronizados). */}
        <audio ref={fxRef} crossOrigin="anonymous" {...audioEvents} />

        <AiBroadcast
          station={current}
          status={status}
          total={all.length}
          sports={sportsCount}
          favorites={favStations.length}
          onDuck={(on) => setHostLevel(on ? (volumeRef.current.volume / 100) * 0.25 : null)}
        />

        <section
          id="sintonizador"
          tabIndex={-1}
          aria-labelledby="tuner-title"
          className="cw-glass relative overflow-hidden p-4 shadow-cw-chassis outline-none sm:p-7"
        >
          <Corners />
          <h2 id="tuner-title" className="sr-only">Sintonizador</h2>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Display holográfico */}
            <div className="relative flex flex-col justify-between rounded-lg border border-cw-yellow/40 bg-black/80 p-4 shadow-neon-yellow sm:p-5 lg:col-span-8">
              <div aria-hidden="true" className="scanlines pointer-events-none absolute inset-0 rounded-lg" />

              <div className="relative z-10 mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-cw-yellow/30 pb-2 font-mono text-xs text-cw-yellow">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="relative flex size-2">
                      {playing && <span className="absolute inset-0 rounded-sm bg-cw-yellow motion-safe:animate-ping" />}
                      <span className={cn("relative size-2 rounded-sm", tone.led)} />
                    </span>
                    <span>LINK: {tone.tag}</span>
                  </span>
                  <span aria-hidden="true" className="hidden sm:inline">•</span>
                  <span className="truncate font-bold text-cw-cyan uppercase">{bandName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock />
                  {(current?.codec || current?.bitrate) && (
                    <span className="rounded border border-cw-yellow/40 bg-cw-yellow/10 px-1.5 py-0.5 text-[10px] text-yellow-100">
                      {[current.codec, current.bitrate ? `${current.bitrate} KBPS` : ""].filter(Boolean).join(" ")}
                    </span>
                  )}
                </div>
              </div>

              <div className="relative z-10 py-2">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                  <p className="flex items-baseline gap-2">
                    <span className="cw-glow-text font-cyber text-5xl font-black tracking-wider text-cw-yellow tabular-nums sm:text-6xl">
                      {current?.frequency ? fmtFreq(current.frequency) : "WEB"}
                    </span>
                    <span className="font-mono text-sm font-bold text-cw-red sm:text-base">
                      {current?.frequency ? "MHz" : "STREAM"}
                    </span>
                  </p>
                  <div className="min-w-0 text-left sm:text-right">
                    {current && (
                      <p className="truncate font-mono text-[11px] tracking-widest text-cw-cyan uppercase">
                        {placeOf(current)} • {current.genre}
                      </p>
                    )}
                    <p className="max-w-xs truncate font-cyber text-lg font-bold text-white sm:max-w-sm sm:text-xl">
                      {current?.name ?? "Nenhuma rádio sintonizada"}
                    </p>
                  </div>
                </div>

                <p className="mt-2 font-mono text-xs text-gray-300 sm:truncate" role="status">
                  <span className="text-cw-yellow">FEED:</span> {current ? tone.feed : "Escolha uma rádio no dial."}
                </p>
              </div>

              <div className="relative z-10 mt-3 border-t border-cw-yellow/20 pt-2">
                <p className="mb-1 flex items-center justify-between gap-2 font-mono text-[10px] text-cw-yellow/80">
                  <span aria-hidden="true">ESPECTRO DE FREQUÊNCIA</span>
                  {playing && (
                    <span
                      className={cn("rounded-sm px-1.5 py-px tracking-wider", vizLive ? "bg-cw-cyan/15 text-cw-cyan" : "text-gray-500")}
                      title={
                        vizLive
                          ? "O espectro e o VU estão lendo o som desta rádio."
                          : FX_SUPPORTED
                            ? "Esta rádio não libera a leitura do áudio para o navegador; a animação é simulada."
                            : "No celular a animação é simulada, para a rádio não parar quando a tela bloqueia."
                      }
                    >
                      {vizLive ? "● SINCRONIZADO COM O ÁUDIO" : "ANIMAÇÃO SIMULADA"}
                    </span>
                  )}
                </p>
                <Spectrum on={playing} />
              </div>
            </div>

            {/* Painel lateral: medidores e dados do sinal */}
            <div className="cw-glass-cyan relative flex flex-col justify-between gap-3 p-4 lg:col-span-4">
              <Corners tone="cyan" />
              <p className="border-b border-cw-cyan/30 pb-2 text-center font-cyber text-xs tracking-widest text-cw-cyan uppercase">
                Módulo VU canais L/R
              </p>
              <div className="grid grid-cols-2 gap-3">
                <VuMeter label="L" channel="CH-01" on={playing} tone="magenta" />
                <VuMeter label="R" channel="CH-02" on={playing} tone="cyan" />
              </div>
              <dl className="grid grid-cols-3 gap-1 rounded border border-gray-800 bg-black/60 p-2 font-mono text-[11px]">
                <div className="min-w-0">
                  <dt className="text-gray-400">CODEC</dt>
                  <dd className="truncate text-cw-yellow">{current?.codec ?? "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-gray-400">BITRATE</dt>
                  <dd className="truncate text-cw-yellow">{current?.bitrate ? `${current.bitrate} kbps` : "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-gray-400">ORIGEM</dt>
                  <dd className="truncate text-cw-yellow">{current ? placeOf(current) : "—"}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Sintonizador FM */}
          <TabsPrimitive.Root
            value={band}
            onValueChange={(v) => setBand(v as BandId)}
            className="mt-6 rounded-lg border border-cw-yellow/30 bg-black/80 p-3 sm:p-4"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="flex items-center gap-1.5 font-mono text-xs text-cw-yellow">
                <CirclePlay className="size-3.5 text-cw-cyan" aria-hidden="true" />
                <span aria-hidden="true" className="text-cw-red">//</span> SINTONIZADOR FM (88.0 — 108.0 MHz)
              </p>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                <span className="text-cw-cyan">TOQUE NUMA ESTAÇÃO PARA SINTONIZAR</span>
                {hidden.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setHidden([])}
                    className={cn("rounded border border-gray-700 px-2 py-0.5 text-gray-300 hover:text-white", FOCUS)}
                  >
                    {hidden.length} {hidden.length === 1 ? "oculta" : "ocultas"} • Mostrar todas
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCheckOpen(true)}
                  className={cn("rounded border border-cw-cyan/50 px-2 py-0.5 text-cw-cyan hover:bg-cw-cyan/10", FOCUS)}
                >
                  Testar rádios neste aparelho
                </button>
              </div>
            </div>
            <TabsPrimitive.List
              aria-label="Faixa"
              className="mb-3 flex flex-wrap gap-1 rounded border border-cw-yellow/30 bg-black/60 p-1 font-mono text-xs"
            >
              {BANDS.map((b) => (
                <TabsPrimitive.Trigger
                  key={b.id}
                  value={b.id}
                  className={cn(
                    "rounded px-2.5 py-1 text-gray-300 transition-colors hover:text-white",
                    FOCUS,
                    "data-[state=active]:bg-cw-yellow data-[state=active]:font-bold data-[state=active]:text-black",
                  )}
                >
                  {b.name}
                  <span className="ml-1.5 opacity-80 tabular-nums">{bandStations(b.id).length}</span>
                </TabsPrimitive.Trigger>
              ))}
            </TabsPrimitive.List>
            {BANDS.map((b) => (
              <TabsPrimitive.Content key={b.id} value={b.id} className="outline-none">
                {b.id === "fora" && (
                  <p data-testid="aviso-fora" className="mb-2 rounded border border-cw-cyan/30 bg-cw-cyan/5 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-gray-300">
                    Estas rádios usam servidores que a rede da empresa (AVD) bloqueia: lá elas não tocam. No celular e em casa, tocam
                    normalmente. As outras abas só têm rádios da StreamTheWorld, que tocam na AVD.
                  </p>
                )}
                {isShelf(b.id) ? (
                  <WebShelf stations={bandStations(b.id)} currentId={currentId} onTune={tune} />
                ) : (
                  <TunerDial stations={bandStations(b.id)} currentId={currentId} onTune={tune} />
                )}
                <ExtrasNote count={bandStations(b.id).filter((s) => s.extra).length} band={b.id} updatedAt={extras.updatedAt} />
              </TabsPrimitive.Content>
            ))}
          </TabsPrimitive.Root>

          {/* Controles */}
          <div className="mt-6 grid grid-cols-1 items-center gap-4 md:grid-cols-12">
            <div className="rounded-lg border border-gray-800 bg-black/60 p-3 md:col-span-5">
              <p className="mb-2 flex justify-between font-mono text-[10px] tracking-wider text-gray-400 uppercase">
                <span>Memória de canais</span>
                <span className="text-cw-yellow">Presets P1–P6 (favoritas)</span>
              </p>
              <div className="grid grid-cols-6 gap-1.5">
                {presets.map((s, i) => {
                  const isCurrent = !!s && s.id === currentId;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!s}
                      onClick={() => s && tune(s)}
                      title={s ? s.name : "Favorite uma rádio (♥) para salvá-la aqui"}
                      aria-label={s ? `Preset ${i + 1}: ${s.name}` : `Preset ${i + 1} vazio`}
                      aria-current={isCurrent ? "true" : undefined}
                      className={cn(
                        "flex flex-col items-center rounded border py-1.5 font-mono text-xs transition",
                        FOCUS,
                        !s && "cursor-not-allowed border-gray-800 text-gray-500",
                        s && !isCurrent && "border-cw-yellow/40 text-cw-yellow hover:bg-cw-yellow/10",
                        isCurrent && "border-cw-yellow bg-cw-yellow font-bold text-black shadow-neon-yellow",
                      )}
                    >
                      <span>P{i + 1}</span>
                      <span className={cn("text-[9px]", isCurrent ? "text-black/80" : "text-gray-400")}>
                        {s ? (s.frequency ? fmtFreq(s.frequency) : "WEB") : "--"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 md:col-span-3">
              <button type="button" className={squareBtn} onClick={() => step(-1)} disabled={!current} aria-label="Estação anterior">
                <SkipBack className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                disabled={!current}
                aria-label={busy ? "Parar" : "Tocar"}
                className={cn(
                  "cw-cut-btn grid size-14 place-items-center bg-cw-yellow text-black transition hover:bg-yellow-200 disabled:opacity-40",
                  FOCUS,
                )}
              >
                {busy ? <Pause className="size-6 fill-current" aria-hidden="true" /> : <Play className="ml-0.5 size-6 fill-current" aria-hidden="true" />}
              </button>
              <button type="button" className={squareBtn} onClick={() => step(1)} disabled={!current} aria-label="Próxima estação">
                <SkipForward className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={toggleFav}
                disabled={!current}
                aria-pressed={isFav}
                aria-label="Favorita"
                className={cn(
                  squareBtn,
                  isFav && "border-cw-cyan/60 text-cw-cyan shadow-neon-cyan hover:bg-cw-cyan/10",
                )}
              >
                <Heart className={cn("size-5", isFav && "fill-current")} aria-hidden="true" />
              </button>
            </div>

            <div className="rounded-lg border border-gray-800 bg-black/60 p-3 md:col-span-4">
              <p className="mb-1.5 flex justify-between font-mono text-[10px] text-gray-400">
                <span>VOLUME MASTER</span>
                <span className="text-cw-yellow tabular-nums">{muted ? 0 : volume}%</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  aria-pressed={muted}
                  aria-label="Silenciar"
                  className={cn("grid size-8 shrink-0 place-items-center rounded text-cw-yellow hover:bg-cw-yellow/10", FOCUS)}
                >
                  {muted || volume === 0 ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
                </button>
                <SliderPrimitive.Root
                  className="relative flex h-5 w-full touch-none items-center select-none"
                  value={[muted ? 0 : volume]}
                  max={100}
                  step={1}
                  onValueChange={([v]) => {
                    setVolume(v ?? 0);
                    setMuted((v ?? 0) === 0);
                  }}
                >
                  <SliderPrimitive.Track className="relative h-1 grow overflow-hidden bg-gray-800">
                    <SliderPrimitive.Range className="absolute h-full bg-linear-to-r from-cw-yellow to-cw-cyan" />
                  </SliderPrimitive.Track>
                  <SliderPrimitive.Thumb
                    aria-label="Volume"
                    className={cn("block size-3.5 rotate-45 bg-cw-yellow shadow-[0_0_10px_#fcee0a]", FOCUS)}
                  />
                </SliderPrimitive.Root>
              </div>
            </div>
          </div>

          {status === "error" && current && (
            <div
              role="alert"
              className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-cw-red/60 bg-cw-red/10 px-3 py-2 font-mono text-sm text-red-100"
            >
              <span>Não foi possível conectar a esta rádio.</span>
              <button
                type="button"
                onClick={() => tune(current)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded border border-cw-yellow/50 px-2.5 py-1 text-xs text-cw-yellow hover:bg-cw-yellow/10",
                  FOCUS,
                )}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" /> Tentar de novo
              </button>
            </div>
          )}
        </section>

        <NowPlayingPanel station={current} active={busy} />

        <MusicLibrary />

        <PodcastLibrary />

        <PodcastLibrary kind="audiolivros" />

        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-12">
          <section aria-labelledby="minhas-title" className="cw-glass relative flex flex-col gap-3 p-4 md:col-span-8">
            <Corners />
            <h2 id="minhas-title" className="flex items-center gap-2 font-mono text-xs font-bold tracking-wider text-cw-yellow uppercase">
              Minhas rádios
              <span className="rounded border border-cw-yellow/40 bg-cw-yellow/10 px-2 py-0.5 text-[10px] text-yellow-100 tabular-nums">
                {minhas.length}
              </span>
            </h2>
            {minhas.length === 0 ? (
              <EmptyState
                icon={ListMusic}
                title="Nenhuma rádio adicionada. As que você adicionar ficam salvas neste navegador."
                className="flex-1 rounded border border-dashed border-cw-yellow/30 px-4 py-10"
              />
            ) : (
              <MinhasGrid stations={minhas} currentId={currentId} busy={busy} onTune={tune} onRemove={removeCustom} />
            )}
          </section>
          <AddStationForm onAdd={addCustom} />
        </div>

        <section aria-labelledby="fav-title" className="cw-glass relative flex flex-col gap-3 p-4">
          <Corners tone="cyan" />
          <h2 id="fav-title" className="flex items-center gap-2 font-mono text-xs font-bold tracking-wider text-cw-cyan uppercase">
            Favoritas
            <span className="rounded border border-cw-cyan/40 bg-cw-cyan/10 px-2 py-0.5 text-[10px] text-cyan-100 tabular-nums">
              {favStations.length}
            </span>
          </h2>
          {favStations.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="Nenhuma rádio favorita. Toque no ♥ do player para salvar a rádio aqui e nos presets."
              className="rounded border border-dashed border-cw-cyan/30 px-4 py-10"
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {favStations.map((s, i) => {
                const isCurrent = s.id === currentId;
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => tune(s)} aria-current={isCurrent ? "true" : undefined} className={cardClass(isCurrent)}>
                      <span
                        aria-hidden="true"
                        className="grid size-7 shrink-0 place-items-center rounded border border-cw-cyan/50 font-mono text-sm text-cw-cyan"
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{s.name}</span>
                        <span className="block truncate font-mono text-xs text-gray-400">
                          {s.frequency ? `${fmtFreq(s.frequency)} FM · ` : ""}
                          {placeOf(s)}
                        </span>
                      </span>
                      {isCurrent && busy && <span className="font-mono text-xs font-bold text-cw-yellow">NO AR</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <StationCheckDialog
          open={checkOpen}
          onOpenChange={setCheckOpen}
          stations={catalog}
          hidden={hidden}
          onHide={(ids) => setHidden(ids)}
          busy={status === "playing" || status === "loading"}
        />

        <CommandDialog open={searchOpen} onOpenChange={setSearchOpen} title="Buscar rádio" description="Busque por nome, cidade, gênero ou frequência">
          <CommandInput placeholder="Nome, cidade, gênero ou frequência" />
          <CommandList className="cw-scrollbar">
            <CommandEmpty>Nenhuma rádio encontrada.</CommandEmpty>
            {[...BANDS, { id: "minhas" as const, name: "Minhas rádios" }].map((b) => {
              const list = b.id === "minhas" ? minhas.filter((s) => !!s.streamUrl) : bandStations(b.id);
              if (!list.length) return null;
              return (
                <CommandGroup key={b.id} heading={b.name}>
                  {list.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={`${s.name} ${placeOf(s)} ${s.genre} ${s.frequency ? fmtFreq(s.frequency) : "web"} ${s.id}`}
                      onSelect={() => {
                        setSearchOpen(false);
                        tune(s);
                      }}
                    >
                      <StationTile station={s} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{s.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{s.genre}</span>
                      </span>
                      <span className="font-mono text-sm text-cw-yellow tabular-nums">{s.frequency ? `${fmtFreq(s.frequency)} FM` : "Web"}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </CommandDialog>
      </main>
    </>
  );
}
