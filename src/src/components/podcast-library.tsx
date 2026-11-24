// Seção "Podcasts" (v30): podcasts famosos em abas (Notícias, Humor e entrevistas, Ciência e tecnologia,
// Histórias e crimes, Esportes) + busca livre no catálogo do Apple Podcasts. Toca os episódios no próprio site,
// lembra onde cada um parou e testa quais servidores de áudio tocam neste aparelho (rede da empresa/AVD).
// v31: o mesmo componente monta a seção "Audiolivros" (kind="audiolivros"): abas Em português / Outros idiomas,
// capítulos em ordem de leitura, passa sozinho para o próximo capítulo e atalhos para os serviços pagos.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDownUp, BookHeadphones, CircleCheck, CircleX, Copy, ExternalLink, Loader2, Pause, Play, Podcast, RotateCcw, RotateCw, Search, Stethoscope } from "lucide-react";
import { Corners } from "@/components/cyber";
import { cn } from "@/lib/utils";
import { AUDIOBOOK_TABS, PAID_AUDIOBOOKS, PODCAST_TABS, type PodcastTab } from "@/data/podcasts";
import { SITE_VERSION } from "@/lib/version";
import {
  cachedPodcasts,
  episodeStatus,
  episodesOf,
  formatClock,
  formatDur,
  hostOf,
  hostStatuses,
  loadPodcasts,
  readingOrder,
  savePosition,
  savedPosition,
  searchShows,
  setHostStatus,
  urlsOf,
  ANCHOR_AUDIO_HOST,
  type Episode,
  type PodcastData,
  type Show,
  type ShowHit,
} from "@/lib/podcasts";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cw-yellow";
const SPEEDS = [1, 1.25, 1.5, 2];
const fire = (name: string, detail?: Record<string, unknown>) => document.dispatchEvent(new CustomEvent(name, { detail }));
type TabId = PodcastTab | "buscar" | "pagos";

interface Now {
  show: Pick<Show, "name" | "art" | "link">;
  ep: Episode;
  urlIndex: number;
  /** Lista na ordem mostrada (audiolivro: para seguir para o próximo capítulo). */
  list?: Episode[];
}

const LANG_LABEL = { pt: "Em português", en: "Em inglês", es: "Em espanhol" } as const;
const newestFirst = (eps: Episode[]) => [...eps].sort((a, b) => b.date.localeCompare(a.date));

interface TestRow {
  show: string;
  host: string;
  ok: boolean;
  why?: string;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
};

/** Tenta carregar o começo de um áudio (sem tocar). */
function probeAudio(url: string, ms = 10000): Promise<{ ok: boolean; why?: string }> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    a.muted = true;
    const end = (r: { ok: boolean; why?: string }) => {
      window.clearTimeout(t);
      a.removeAttribute("src");
      a.load();
      resolve(r);
    };
    const t = window.setTimeout(() => end({ ok: false, why: "sem resposta em 10 s" }), ms);
    a.onloadedmetadata = () => end({ ok: true });
    a.onerror = () => end({ ok: false, why: "bloqueado ou fora do ar" });
    a.src = url;
  });
}

export function PodcastLibrary({ kind = "podcasts" }: { kind?: "podcasts" | "audiolivros" }) {
  const BOOKS = kind === "audiolivros";
  const TABS = BOOKS ? AUDIOBOOK_TABS : PODCAST_TABS;
  const T = BOOKS
    ? { id: "audiolivros", tid: "audiolivro", title: "Audiolivros", plural: "audiolivros", one: "audiolivro", unit: "capítulo", search: "Buscar audiolivro", placeholder: "Livro ou autor (ex.: Machado de Assis audiolivro)" }
    : { id: "podcasts", tid: "podcast", title: "Podcasts", plural: "podcasts", one: "podcast", unit: "episódio", search: "Buscar podcast", placeholder: "Nome do podcast (ex.: Café com ADM)" };
  const [data, setData] = useState<PodcastData | null>(() => cachedPodcasts());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>(TABS[0].id);
  const [openShow, setOpenShow] = useState<Show | null>(null);
  const [asc, setAsc] = useState(false);
  const [hits, setHits] = useState<ShowHit[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<Now | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [hosts, setHosts] = useState(() => hostStatuses());
  const [test, setTest] = useState<{ running: boolean; rows: TestRow[]; total: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const selfFire = useRef(false);
  const lastSave = useRef(0);

  useEffect(() => {
    let alive = true;
    loadPodcasts((partial) => alive && setData(partial))
      .then((d) => alive && d && setData(d))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  // Rádio ou música começou: o podcast para.
  useEffect(() => {
    const onOther = () => {
      if (!selfFire.current) pause();
    };
    document.addEventListener("cw:radio-play", onOther);
    document.addEventListener("cw:music-play", onOther);
    return () => {
      document.removeEventListener("cw:radio-play", onOther);
      document.removeEventListener("cw:music-play", onOther);
    };
  }, [pause]);

  // A ANDRA-18 abaixa o podcast quando fala.
  useEffect(() => {
    const on = () => audioRef.current && (audioRef.current.volume = 0.3);
    const off = () => audioRef.current && (audioRef.current.volume = 1);
    document.addEventListener("cw:speak", on);
    document.addEventListener("cw:speakend", off);
    return () => {
      document.removeEventListener("cw:speak", on);
      document.removeEventListener("cw:speakend", off);
    };
  }, []);

  const announce = (show: Now["show"], ep: Episode) => {
    selfFire.current = true;
    fire("cw:music-play", { title: ep.title, artist: show.name });
    fire("cw:podcast-play", { title: ep.title, show: show.name });
    selfFire.current = false;
  };

  const startUrl = useCallback(async (n: Now, resumeAt: number) => {
    const a = audioRef.current;
    if (!a) return;
    const url = urlsOf(n.ep)[n.urlIndex];
    setError(null);
    a.src = url;
    a.playbackRate = speed;
    a.load();
    if (resumeAt > 0) {
      const seek = () => {
        a.currentTime = resumeAt;
        a.removeEventListener("loadedmetadata", seek);
      };
      a.addEventListener("loadedmetadata", seek);
    }
    try {
      await a.play();
    } catch (e) {
      if ((e as Error)?.name === "NotAllowedError") setError("Toque em ▶ para começar.");
    }
  }, [speed]);

  const playEpisode = (show: Now["show"], ep: Episode, list?: Episode[]) => {
    if (now?.ep.id === ep.id && audioRef.current?.src) {
      if (playing) pause();
      else {
        announce(show, ep);
        void audioRef.current.play().catch(() => undefined);
      }
      return;
    }
    const n: Now = { show, ep, urlIndex: 0, list };
    setNow(n);
    setTime(0);
    setDur(ep.dur);
    announce(show, ep);
    void startUrl(n, savedPosition(ep.id));
  };

  const onAudioError = () => {
    if (!now) return;
    const urls = urlsOf(now.ep);
    const failed = urls[now.urlIndex];
    setHostStatus(failed, "falhou");
    setHosts(hostStatuses());
    if (now.urlIndex + 1 < urls.length) {
      const n = { ...now, urlIndex: now.urlIndex + 1 };
      setNow(n);
      void startUrl(n, audioRef.current?.currentTime || savedPosition(now.ep.id));
      return;
    }
    setPlaying(false);
    setError(`Este ${T.unit} não tocou aqui: o servidor ${hostOf(failed)} não respondeu (em rede de empresa/AVD costuma ser bloqueio). Tente outro ${T.one} ou ouça no Apple Podcasts.`);
  };

  const onPlaying = () => {
    setPlaying(true);
    setError(null);
    if (now) {
      const u = urlsOf(now.ep)[now.urlIndex];
      if (hosts[hostOf(u)]?.s !== "ok") {
        setHostStatus(u, "ok");
        setHosts(hostStatuses());
      }
    }
  };

  const onTime = () => {
    const a = audioRef.current;
    if (!a) return;
    setTime(a.currentTime);
    if (isFinite(a.duration) && a.duration > 0) setDur(a.duration);
    if (now && Date.now() - lastSave.current > 5000) {
      lastSave.current = Date.now();
      savePosition(now.ep.id, a.currentTime, a.duration || now.ep.dur);
    }
  };

  const skip = (delta: number) => {
    const a = audioRef.current;
    if (a) a.currentTime = Math.max(0, Math.min((a.duration || Infinity) - 1, a.currentTime + delta));
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setOpenShow(null);
    try {
      setHits(await searchShows(q));
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  };

  const openHit = async (h: ShowHit) => {
    setBusy(true);
    try {
      const episodes = await episodesOf(h.collectionId, "BR", 20, BOOKS);
      openTheShow({ id: `busca-${h.collectionId}`, name: h.name, tab: TABS[0].id, lang: "pt", book: BOOKS, artist: h.artist, art: h.art, link: h.link, episodes });
    } catch {
      openTheShow({ id: `busca-${h.collectionId}`, name: h.name, tab: TABS[0].id, lang: "pt", book: BOOKS, artist: h.artist, art: h.art, link: h.link, episodes: [] });
    } finally {
      setBusy(false);
    }
  };

  const openTheShow = (s: Show) => {
    setAsc(!!s.book);
    setOpenShow(s);
  };
  const shownEpisodes = useMemo(() => (openShow ? (asc ? readingOrder(openShow.episodes) : newestFirst(openShow.episodes)) : []), [openShow, asc]);
  const myShows = useMemo(() => (data?.shows ?? []).filter((s) => TABS.some((t) => t.id === s.tab)), [data, TABS]);
  const shows = useMemo(() => myShows.filter((s) => s.tab === tab), [myShows, tab]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of myShows) c[s.tab] = (c[s.tab] ?? 0) + 1;
    return c;
  }, [myShows]);
  // Podcasts que já tocaram neste aparelho primeiro; os que falharam por último.
  const ordered = useMemo(() => {
    const rank = (s: Show) => {
      const st = s.episodes[0] ? episodeStatus(s.episodes[0], hosts) : null;
      return st === "ok" ? 0 : st === "falhou" ? 2 : 1;
    };
    return [...shows].sort((a, b) => rank(a) - rank(b));
  }, [shows, hosts]);

  const runTest = async () => {
    const list = myShows;
    if (!list.length) {
      setTest({ running: false, rows: [{ show: `Lista de ${T.plural}`, host: "-", ok: false, why: loading ? "ainda carregando; tente de novo em alguns segundos" : "o catálogo do Apple Podcasts não respondeu" }], total: 1 });
      return;
    }
    setTest({ running: true, rows: [], total: list.length });
    const rows: TestRow[] = [];
    const queue = [...list];
    const worker = async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        const ep = s.episodes[0];
        if (!ep) {
          rows.push({ show: s.name, host: "-", ok: false, why: `sem ${T.unit}s no catálogo` });
          setTest({ running: true, rows: [...rows], total: list.length });
          continue;
        }
        let row: TestRow = { show: s.name, host: hostOf(ep.url), ok: false, why: "sem episódio" };
        for (const u of urlsOf(ep)) {
          const r = await probeAudio(u);
          setHostStatus(u, r.ok ? "ok" : "falhou");
          row = { show: s.name, host: hostOf(u), ok: r.ok, why: r.why };
          if (r.ok) break;
        }
        rows.push(row);
        setTest({ running: true, rows: [...rows], total: list.length });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setHosts(hostStatuses());
    setTest({ running: false, rows, total: list.length });
  };

  const report = () => {
    if (!test) return "";
    const ok = test.rows.filter((r) => r.ok).length;
    const lines = [
      `Cyberwave Radio ${SITE_VERSION} — teste de ${T.plural} neste aparelho (${new Date().toLocaleString("pt-BR")})`,
      `Navegador: ${navigator.userAgent}`,
      `Lista: ${data?.origin === "github" ? "podcasts.json do site" : "catálogo do Apple Podcasts"}`,
      `Resultado: ${ok} de ${test.rows.length} ${T.plural} tocaram`,
      ...test.rows.map((r) => `${r.ok ? "OK    " : "FALHOU"} ${r.show} — ${r.host}${r.ok ? "" : ` (${r.why})`}`),
    ];
    return lines.join("\n");
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* sem permissão */
    }
  };

  const tabBtn = (id: TabId, label: string, count?: number) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => {
        setTab(id);
        setOpenShow(null);
      }}
      className={cn(
        "rounded border px-3 py-1.5 font-mono text-xs transition-colors",
        tab === id ? "border-cw-yellow bg-cw-yellow text-black" : "border-cw-yellow/30 text-cw-yellow hover:bg-yellow-950/50",
        FOCUS,
      )}
    >
      {label}
      {count ? <span className="ml-1.5 opacity-70">{count}</span> : null}
    </button>
  );

  const statusBadge = (ep: Episode | undefined) => {
    const st = ep ? episodeStatus(ep, hosts) : null;
    if (st === "ok") return <span className="rounded border border-emerald-400/50 px-1.5 text-[10px] text-emerald-300">toca aqui</span>;
    if (st === "falhou") return <span className="rounded border border-red-400/50 px-1.5 text-[10px] text-red-300" data-testid={`${T.tid}-falhou`}>não tocou nesta rede</span>;
    return null;
  };

  const testOk = test ? test.rows.filter((r) => r.ok).length : 0;

  return (
    <section id={T.id} tabIndex={-1} aria-labelledby={`${T.id}-title`} className="cw-glass relative overflow-hidden p-4 shadow-cw-chassis outline-none sm:p-7">
      <Corners />
      <audio
        ref={audioRef}
        preload="none"
        onPlaying={onPlaying}
        onPause={() => setPlaying(false)}
        onTimeUpdate={onTime}
        onError={onAudioError}
        onEnded={() => {
          setPlaying(false);
          if (!now) return;
          savePosition(now.ep.id, Number.MAX_SAFE_INTEGER, 1);
          // Audiolivro: segue para o próximo capítulo.
          const i = BOOKS && now.list ? now.list.findIndex((e) => e.id === now.ep.id) : -1;
          const next = i >= 0 ? now.list?.[i + 1] : undefined;
          if (next) playEpisode(now.show, next, now.list);
        }}
        data-testid={`${T.tid}-audio`}
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`${T.id}-title`} className="flex items-center gap-2 font-cyber text-lg font-bold tracking-widest text-cw-yellow uppercase">
            {BOOKS ? <BookHeadphones className="size-5" aria-hidden="true" /> : <Podcast className="size-5" aria-hidden="true" />} {T.title}
          </h2>
          <p className="font-mono text-xs text-gray-400">
            {BOOKS
              ? "Livros completos e gratuitos (obras em domínio público), capítulo por capítulo. O site lembra onde você parou e passa sozinho para o próximo capítulo."
              : "Podcasts famosos do Brasil e do mundo, episódios completos. O site lembra onde você parou."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runTest()}
          disabled={!!test?.running}
          className={cn("inline-flex items-center gap-1.5 rounded border border-cw-cyan/40 px-3 py-1.5 font-mono text-xs text-cw-cyan hover:bg-cyan-950/50 disabled:opacity-50", FOCUS)}
        >
          {test?.running ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Stethoscope className="size-4" aria-hidden="true" />}
          Testar {T.plural} neste aparelho
        </button>
      </div>

      {test && (
        <div className="mb-4 rounded border border-cw-cyan/30 bg-black/50 p-3 font-mono text-xs text-gray-300" data-testid={`${T.tid}-teste`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span>
              {test.running ? `Testando… ${test.rows.length} de ${test.total}` : `${testOk} de ${test.rows.length} ${T.plural} tocaram neste aparelho.`}
              {!test.running && testOk < test.rows.length && " Os que não tocaram ficam no fim de cada aba, marcados."}
            </span>
            {!test.running && (
              <button type="button" onClick={() => void copyReport()} className={cn("inline-flex items-center gap-1 rounded border border-cw-cyan/40 px-2 py-1 text-cw-cyan hover:bg-cyan-950/50", FOCUS)}>
                <Copy className="size-3.5" aria-hidden="true" /> {copied ? "Copiado!" : "Copiar resultado"}
              </button>
            )}
          </div>
          <ul className="grid max-h-48 gap-0.5 overflow-y-auto sm:grid-cols-2">
            {test.rows.map((r) => (
              <li key={r.show} className="flex items-center gap-1.5">
                {r.ok ? <CircleCheck className="size-3.5 shrink-0 text-emerald-400" aria-label="tocou" /> : <CircleX className="size-3.5 shrink-0 text-red-400" aria-label="não tocou" />}
                <span className="truncate">{r.show}</span>
                <span className="truncate text-gray-500">{r.host}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div role="tablist" aria-label={`Categorias de ${T.plural}`} className="mb-3 flex flex-wrap gap-2">
        {TABS.map((t) => tabBtn(t.id, t.name, counts[t.id]))}
        {tabBtn("buscar", T.search)}
        {BOOKS && tabBtn("pagos", "Audible, Storytel e outros (pagos)")}
      </div>

      {tab === "buscar" && !openShow && (
        <form onSubmit={search} className="mb-3 flex gap-2" role="search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={T.placeholder}
            aria-label={BOOKS ? "Livro ou autor" : "Nome do podcast"}
            className={cn("min-w-0 flex-1 rounded border border-cw-yellow/30 bg-black/60 px-3 py-2 font-mono text-sm text-white placeholder:text-gray-500", FOCUS)}
          />
          <button type="submit" className={cn("inline-flex items-center gap-1.5 rounded bg-cw-yellow px-3 py-2 font-mono text-xs font-bold text-black", FOCUS)}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />} Buscar
          </button>
        </form>
      )}

      {openShow ? (
        <div data-testid={`${T.tid}-episodios`}>
          <div className="mb-3 flex items-center gap-3">
            {openShow.art && <img src={openShow.art} alt="" className="size-16 rounded border border-cw-yellow/30 object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />}
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-cyber text-base font-bold text-white">{openShow.name}</h3>
              <p className="truncate font-mono text-xs text-gray-400">{openShow.artist}</p>
            </div>
            <button type="button" onClick={() => setOpenShow(null)} className={cn("rounded border border-cw-yellow/40 px-3 py-1.5 font-mono text-xs text-cw-yellow hover:bg-yellow-950/50", FOCUS)}>
              Voltar aos {T.plural}
            </button>
          </div>
          {openShow.episodes.length > 1 && (
            <button
              type="button"
              onClick={() => setAsc((v) => !v)}
              className={cn("mb-2 inline-flex items-center gap-1.5 rounded border border-white/15 px-2 py-1 font-mono text-[11px] text-gray-300 hover:border-cw-yellow/50", FOCUS)}
            >
              <ArrowDownUp className="size-3.5" aria-hidden="true" />
              {asc ? `Ordem: do 1º ${T.unit} ao último (tocar para ver os mais novos primeiro)` : `Ordem: mais novos primeiro (tocar para ver do 1º ${T.unit})`}
            </button>
          )}
          {openShow.episodes.length === 0 ? (
            <p className="font-mono text-xs text-gray-400">Não consegui carregar os {T.unit}s deste {T.one} agora.</p>
          ) : (
            <ul className="grid max-h-[28rem] gap-1.5 overflow-y-auto pr-1">
              {shownEpisodes.map((ep) => {
                const isNow = now?.ep.id === ep.id;
                const pos = savedPosition(ep.id);
                return (
                  <li key={ep.id}>
                    <button
                      type="button"
                      onClick={() => playEpisode(openShow, ep, shownEpisodes)}
                      aria-current={isNow ? "true" : undefined}
                      className={cn(
                        "flex w-full items-start gap-3 rounded border p-2.5 text-left transition-colors",
                        isNow ? "border-cw-yellow bg-yellow-950/40" : "border-white/10 bg-black/40 hover:border-cw-yellow/50",
                        FOCUS,
                      )}
                    >
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-cw-yellow text-black">
                        {isNow && playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm font-semibold text-white">{ep.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-gray-400">
                          {fmtDate(ep.date)}
                          {ep.dur ? <span>· {formatDur(ep.dur)}</span> : null}
                          {pos ? <span className="text-cw-cyan">· parou em {formatClock(pos)}</span> : null}
                          {statusBadge(ep)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : tab === "pagos" ? (
        <div data-testid="audiolivro-pagos">
          <p className="mb-3 font-mono text-xs text-gray-400">
            Estes serviços têm os lançamentos e best-sellers, mas o áudio deles é protegido: toca só no app ou no site de cada um, com a sua conta. Os botões abrem o
            serviço em outra aba (na rede da empresa/AVD eles podem estar bloqueados).
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PAID_AUDIOBOOKS.map((p) => (
              <li key={p.name} className="flex flex-col gap-2 rounded border border-white/10 bg-black/40 p-3">
                <span className="font-cyber text-sm font-bold text-white">{p.name}</span>
                <span className="flex-1 font-mono text-[11px] text-gray-400">{p.info}</span>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className={cn("inline-flex w-fit items-center gap-1.5 rounded border border-cw-cyan/40 px-2.5 py-1 font-mono text-xs text-cw-cyan hover:bg-cyan-950/50", FOCUS)}>
                  <ExternalLink className="size-3.5" aria-hidden="true" /> Abrir {p.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : tab === "buscar" ? (
        hits === null ? (
          <p className="font-mono text-xs text-gray-400">
            {BOOKS ? "Procure audiolivros gratuitos publicados como podcast no catálogo do Apple Podcasts (dica: escreva o nome do livro ou do autor e a palavra audiolivro). Livros com direitos autorais (ex.: O Senhor dos Anéis, Harry Potter) não são gratuitos: estão na aba “Audible, Storytel e outros (pagos)”; a busca pode achar só podcasts sobre eles." : "Procure qualquer podcast do catálogo do Apple Podcasts."}
          </p>
        ) : hits.length === 0 ? (
          <p className="font-mono text-xs text-gray-400">Nenhum {T.one} encontrado (ou o catálogo não respondeu).</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {hits.map((h) => (
              <button key={h.collectionId} type="button" onClick={() => void openHit(h)} className={cn("group flex flex-col gap-1.5 rounded border border-white/10 bg-black/40 p-2 text-left hover:border-cw-yellow/60", FOCUS)}>
                {h.art ? <img src={h.art} alt="" loading="lazy" className="aspect-square w-full rounded object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : <span className="aspect-square w-full rounded bg-gray-900" />}
                <span className="line-clamp-2 text-xs font-semibold text-white">{h.name}</span>
                <span className="truncate font-mono text-[10px] text-gray-400">{h.artist}</span>
                {h.anchor && hosts[ANCHOR_AUDIO_HOST]?.s === "ok" && <span className="font-mono text-[10px] text-emerald-300">✓ servidor que toca nesta rede</span>}
              </button>
            ))}
          </div>
        )
      ) : ordered.length === 0 ? (
        <p className="font-mono text-xs text-gray-400">{loading ? `Carregando os ${T.plural}…` : `Não consegui carregar os ${T.plural} agora. Tente de novo mais tarde.`}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid={`${T.tid}-lista`}>
          {ordered.map((s) => (
            <button key={s.id} type="button" onClick={() => openTheShow(s)} className={cn("group flex flex-col gap-1.5 rounded border border-white/10 bg-black/40 p-2 text-left hover:border-cw-yellow/60", FOCUS)}>
              {s.art ? <img src={s.art} alt="" loading="lazy" className="aspect-square w-full rounded object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : <span className="grid aspect-square w-full place-items-center rounded bg-gray-900 font-cyber text-2xl text-cw-yellow">{s.name.split(/\s+/).filter((w) => /^[A-Za-zÀ-ú0-9]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("")}</span>}
              <span className="line-clamp-2 text-sm font-semibold text-white">{s.name}</span>
              <span className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-gray-400">
                {LANG_LABEL[s.lang]}
                {statusBadge(s.episodes[0])}
              </span>
            </button>
          ))}
        </div>
      )}

      {now && (
        <div className="mt-4 flex flex-col gap-2 rounded border border-cw-yellow/40 bg-black/70 p-3" data-testid={`${T.tid}-player`}>
          <div className="flex items-center gap-3">
            {now.show.art && <img src={now.show.art} alt="" className="size-10 rounded object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{now.ep.title}</p>
              <p className="truncate font-mono text-[11px] text-gray-400">{now.show.name}</p>
            </div>
            <button type="button" aria-label="Voltar 15 segundos" onClick={() => skip(-15)} className={cn("rounded p-1.5 text-cw-yellow hover:bg-yellow-950/50", FOCUS)}>
              <RotateCcw className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={playing ? "Pausar" : "Tocar"}
              onClick={() => playEpisode(now.show, now.ep)}
              className={cn("grid size-10 place-items-center rounded-full bg-cw-yellow text-black", FOCUS)}
            >
              {playing ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
            </button>
            <button type="button" aria-label="Avançar 30 segundos" onClick={() => skip(30)} className={cn("rounded p-1.5 text-cw-yellow hover:bg-yellow-950/50", FOCUS)}>
              <RotateCw className="size-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={cycleSpeed} aria-label={`Velocidade ${speed}x`} className={cn("rounded border border-cw-yellow/40 px-2 py-1 font-mono text-xs text-cw-yellow", FOCUS)}>
              {speed}x
            </button>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-gray-400">
            <span>{formatClock(time)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.round(dur))}
              value={Math.min(Math.round(time), Math.max(1, Math.round(dur)))}
              onChange={(e) => {
                if (audioRef.current) audioRef.current.currentTime = Number(e.target.value);
              }}
              aria-label={`Posição do ${T.unit}`}
              className="flex-1 accent-cw-yellow"
            />
            <span>{dur ? formatClock(dur) : "--:--"}</span>
          </div>
          {error && (
            <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-red-300" data-testid={`${T.tid}-erro`}>
              {error}
              {now.show.link && (
                <a href={now.show.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cw-cyan underline">
                  <ExternalLink className="size-3.5" aria-hidden="true" /> Apple Podcasts
                </a>
              )}
            </p>
          )}
        </div>
      )}

      <p className="mt-3 font-mono text-[10px] text-gray-500">
        {data?.origin === "github" && data.updatedAt ? `Lista atualizada pelo GitHub em ${new Date(data.updatedAt).toLocaleString("pt-BR")}. ` : ""}
        {BOOKS
          ? "Audiolivros gratuitos publicados como podcast (catálogo do Apple Podcasts); o áudio vem do servidor de cada um."
          : "Episódios do catálogo do Apple Podcasts; o áudio vem do servidor de cada podcast."}
      </p>
    </section>
  );
}
