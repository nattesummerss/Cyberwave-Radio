import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Slider as SliderPrimitive, Tabs as TabsPrimitive } from "radix-ui";
import {
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
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NowPlayingPanel } from "@/components/now-playing";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import {
  BAND_MAX,
  BAND_MIN,
  CITIES,
  mp3StreamUrl,
  STATIONS,
  type BandId,
  type CityId,
  type Station,
} from "@/data/stations";

type PlayStatus = "idle" | "loading" | "playing" | "paused" | "error";

const STATUS_TONE: Record<PlayStatus, { label: string; dot: string; text: string; ring: string }> = {
  playing: { label: "Ao vivo", dot: "bg-emerald-400", text: "text-emerald-300", ring: "ring-emerald-400/40" },
  loading: { label: "Conectando", dot: "bg-amber-400", text: "text-amber-300", ring: "ring-amber-400/40" },
  error: { label: "Sem sinal", dot: "bg-red-400", text: "text-red-300", ring: "ring-red-400/40" },
  paused: { label: "Parado", dot: "bg-zinc-400", text: "text-zinc-300", ring: "ring-zinc-500/40" },
  idle: { label: "Parado", dot: "bg-zinc-400", text: "text-zinc-300", ring: "ring-zinc-500/40" },
};

const GENRE_TILE: Record<string, string> = {
  Pop: "bg-fuchsia-700",
  Rock: "bg-red-700",
  MPB: "bg-emerald-700",
  Notícias: "bg-sky-700",
  Adulto: "bg-indigo-700",
  Sertanejo: "bg-amber-700",
  Pagode: "bg-orange-700",
  Jazz: "bg-violet-700",
  Reggae: "bg-green-700",
  Forró: "bg-yellow-700",
  Cultura: "bg-teal-700",
  "Classic rock": "bg-orange-800",
  "Hard rock": "bg-red-800",
  Metal: "bg-neutral-700",
  Alternativo: "bg-rose-700",
  "Rock em espanhol": "bg-amber-800",
  "Pop rock": "bg-pink-800",
};

const DEFAULT_STATION_ID = "sp-alpha";
const BANDS: { id: BandId; name: string }[] = [
  ...CITIES,
  { id: "web", name: "Web e outras cidades" },
  { id: "intl", name: "Internacionais" },
  { id: "rock", name: "Rock internacional" },
];
const CITY_NAME: Record<CityId, string> = { sp: "São Paulo", rj: "Rio de Janeiro", bh: "Belo Horizonte" };

const fmtFreq = (f: number) => f.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const bandOf = (s: Station): BandId => s.city ?? (s.rock ? "rock" : s.intl ? "intl" : "web");
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
    <div className="overflow-x-auto pb-1">
      <div className="relative mx-auto h-[182px] min-w-[760px] px-6">
        <div className="relative h-full">
          {stations.map((s) => {
            const lane = lanes[s.id] ?? 0;
            const isCurrent = s.id === currentId;
            const top = 6 + lane * LANE_H;
            return (
              <div key={s.id}>
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute w-px -translate-x-1/2",
                    isCurrent ? "bg-amber-300" : "bg-zinc-600",
                  )}
                  style={{ left: `${pct(s.frequency ?? BAND_MIN)}%`, top: top + 26, height: SCALE_TOP - top - 26 }}
                />
                <button
                  type="button"
                  onClick={() => onTune(s)}
                  aria-current={isCurrent ? "true" : undefined}
                  aria-label={`${s.name}, ${fmtFreq(s.frequency ?? 0)} FM`}
                  className={cn(
                    "dial-marker absolute -translate-x-1/2 rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300",
                    isCurrent
                      ? "bg-amber-300 text-zinc-950"
                      : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
                  )}
                  style={{ left: `${pct(s.frequency ?? BAND_MIN)}%`, top }}
                >
                  {s.shortName}
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
            <line x1="0" x2="1000" y1="1" y2="1" className="stroke-zinc-600" vectorEffect="non-scaling-stroke" />
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
                  className={major ? "stroke-zinc-300" : "stroke-zinc-500"}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
          {TICKS.filter((f) => Number.isInteger(f) && f % 2 === 0).map((f) => (
            <span
              key={f}
              aria-hidden="true"
              className="absolute -translate-x-1/2 font-mono text-xs text-zinc-300 tabular-nums"
              style={{ left: `${pct(f)}%`, top: SCALE_TOP + 26 }}
            >
              {f}
            </span>
          ))}

          {current?.frequency && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute w-0.5 -translate-x-1/2 rounded-full bg-red-500 shadow-[0_0_12px_2px_rgba(239,68,68,0.6)] transition-[left] duration-500 ease-out"
              style={{ left: `${pct(current.frequency)}%`, top: SCALE_TOP - 10, height: 42 }}
            />
          )}
          <span aria-hidden="true" className="absolute right-0 font-mono text-xs text-zinc-300" style={{ top: SCALE_TOP + 46 }}>
            MHz
          </span>
        </div>
      </div>
    </div>
  );
}

function StationTile({ station, size = "md" }: { station: Station; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-lg font-semibold text-white",
        GENRE_TILE[station.genre] ?? "bg-zinc-700",
        size === "lg" ? "size-14 text-lg" : "size-10 text-sm",
      )}
    >
      {initials(station.name) || "R"}
    </span>
  );
}

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
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {stations.map((s) => {
        const isCurrent = s.id === currentId;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onTune(s)}
              aria-current={isCurrent ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300",
                isCurrent ? "bg-zinc-800 ring-2 ring-amber-300" : "bg-zinc-900 hover:bg-zinc-800",
              )}
            >
              <StationTile station={s} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-zinc-50">{s.name}</span>
                <span className="block truncate text-xs text-zinc-300">
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
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {stations.map((s) => {
        const isCurrent = s.id === currentId;
        const playable = !!s.streamUrl;
        return (
          <li key={s.id} className="relative">
            <button
              type="button"
              onClick={() => onTune(s)}
              disabled={!playable}
              aria-current={isCurrent ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border bg-card p-2.5 pr-12 text-left transition-colors hover:bg-accent",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed",
                isCurrent && "border-primary ring-1 ring-primary",
              )}
            >
              <StationTile station={s} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{s.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {playable ? s.genre : "Endereço de stream inválido"}
                </span>
              </span>
              {isCurrent && busy && <span className="text-xs font-semibold text-primary">No ar</span>}
            </button>
            <button
              type="button"
              onClick={() => onRemove(s)}
              aria-label={`Remover ${s.name}`}
              className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function AddStationDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (input: { name: string; streamUrl: string; genre: string }) => void;
}) {
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({});

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
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
    if (next.name || next.url || !parsed) return;
    onAdd({ name, streamUrl: parsed, genre });
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setErrors({});
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar rádio</DialogTitle>
          <DialogDescription>
            Endereço direto do stream de áudio (MP3 ou AAC). A rádio fica salva só neste navegador.
          </DialogDescription>
        </DialogHeader>
        <form id="add-station" className="grid gap-4" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="st-name">Nome</Label>
            <Input id="st-name" name="name" autoComplete="off" maxLength={120} aria-invalid={!!errors.name} aria-describedby={errors.name ? "st-name-err" : undefined} />
            {errors.name && <p id="st-name-err" className="text-sm text-destructive">{errors.name}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="st-url">Endereço do stream</Label>
            <Input id="st-url" name="url" type="url" inputMode="url" placeholder="https://" autoComplete="off" maxLength={250} aria-invalid={!!errors.url} aria-describedby={errors.url ? "st-url-err" : undefined} />
            {errors.url && <p id="st-url-err" className="text-sm text-destructive">{errors.url}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="st-genre">Gênero</Label>
            <Input id="st-genre" name="genre" autoComplete="off" maxLength={60} placeholder="Variedades" />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="add-station">
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HomePage() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const stoppingRef = useRef(false);
  const confirm = useConfirm();

  const [saved, setSaved] = usePersistentState<MinhaRadio[]>(MINHAS_STORAGE_KEY, []);
  const [favorites, setFavorites] = usePersistentState<string[]>("radio.favoritas", []);
  const [volume, setVolume] = usePersistentState<number>("radio.volume", 80);
  const [currentId, setCurrentId] = usePersistentState<string | null>("radio.ultima", DEFAULT_STATION_ID);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<PlayStatus>("idle");
  /** Rádio que está sendo sintonizada e se a versão MP3 de reserva já foi tentada. */
  const tuningRef = useRef<Station | null>(null);
  const triedMp3Ref = useRef(false);
  /** Cada tentativa de tocar ganha um número; respostas de tentativas antigas são ignoradas. */
  const attemptRef = useRef(0);

  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const minhas = useMemo(() => toStations(saved), [saved]);
  const all = useMemo(() => [...STATIONS, ...minhas], [minhas]);
  // Uma rádio que saiu do catálogo (ou foi removida) volta para a padrão.
  const current = all.find((s) => s.id === currentId) ?? STATIONS.find((s) => s.id === DEFAULT_STATION_ID) ?? null;
  const [band, setBand] = useState<BandId>(() => (current?.custom ? "web" : current ? bandOf(current) : "sp"));

  const bandStations = useCallback(
    (b: BandId) =>
      b === "web" || b === "intl" || b === "rock"
        ? STATIONS.filter((s) => bandOf(s) === b)
        : STATIONS.filter((s) => s.city === b).sort((x, y) => (x.frequency ?? 0) - (y.frequency ?? 0)),
    [],
  );

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = volume / 100;
    a.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    if (!current || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.name,
      artist: current.frequency ? `${fmtFreq(current.frequency)} FM · ${placeOf(current)}` : placeOf(current),
      album: "Radio Ao vivo AVD",
    });
  }, [current]);

  const playUrl = useCallback((url: string) => {
    const a = audioRef.current;
    if (!a) return;
    const attempt = ++attemptRef.current;
    a.src = url;
    setStatus("loading");
    a.play().catch((err: unknown) => {
      if (attempt !== attemptRef.current) return;
      // Troca de rádio no meio do carregamento, ou formato não suportado (tratado no onError do áudio).
      if (err instanceof DOMException && (err.name === "AbortError" || err.name === "NotSupportedError")) return;
      setStatus("error");
    });
  }, []);

  /** Se a versão principal (AAC) não tocar, tenta uma vez a versão MP3 da mesma rádio. */
  const tryMp3 = useCallback((): boolean => {
    const s = tuningRef.current;
    if (!s || triedMp3Ref.current) return false;
    const alt = mp3StreamUrl(s);
    if (!alt || alt === s.streamUrl) return false;
    triedMp3Ref.current = true;
    playUrl(alt);
    return true;
  }, [playUrl]);

  const stop = useCallback(() => {
    attemptRef.current++;
    const a = audioRef.current;
    if (!a) {
      setStatus("paused");
      return;
    }
    stoppingRef.current = true;
    a.pause();
    a.removeAttribute("src");
    a.load();
    stoppingRef.current = false;
    setStatus("paused");
  }, []);

  const tune = useCallback(
    (s: Station) => {
      setCurrentId(s.id);
      if (!s.custom) setBand(bandOf(s));
      tuningRef.current = s;
      triedMp3Ref.current = false;
      if (!s.streamUrl) {
        stop();
        setStatus("error");
        return;
      }
      playUrl(s.streamUrl);
    },
    [setCurrentId, playUrl, stop],
  );

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
  const tone = STATUS_TONE[status];
  const playing = status === "playing";
  const busy = status === "playing" || status === "loading";

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-6 px-4 py-5 md:px-6">
      <audio
        ref={audioRef}
        preload="none"
        onPlaying={() => setStatus("playing")}
        onWaiting={() => setStatus((s) => (s === "playing" ? "loading" : s))}
        onError={() => {
          const el = audioRef.current;
          // Sem erro registrado: o áudio já mudou para outra tentativa.
          if (stoppingRef.current || !el?.getAttribute("src") || !el.error) return;
          if (tryMp3()) return;
          console.error("audio playback failed", {
            mediaErrorCode: el?.error?.code,
            detail: el?.error?.message?.slice(0, 160) || "",
            codec: current?.codec ?? "desconhecido",
            station: current && !current.custom ? current.id : "minha-radio",
            canPlayAac: el?.canPlayType("audio/aac") || "no",
            canPlayMp3: el?.canPlayType("audio/mpeg") || "no",
          });
          setStatus("error");
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Rádios ao vivo <span className="ml-1 text-base font-normal text-muted-foreground">{all.length} estações</span>
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSearchOpen(true)}>
            <Search aria-hidden="true" /> Buscar rádio
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus aria-hidden="true" /> Adicionar rádio
          </Button>
        </div>
      </div>

      <section
        id="sintonizador"
        tabIndex={-1}
        aria-labelledby="tuner-title"
        className="tuner-glass overflow-hidden rounded-3xl bg-zinc-950 text-zinc-100 shadow-xl ring-1 ring-zinc-800 outline-none"
      >
        <h2 id="tuner-title" className="sr-only">Sintonizador</h2>

        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-zinc-800 bg-[radial-gradient(ellipse_at_top_left,rgba(251,191,36,0.10),transparent_60%)] p-5 md:p-7">
          <div className="flex min-w-0 items-center gap-4">
            {current && <StationTile station={current} size="lg" />}
            <div className="min-w-0">
              <p className={cn("inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1", tone.text, tone.ring)} role="status">
                <span className={cn("size-2 rounded-full", tone.dot, playing && "motion-safe:animate-pulse")} aria-hidden="true" />
                {tone.label}
              </p>
              <p className="mt-1 truncate font-serif text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">
                {current?.name ?? "Nenhuma rádio sintonizada"}
              </p>
              {current && (
                <p className="truncate text-sm text-zinc-300">
                  {placeOf(current)} · {current.genre}
                  {current.codec ? ` · ${current.codec}` : ""}
                  {current.bitrate ? ` ${current.bitrate} kbps` : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-end gap-4">
            <div className="flex h-10 items-end gap-1" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={cn("w-1.5 rounded-sm bg-amber-300", playing ? "eq-bar h-10" : "h-2 opacity-60")}
                  style={{ animationDelay: `${i * -0.17}s`, animationDuration: `${0.8 + (i % 3) * 0.2}s` }}
                />
              ))}
            </div>
            <p className="text-right font-mono leading-none text-amber-300 tabular-nums">
              <span className="text-5xl md:text-6xl">{current?.frequency ? fmtFreq(current.frequency) : "WEB"}</span>
              <span className="ml-1 text-sm text-zinc-300">{current?.frequency ? "FM" : ""}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-5 py-4 md:px-7">
          <Button variant="ghost" size="icon" className="text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => step(-1)} disabled={!current} aria-label="Estação anterior">
            <SkipBack aria-hidden="true" />
          </Button>
          <Button
            size="icon"
            className="size-14 rounded-full [&_svg:not([class*='size-'])]:size-6"
            onClick={togglePlay}
            disabled={!current}
            aria-label={busy ? "Parar" : "Tocar"}
          >
            {busy ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </Button>
          <Button variant="ghost" size="icon" className="text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => step(1)} disabled={!current} aria-label="Próxima estação">
            <SkipForward aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("hover:bg-zinc-800", isFav ? "text-rose-400 hover:text-rose-300" : "text-zinc-100 hover:text-zinc-50")}
            onClick={toggleFav}
            disabled={!current}
            aria-pressed={isFav}
            aria-label="Favorita"
          >
            <Heart aria-hidden="true" className={cn(isFav && "fill-current")} />
          </Button>

          {status === "error" && current && (
            <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-red-300">
              <span>Não foi possível conectar a esta rádio.</span>
              <Button size="sm" variant="ghost" className="text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => tune(current)}>
                <RotateCcw aria-hidden="true" /> Tentar de novo
              </Button>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50"
              onClick={() => setMuted((m) => !m)}
              aria-pressed={muted}
              aria-label="Silenciar"
            >
              {muted || volume === 0 ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            </Button>
            <SliderPrimitive.Root
              className="relative flex w-32 touch-none items-center select-none"
              value={[muted ? 0 : volume]}
              max={100}
              step={1}
              onValueChange={([v]) => {
                setVolume(v ?? 0);
                setMuted((v ?? 0) === 0);
              }}
            >
              <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-zinc-700">
                <SliderPrimitive.Range className="absolute h-full bg-amber-300" />
              </SliderPrimitive.Track>
              <SliderPrimitive.Thumb
                aria-label="Volume"
                className="block size-4 rounded-full bg-zinc-50 shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
              />
            </SliderPrimitive.Root>
          </div>
        </div>

        <NowPlayingPanel station={current} active={busy} />

        <TabsPrimitive.Root value={band} onValueChange={(v) => setBand(v as BandId)} className="border-t border-zinc-800 px-5 pt-4 pb-5 md:px-7">
          <TabsPrimitive.List aria-label="Faixa" className="mb-4 flex flex-wrap gap-1 rounded-xl bg-zinc-900 p-1">
            {BANDS.map((b) => (
              <TabsPrimitive.Trigger
                key={b.id}
                value={b.id}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:text-zinc-50",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300",
                  "data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950",
                )}
              >
                {b.name}
                <span className="ml-1.5 text-xs opacity-80 tabular-nums">{bandStations(b.id).length}</span>
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
          {BANDS.map((b) => (
            <TabsPrimitive.Content key={b.id} value={b.id} className="outline-none">
              {b.id === "web" || b.id === "intl" || b.id === "rock" ? (
                <WebShelf stations={bandStations(b.id)} currentId={currentId} onTune={tune} />
              ) : (
                <TunerDial stations={bandStations(b.id)} currentId={currentId} onTune={tune} />
              )}
            </TabsPrimitive.Content>
          ))}
        </TabsPrimitive.Root>
      </section>

      <section aria-labelledby="minhas-title" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="minhas-title" className="text-lg font-semibold">
            Minhas rádios{" "}
            <span className="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{minhas.length}</span>
          </h2>
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus aria-hidden="true" /> Adicionar
          </Button>
        </div>
        {minhas.length === 0 ? (
          <EmptyState
            icon={ListMusic}
            title="Nenhuma rádio adicionada. As que você adicionar ficam salvas neste navegador."
            className="rounded-2xl border border-dashed px-4 py-10"
          />
        ) : (
          <MinhasGrid stations={minhas} currentId={currentId} busy={busy} onTune={tune} onRemove={removeCustom} />
        )}
      </section>

      <section aria-labelledby="fav-title" className="flex flex-col gap-3">
        <h2 id="fav-title" className="text-lg font-semibold">
          Favoritas <span className="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{favStations.length}</span>
        </h2>
        {favStations.length === 0 ? (
          <EmptyState icon={Heart} title="Nenhuma rádio favorita" className="rounded-2xl border border-dashed py-10" />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {favStations.map((s, i) => {
              const isCurrent = s.id === currentId;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => tune(s)}
                    aria-current={isCurrent ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      isCurrent && "border-primary ring-1 ring-primary",
                    )}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted font-mono text-sm font-semibold" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{s.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.frequency ? `${fmtFreq(s.frequency)} FM · ` : ""}
                        {placeOf(s)}
                      </span>
                    </span>
                    {isCurrent && busy && <span className="text-xs font-semibold text-primary">No ar</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen} title="Buscar rádio" description="Busque por nome, cidade, gênero ou frequência">
        <CommandInput placeholder="Nome, cidade, gênero ou frequência" />
        <CommandList>
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
                    <span className="font-mono text-sm tabular-nums">{s.frequency ? `${fmtFreq(s.frequency)} FM` : "Web"}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>

      <AddStationDialog open={addOpen} onOpenChange={setAddOpen} onAdd={addCustom} />
    </div>
  );
}
