// Aba "Músicas": pesquisa e toca músicas completas a qualquer hora, fora da programação das rádios.
// Lógica no estilo Spotube: catálogo (iTunes/Deezer) + fonte de áudio do YouTube (src/lib/music-catalog.ts).
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CircleCheck, CircleMinus, CircleX, Copy, ExternalLink, HardDrive, ListMusic, Loader2, MicVocal, Music2, Pause, Play, RefreshCw, Search, Shuffle, SkipBack, SkipForward, Stethoscope, Trash2, Upload } from "lucide-react";
import { Corners } from "@/components/cyber";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/hooks/use-confirm";
import { SOURCES, archiveTracks, fmtTime, loadMusicConfig, searchSource, type MusicConfig, type SourceId, type Track } from "@/lib/music-sources";
import { fetchLyrics, forgetMatch, matchOnYoutube, rememberMatch, type Lyrics, type YtCandidate } from "@/lib/music-catalog";
import { diagnosticsReport, runDiagnostics, type DiagResult } from "@/lib/music-diagnostics";
import { clearClipFirst, idsInIndex, loadIndex, noteFirstIndexIdBlocked, type MusicIndex } from "@/lib/music-index";
import { firstArtist } from "@/lib/music-match";
import { YT_ENV_ERRORS, checkEmbedsHere, embedSrc, embedVerdict, saveEmbedVerdict, ytErrorText, youtubeListUrl, youtubeSearchUrl, type EmbedVerdict } from "@/lib/yt-player";
import { addLocalFiles, clearLocal, fmtBytes, localPlayUrl, removeLocal, storageInfo } from "@/lib/local-music";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cw-yellow";
const LAST_SOURCE = "musica.fonte4";
const YT_ID = 1;
// Endereços do player do YouTube, na ordem de tentativa. Algumas redes (computador de empresa/AVD) liberam
// youtube.com e bloqueiam youtube-nocookie.com (ou o contrário): o site troca sozinho e lembra o que funcionou.
const YT_HOSTS = ["www.youtube.com", "www.youtube-nocookie.com"] as const;
const YT_HOST_KEY = "musica.ythost";
const savedYtHost = (): string => {
  try {
    const h = localStorage.getItem(YT_HOST_KEY);
    return h && (YT_HOSTS as readonly string[]).includes(h) ? h : YT_HOSTS[0];
  } catch {
    return YT_HOSTS[0];
  }
};

type Mode = "audio" | "youtube" | null;

const fire = (name: string, detail?: Record<string, unknown>) => document.dispatchEvent(new CustomEvent(name, { detail }));

export function MusicLibrary() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const confirm = useConfirm();
  const [config, setConfig] = useState<MusicConfig | null>(null);
  const [source, setSource] = useState<SourceId>(() => {
    const s = localStorage.getItem(LAST_SOURCE) as SourceId | null;
    return s && SOURCES.some((x) => x.id === s) ? s : "catalogo";
  });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [mode, setMode] = useState<Mode>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [openingItem, setOpeningItem] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [alts, setAlts] = useState<{ key: string; list: YtCandidate[] } | null>(null);
  // Resultados do catálogo que já estão no índice do site (tocam completos na hora).
  const [inIndex, setInIndex] = useState<Set<string>>(() => new Set());
  const [showAlts, setShowAlts] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [lyrics, setLyrics] = useState<{ key: string; data: Lyrics | null | undefined; blocked?: boolean } | null>(null);
  const [tapHint, setTapHint] = useState(false);
  const [localBusy, setLocalBusy] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [diag, setDiag] = useState<DiagResult[] | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Onde o diagnóstico mostra o player de teste (e a mensagem do YouTube, se ele recusar). */
  const diagBoxRef = useRef<HTMLDivElement>(null);
  const ytHeardRef = useRef(false);
  const [ytHost, setYtHost] = useState<string>(savedYtHost);
  const ytHostRef = useRef(ytHost);
  ytHostRef.current = ytHost;
  /** Endereços do player já tentados para o vídeo atual (sem resposta). */
  const ytTriedRef = useRef<Set<string>>(new Set());
  const ytTimerRef = useRef<number | null>(null);
  const duckRef = useRef(false);
  const current = index >= 0 ? queue[index] : undefined;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const indexRef = useRef(index);
  indexRef.current = index;
  /** Vídeos que não tocaram (bloqueados para incorporação etc.), por faixa. */
  const failedRef = useRef<Map<string, Set<string>>>(new Map());
  /** Códigos de erro do player do YouTube, por faixa (para explicar por que caiu na prévia). */
  const ytErrsRef = useRef<Map<string, number[]>>(new Map());
  /** Índice de músicas completas já carregado (para o link "Ouvir no YouTube"). */
  const idxRef = useRef<MusicIndex | null>(null);
  /** Faixa cujo player do YouTube foi recusado aqui: destaca o botão "Ouvir no YouTube". */
  const [refused, setRefused] = useState<string | null>(null);
  /**
   * O YouTube recusa QUALQUER vídeo dentro do site neste navegador/rede (nem o vídeo de teste sem música toca):
   * o site para de tentar o player aqui e oferece direto "Ouvir no YouTube". Vale por 6 h ou até "Tentar tocar aqui de novo".
   */
  const [inSiteOff, setInSiteOff] = useState<boolean>(() => embedVerdict()?.v === "recusa");
  const inSiteOffRef = useRef(inSiteOff);
  inSiteOffRef.current = inSiteOff;
  /** Onde fica o player de teste escondido (vídeo sem música). */
  const probeBoxRef = useRef<HTMLDivElement>(null);
  const checkingRef = useRef(false);
  const ytStartedRef = useRef(false);

  useEffect(() => {
    loadMusicConfig().then(setConfig);
  }, []);

  const refreshLocal = useCallback(async (q = "") => {
    try {
      const r = await searchSource("local", q, {});
      setResults(r);
      setStorage(await storageInfo());
      return r;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível abrir as músicas do aparelho.");
      return [];
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LAST_SOURCE, source);
    setResults([]);
    setMessage(null);
    if (source === "local") {
      // O texto da busca anterior não pode virar filtro da biblioteca do aparelho.
      setQuery("");
      void refreshLocal();
    }
  }, [source, refreshLocal]);

  // Comandos para o player oficial do YouTube (pausar, tocar, volume, posição).
  const ytRef = useRef<HTMLIFrameElement>(null);
  const ytCmd = useCallback((func: string, args: unknown[] = []) => {
    ytRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args, id: YT_ID, channel: "widget" }), "*");
  }, []);

  // ---------- parar tudo ----------
  const haltAll = useCallback(() => {
    ytCmd("pauseVideo");
    audioRef.current?.pause();
    setPlaying(false);
  }, [ytCmd]);

  // Rádio começou a tocar: a música para (e vice-versa, pelo evento cw:music-play).
  useEffect(() => {
    const onRadio = () => haltAll();
    document.addEventListener("cw:radio-play", onRadio);
    document.addEventListener("cw:podcast-play", onRadio);
    return () => {
      document.removeEventListener("cw:radio-play", onRadio);
      document.removeEventListener("cw:podcast-play", onRadio);
    };
  }, [haltAll]);

  // A ANDRA-18 abaixa a música quando fala.
  useEffect(() => {
    const on = () => {
      duckRef.current = true;
      if (audioRef.current) audioRef.current.volume = volume * 0.3;
      ytCmd("setVolume", [Math.round(volume * 30)]);
    };
    const off = () => {
      duckRef.current = false;
      if (audioRef.current) audioRef.current.volume = volume;
      ytCmd("setVolume", [Math.round(volume * 100)]);
    };
    document.addEventListener("cw:speak", on);
    document.addEventListener("cw:speakend", off);
    return () => {
      document.removeEventListener("cw:speak", on);
      document.removeEventListener("cw:speakend", off);
    };
  }, [volume, ytCmd]);

  useEffect(() => {
    const v = duckRef.current ? volume * 0.3 : volume;
    if (audioRef.current) audioRef.current.volume = v;
    ytCmd("setVolume", [Math.round(v * 100)]);
  }, [volume, ytCmd]);

  const refusedWhy = (t: Track, code: number) =>
    `O YouTube não deixou tocar "${t.title}" dentro do site (${ytErrorText(code)}). Tocando a prévia de 30 s — para ouvir completa, toque em “Ouvir no YouTube”.`;
  /** Recusa da rede/navegador inteiro (nem o vídeo de teste sem música toca). */
  const networkWhy = (t: Track, code: number | undefined, preview: boolean) => {
    const head = `O YouTube recusou tocar dentro do site neste computador/rede — nem um vídeo de teste dele, sem música, toca aqui${code ? ` (${ytErrorText(code)})` : ""}.`;
    const what = preview ? ` Tocando a prévia de 30 s de "${t.title}": para ouvir completa, toque em “Ouvir no YouTube”.` : " Para ouvir, toque em “Ouvir no YouTube”.";
    const tip =
      code === 152 || code === 153
        ? " Uma extensão de privacidade, a configuração do navegador ou o proxy da empresa está escondendo o endereço do site."
        : " Dica: entre na sua conta em youtube.com neste navegador e toque em “Tentar tocar aqui de novo”.";
    return head + what + tip;
  };
  /** Só esta música é recusada (o vídeo de teste toca): restrição da gravadora. */
  const labelWhy = (t: Track, code: number) =>
    `A gravadora de "${t.title}" não deixa ela tocar neste site (${ytErrorText(code)}); outros vídeos tocam aqui normalmente. Tocando a prévia de 30 s — para ouvir completa, toque em “Ouvir no YouTube”.`;

  const playPreview = useCallback(
    async (t: Track, why: string) => {
      if (!t.previewUrl) throw new Error("sem áudio");
      setMessage(why);
      setMode("audio");
      const a = audioRef.current!;
      a.src = t.previewUrl;
      a.volume = duckRef.current ? volume * 0.3 : volume;
      await a.play();
    },
    [volume],
  );

  // Depois de uma música recusada: descobre (uma vez) se o YouTube recusa tudo aqui ou só essa música.
  const afterRefusal = useCallback((t: Track, code: number) => {
    const apply = (v: EmbedVerdict | null) => {
      if (!v) return;
      const cur = queueRef.current[indexRef.current];
      if (v.v === "recusa") {
        setInSiteOff(true);
        clearClipFirst(); // a recusa não era do áudio do YouTube Music: era de tudo
        if (cur?.key === t.key) setMessage(networkWhy(t, v.code ?? code, !!t.previewUrl));
      } else if (cur?.key === t.key && !YT_ENV_ERRORS.has(code)) setMessage(labelWhy(t, code));
    };
    const known = embedVerdict();
    if (known) return apply(known);
    if (checkingRef.current || !probeBoxRef.current) return;
    checkingRef.current = true;
    void checkEmbedsHere(probeBoxRef.current, ytHostRef.current)
      .then(apply)
      .finally(() => {
        checkingRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- tocar ----------
  const playAt = useCallback(
    async (list: Track[], i: number, opts: { fresh?: boolean } = {}) => {
      let t = list[i];
      if (!t) return;
      setQueue(list);
      setIndex(i);
      setTime(0);
      setDuration(t.duration ?? 0);
      setLoading(true);
      setShowAlts(false);
      setTapHint(false);
      setRefused(null);
      haltAll();
      fire("cw:music-play", { title: t.title, artist: t.artist });
      fire("cw:trackchange", { title: t.title, artist: t.artist });
      if (t.source === "catalogo") void loadIndex().then((idx) => void (idxRef.current = idx), () => undefined);
      try {
        // O YouTube recusa qualquer vídeo dentro do site aqui: nem tenta o player (oferece "Ouvir no YouTube").
        if (inSiteOffRef.current && (t.source === "catalogo" || t.youtubeId)) {
          setRefused(t.key);
          setMode(null);
          const code = embedVerdict()?.code;
          if (t.previewUrl) await playPreview(t, networkWhy(t, code, true));
          else {
            setPlaying(false);
            setMessage(networkWhy(t, code, false));
          }
          return;
        }
        // Catálogo (estilo Spotube): acha a mesma gravação no YouTube e toca completa no player oficial.
        if (t.source === "catalogo" && config && (!t.youtubeId || opts.fresh)) {
          setMode(null);
          setMatching(true);
          const skip = [...(failedRef.current.get(t.key) ?? [])];
          try {
            const m = await matchOnYoutube(t, config, { fresh: opts.fresh, skip });
            if (m.alternatives.length) setAlts({ key: t.key, list: m.alternatives });
            t = { ...t, youtubeId: m.videoId ?? undefined };
            const nt = t;
            setQueue((q) => q.map((x, j) => (j === i ? nt : x)));
          } catch {
            t = { ...t, youtubeId: undefined };
          } finally {
            setMatching(false);
          }
          if (!t.youtubeId) {
            const codes = ytErrsRef.current.get(t.key) ?? [];
            if (codes.length) {
              // Havia vídeo, mas o YouTube recusou todos aqui: a música completa abre no próprio YouTube.
              setRefused(t.key);
              await playPreview(t, refusedWhy(t, codes[codes.length - 1]));
              afterRefusal(t, codes[codes.length - 1]);
              return;
            }
            await playPreview(t, `Não encontrei "${t.title}" completa nas fontes disponíveis agora. Tocando a prévia de 30 s — tente “Procurar de novo” ou veja o “Diagnóstico das fontes” abaixo.`);
            return;
          }
        }
        if (t.youtubeId) {
          ytStartedRef.current = false;
          ytTriedRef.current = new Set();
          setMessage(null);
          setMode("youtube");
          setPlaying(true);
          return;
        }
        const src = t.localId ? await localPlayUrl(t.localId) : t.url;
        if (!src) throw new Error("sem áudio");
        setMode("audio");
        const a = audioRef.current!;
        a.src = src;
        a.volume = duckRef.current ? volume * 0.3 : volume;
        await a.play();
      } catch (e) {
        setPlaying(false);
        setMessage(`Não foi possível tocar "${t.title}". ${e instanceof Error && e.name === "NotAllowedError" ? "Toque em ▶ para liberar o som." : "Tente outra música."}`);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, haltAll, playPreview, volume, afterRefusal],
  );

  const next = useCallback(() => {
    const q = queueRef.current;
    const i = indexRef.current;
    if (i + 1 < q.length) void playAt(q, i + 1);
    else setPlaying(false);
  }, [playAt]);
  const prev = useCallback(() => {
    const a = audioRef.current;
    if (mode === "audio" && a && a.currentTime > 4) {
      a.currentTime = 0;
      return;
    }
    if (mode === "youtube" && time > 4) {
      ytCmd("seekTo", [0, true]);
      return;
    }
    const i = indexRef.current;
    if (i > 0) void playAt(queueRef.current, i - 1);
  }, [mode, playAt, time, ytCmd]);

  // O vídeo escolhido não pôde tocar (bloqueado fora do YouTube, removido, privado): tenta a próxima fonte.
  const onYoutubeError = useCallback(
    (code: number) => {
      const t = queueRef.current[indexRef.current];
      if (!t?.youtubeId) return;
      ytErrsRef.current.set(t.key, [...(ytErrsRef.current.get(t.key) ?? []), code]);
      if (YT_ENV_ERRORS.has(code)) {
        // Não é o vídeo: o endereço do site não chegou ao YouTube (navegador, extensão ou rede). Trocar de vídeo não adianta.
        setRefused(t.key);
        const why = `O YouTube recusou tocar dentro do site neste navegador (${ytErrorText(code)}).`;
        if (t.previewUrl) void playPreview(t, `${why} Tocando a prévia de 30 s — para ouvir completa, toque em “Ouvir no YouTube”.`).catch(() => setMessage(why));
        else setMessage(`${why} Toque em “Ouvir no YouTube”.`);
        afterRefusal(t, code);
        return;
      }
      // O 1º vídeo do índice é o áudio do YouTube Music: se a gravadora o recusa em sites, o site aprende a começar pelo clipe.
      if ((code === 101 || code === 150) && t.source === "catalogo" && idxRef.current && idsInIndex(idxRef.current, t)[0] === t.youtubeId) noteFirstIndexIdBlocked(t.key);
      if (t.source !== "catalogo") {
        setMessage(`Esse vídeo não pode tocar fora do YouTube (erro ${code}). Pulando…`);
        window.setTimeout(next, 1200);
        return;
      }
      const set = failedRef.current.get(t.key) ?? new Set<string>();
      set.add(t.youtubeId);
      failedRef.current.set(t.key, set);
      forgetMatch(t);
      if (set.size >= 5) {
        setRefused(t.key);
        void playPreview(t, refusedWhy(t, code)).catch(() => next());
        afterRefusal(t, code);
        return;
      }
      setMessage("Essa fonte de áudio não pode tocar aqui; tentando a próxima…");
      void playAt(queueRef.current, indexRef.current, { fresh: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [next, playAt, playPreview, afterRefusal],
  );

  // Trocar a fonte de áudio da faixa atual (como as "fontes alternativas" do Spotube).
  const pickAlternative = (c: YtCandidate) => {
    const t = queueRef.current[indexRef.current];
    if (!t) return;
    rememberMatch(t, c.id);
    const nt = { ...t, youtubeId: c.id };
    setQueue((q) => q.map((x, j) => (j === indexRef.current ? nt : x)));
    setShowAlts(false);
    ytStartedRef.current = false;
    ytTriedRef.current = new Set();
    audioRef.current?.pause();
    setMessage(null);
    setMode("youtube");
    setPlaying(true);
    fire("cw:music-play", { title: t.title, artist: t.artist });
  };
  const openAlternatives = async () => {
    const t = queueRef.current[indexRef.current];
    if (!t || !config) return;
    if (alts?.key === t.key && alts.list.length) {
      setShowAlts((v) => !v);
      return;
    }
    setMatching(true);
    try {
      const m = await matchOnYoutube(t, config, { fresh: true });
      setAlts({ key: t.key, list: m.alternatives });
      setShowAlts(true);
      if (t.youtubeId) rememberMatch(t, t.youtubeId); // mantém a escolha atual até o ouvinte trocar
    } catch {
      setMessage("Não consegui listar outras fontes agora.");
    } finally {
      setMatching(false);
    }
  };

  const toggle = () => {
    if (!current) return;
    if (mode === "youtube") {
      if (playing) ytCmd("pauseVideo");
      else {
        fire("cw:music-play", { title: current.title, artist: current.artist });
        ytCmd("playVideo");
      }
      setPlaying(!playing);
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else {
      fire("cw:music-play", { title: current.title, artist: current.artist });
      if (!a.src || mode === null) void playAt(queue, index);
      else void a.play().catch(() => setMessage("Não foi possível retomar. Escolha a música de novo."));
    }
  };

  // Clique num resultado.
  const choose = async (t: Track, i: number) => {
    setMessage(null);
    if (t.archiveItem && !t.url) {
      setOpeningItem(t.key);
      try {
        const tracks = await archiveTracks(t);
        if (!tracks.length) {
          setMessage("Esse item do Internet Archive não tem faixas em MP3. Escolha outro.");
          return;
        }
        await playAt(tracks, 0);
      } catch {
        setMessage("O Internet Archive não respondeu. Tente de novo.");
      } finally {
        setOpeningItem(null);
      }
      return;
    }
    // A fila é a lista de resultados (itens do Archive ficam de fora até serem abertos).
    const list = results.filter((r) => !r.archiveItem || r.url);
    await playAt(list, Math.max(0, list.indexOf(t) >= 0 ? list.indexOf(t) : i));
  };

  const addToQueue = (t: Track) => {
    if (t.archiveItem && !t.url) return;
    setQueue((q) => (q.some((x) => x.key === t.key) ? q : [...q, t]));
  };

  // ---------- busca ----------
  const search = async (e?: FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (source === "local") {
      const r = await refreshLocal(q);
      setMessage(r.length ? null : q ? "Nenhuma música do aparelho com esse nome." : null);
      return;
    }
    if (!q || !config) return;
    setSearching(true);
    setMessage(null);
    // O índice de músicas completas carrega junto com a busca (fica pronto antes do clique em tocar).
    const idxP = source === "catalogo" || source === "youtube" ? loadIndex() : null;
    idxP?.catch(() => undefined);
    try {
      const r = await searchSource(source, q, config);
      setResults(r);
      setInIndex(new Set());
      idxP
        ?.then((idx) => {
          idxRef.current = idx;
          setInIndex(new Set(r.filter((t) => t.source === "catalogo" && idsInIndex(idx, t).length > 0).map((t) => t.key)));
        })
        .catch(() => undefined);
      if (!r.length) setMessage("Nada encontrado nessa fonte. Tente outro nome ou outra fonte.");
      else if (source === "youtube" && r[0].source === "catalogo") setMessage("A busca direta do YouTube não respondeu agora; mostrando as músicas do catálogo — elas tocam completas pelo YouTube.");
    } catch {
      setResults([]);
      setMessage(source === "youtube" ? "O YouTube não respondeu agora. Use a aba Catálogo ou tente de novo em instantes." : "A fonte não respondeu agora. Tente de novo em instantes ou use outra fonte.");
    } finally {
      setSearching(false);
    }
  };

  // ---------- eventos do <audio> ----------
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    const tick = () => {
      if (mode !== "audio") return;
      setTime(a.currentTime);
      if (Number.isFinite(a.duration)) setDuration(a.duration);
    };
    const err = () => {
      if (!a.src || mode !== "audio") return;
      setPlaying(false);
      setMessage("Essa música não carregou. Pulando para a próxima…");
      window.setTimeout(next, 1200);
    };
    const end = () => mode === "audio" && next();
    a.addEventListener("playing", on);
    a.addEventListener("pause", off);
    a.addEventListener("timeupdate", tick);
    a.addEventListener("ended", end);
    a.addEventListener("error", err);
    return () => {
      a.removeEventListener("playing", on);
      a.removeEventListener("pause", off);
      a.removeEventListener("timeupdate", tick);
      a.removeEventListener("ended", end);
      a.removeEventListener("error", err);
    };
  }, [next, mode]);

  // YouTube: o player avisa estado, tempo, erro e fim do vídeo por postMessage.
  useEffect(() => {
    if (mode !== "youtube") return;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== ytRef.current?.contentWindow) return;
      try {
        const d = JSON.parse(String(e.data)) as { event?: string; info?: unknown };
        if (!ytHeardRef.current || d.event === "onReady") {
          // Primeira resposta do player: registra os eventos e manda tocar (protocolo do IFrame API).
          ytHeardRef.current = true;
          try {
            localStorage.setItem(YT_HOST_KEY, ytHostRef.current);
          } catch {
            /* sem armazenamento */
          }
          for (const ev of ["onReady", "onStateChange", "onError"]) ytCmd("addEventListener", [ev]);
          ytCmd("setVolume", [Math.round((duckRef.current ? volume * 0.3 : volume) * 100)]);
          ytCmd("playVideo");
        }
        if (d.event === "onError") {
          onYoutubeError(Number(d.info));
          return;
        }
        const info = (d.info && typeof d.info === "object" ? d.info : {}) as { playerState?: number; currentTime?: number; duration?: number };
        const state = d.event === "onStateChange" ? d.info : d.event === "infoDelivery" || d.event === "initialDelivery" ? info.playerState : undefined;
        if (typeof info.currentTime === "number") setTime(info.currentTime);
        if (typeof info.duration === "number" && info.duration > 0) setDuration(info.duration);
        if (state === 1) {
          ytStartedRef.current = true;
          setTapHint(false);
          setPlaying(true);
        }
        if (state === 2) setPlaying(false);
        if (state === 0) next();
      } catch {
        /* outra mensagem */
      }
    };
    window.addEventListener("message", onMsg);
    // Celulares (principalmente iPhone) podem exigir um toque no próprio vídeo para começar.
    const hint = window.setTimeout(() => {
      if (!ytStartedRef.current) setTapHint(true);
    }, 5000);
    return () => {
      window.removeEventListener("message", onMsg);
      window.clearTimeout(hint);
    };
  }, [mode, next, onYoutubeError, current?.youtubeId, volume, ytCmd]);
  // Aperto de mão com o player do YouTube: repete "listening" até ele responder (como o IFrame API oficial).
  const ytListen = () => {
    ytHeardRef.current = false;
    if (ytTimerRef.current) window.clearInterval(ytTimerRef.current);
    let tries = 0;
    const send = () => {
      ytRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: YT_ID, channel: "widget" }), "*");
      for (const ev of ["onReady", "onStateChange", "onError"]) ytCmd("addEventListener", [ev]);
    };
    send();
    ytTimerRef.current = window.setInterval(() => {
      if (ytHeardRef.current || ++tries > 20) {
        if (ytTimerRef.current) window.clearInterval(ytTimerRef.current);
        ytTimerRef.current = null;
        if (!ytHeardRef.current) onYoutubeSilent();
        return;
      }
      send();
    }, 400);
  };
  // O player não respondeu em 8 s (endereço bloqueado nesta rede): tenta o outro endereço do YouTube.
  const onYoutubeSilent = () => {
    const t = queueRef.current[indexRef.current];
    if (!t?.youtubeId || !ytRef.current) return; // o player já saiu da tela (outra música ou prévia)
    ytTriedRef.current.add(ytHostRef.current);
    const other = YT_HOSTS.find((h) => !ytTriedRef.current.has(h));
    if (other) {
      setYtHost(other);
      return;
    }
    ytTriedRef.current = new Set();
    setRefused(t.key);
    const why = "O player do YouTube não abriu nesta rede (bloqueado ou lento demais).";
    if (t.previewUrl) void playPreview(t, `${why} Tocando a prévia de 30 s — para ouvir completa, toque em “Ouvir no YouTube”.`).catch(() => setMessage(why));
    else setMessage(why);
  };
  useEffect(
    () => () => {
      if (ytTimerRef.current) window.clearInterval(ytTimerRef.current);
    },
    [],
  );

  // Letra sincronizada (LRCLib), buscada só quando o painel está aberto.
  const lyricsFor = useRef<string | null>(null);
  useEffect(() => {
    if (!lyricsOpen || !current || lyricsFor.current === current.key) return;
    const key = current.key;
    lyricsFor.current = key;
    setLyrics({ key, data: undefined });
    const keep = (data: Lyrics | null, blocked = false) => {
      if (lyricsFor.current === key) setLyrics({ key, data, blocked });
    };
    fetchLyrics(current).then(
      (d) => keep(d),
      () => keep(null, true),
    );
  }, [lyricsOpen, current]);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const lyricData = lyrics && current && lyrics.key === current.key ? lyrics.data : null;
  const syncedOk = !!lyricData?.synced.length && mode === "youtube";
  let activeLine = -1;
  if (syncedOk) for (let k = 0; k < lyricData!.synced.length; k++) if (lyricData!.synced[k].at <= time + 0.35) activeLine = k;
  useEffect(() => {
    if (activeLine < 0) return;
    const box = lyricsRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-line="${activeLine}"]`);
    if (box && el) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [activeLine]);

  // Controles na tela de bloqueio do celular.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.artist, album: "Cyberwave Radio • Músicas", artwork: current.artwork ? [{ src: current.artwork, sizes: "200x200" }] : [] });
    navigator.mediaSession.setActionHandler("nexttrack", next);
    navigator.mediaSession.setActionHandler("previoustrack", prev);
  }, [current, next, prev]);

  const seek = (v: number) => {
    if (mode === "audio" && audioRef.current) audioRef.current.currentTime = v;
    if (mode === "youtube") ytCmd("seekTo", [v, true]);
    setTime(v);
  };

  // ---------- músicas do aparelho (offline) ----------
  const onFiles = async (list: FileList | null) => {
    if (!list || !list.length) return;
    const files = [...list];
    setLocalBusy(`Guardando 0 de ${files.length}…`);
    setMessage(null);
    try {
      const { added, skipped } = await addLocalFiles(files, (d, t) => setLocalBusy(`Guardando ${d} de ${t}…`));
      setQuery("");
      await refreshLocal();
      setMessage(`${added} música(s) guardada(s) neste aparelho${skipped ? ` (${skipped} arquivo(s) ignorado(s) por não serem áudio)` : ""}. Elas tocam mesmo sem internet.`);
    } catch (e) {
      setMessage(e instanceof Error && /quota|espa/i.test(`${e.name} ${e.message}`) ? "Sem espaço no aparelho para guardar mais músicas." : "Não foi possível guardar os arquivos neste navegador.");
    } finally {
      setLocalBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const removeSong = async (t: Track) => {
    if (!t.localId) return;
    await removeLocal(t.localId);
    setQueue((q) => q.filter((x) => x.key !== t.key));
    await refreshLocal(query.trim());
  };
  const clearSongs = async () => {
    if (!(await confirm({ title: "Apagar as músicas do aparelho?", description: "Todas as músicas guardadas neste navegador serão removidas. Os arquivos originais no seu aparelho não são apagados.", confirmLabel: "Apagar", destructive: true }))) return;
    await clearLocal();
    setQueue((q) => q.filter((x) => x.source !== "local"));
    await refreshLocal();
  };

  // ---------- diagnóstico ----------
  const runDiag = async () => {
    if (!config || diagRunning) return;
    setDiagRunning(true);
    try {
      await runDiagnostics(config, setDiag, { playerBox: diagBoxRef.current });
      setInSiteOff(embedVerdict()?.v === "recusa");
    } finally {
      setDiagRunning(false);
    }
  };
  const copyDiag = async () => {
    if (!diag || !config) return;
    const text = diagnosticsReport(diag, config);
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Relatório copiado. Cole na conversa para eu ver o que falhou.");
    } catch {
      setMessage(text);
    }
  };

  const preview = current?.source === "catalogo" && mode === "audio";

  // "Ouvir no YouTube": a música atual e as próximas da lista (as que têm vídeo) no próprio site do YouTube,
  // em sequência. Serve quando o YouTube não deixa tocar dentro do site (computador de empresa, gravadora etc.).
  const ytOutIds = (() => {
    if (!current) return [] as string[];
    const idx = idxRef.current;
    const idOf = (t: Track) => (t.source === "catalogo" && idx ? idsInIndex(idx, t)[0] : undefined) ?? t.youtubeId ?? [...(failedRef.current.get(t.key) ?? [])][0];
    const first = idOf(current);
    if (!first) return [] as string[];
    const ids = [first];
    for (const t of queue.slice(index + 1)) {
      const id = idOf(t);
      if (id && !ids.includes(id)) ids.push(id);
      if (ids.length >= 50) break;
    }
    return ids;
  })();
  const ytSearch = !ytOutIds.length && current && current.source !== "local" && current.source !== "archive" ? youtubeSearchUrl(firstArtist(current.artist), current.title) : null;
  const ytOutUrl = youtubeListUrl(ytOutIds) ?? ytSearch;
  const ytOutLink = ytOutUrl && current && (
    <a
      href={ytOutUrl}
      target="cyberwave-youtube"
      onClick={() => haltAll()}
      data-testid="ouvir-no-youtube"
      title="Abre a música completa no site do YouTube, numa aba nova, com as próximas da lista em sequência"
      className={cn(
        "flex items-center gap-1 rounded border px-2 py-1 font-mono text-[11px]",
        refused === current.key ? "border-cw-yellow bg-cw-yellow/15 font-bold text-cw-yellow" : "border-cw-cyan/30 text-cw-cyan hover:bg-cyan-950/50",
        FOCUS,
      )}
    >
      <ExternalLink className="size-3" aria-hidden="true" /> {ytSearch ? "Procurar no YouTube" : "Ouvir no YouTube"}
      {ytOutIds.length > 1 ? ` (+${ytOutIds.length - 1} da lista)` : ""}
    </a>
  );
  // Volta a tentar o player dentro do site (por exemplo depois de entrar na conta do YouTube).
  const retryInSite = () => {
    saveEmbedVerdict(null);
    inSiteOffRef.current = false; // o playAt abaixo roda antes da próxima renderização
    setInSiteOff(false);
    if (!current) return;
    failedRef.current.delete(current.key);
    ytErrsRef.current.delete(current.key);
    forgetMatch(current);
    // Recomeça pela melhor opção: o vídeo da última tentativa (que falhou) pode ter ficado guardado na fila.
    const list = queue.map((x, j) => (j === index && x.source === "catalogo" ? { ...x, youtubeId: undefined } : x));
    void playAt(list, index);
  };

  return (
    <section id="musicas" tabIndex={-1} aria-labelledby="musicas-title" className="cw-glass relative overflow-hidden p-4 shadow-cw-chassis outline-none sm:p-7">
      <Corners tone="cyan" />
      <audio ref={audioRef} preload="none" />
      <div ref={probeBoxRef} aria-hidden="true" data-testid="teste-escondido" />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="musicas-title" className="flex items-center gap-2 font-cyber text-lg font-bold tracking-widest text-cw-cyan uppercase">
            <Music2 className="size-5" aria-hidden="true" /> Músicas sob demanda
          </h2>
          <p className="font-mono text-xs text-gray-400">Pesquise e toque quando quiser, fora da programação das rádios.</p>
        </div>
      </div>

      <div role="radiogroup" aria-label="Fonte das músicas" className="mb-3 flex flex-wrap gap-2">
        {SOURCES.map((s) => {
          const on = s.id === source;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setSource(s.id)}
              title={s.note}
              className={cn(
                "rounded border px-3 py-1.5 font-mono text-xs transition-colors",
                on ? "border-cw-cyan bg-cw-cyan text-black" : "border-cw-cyan/30 text-cw-cyan hover:bg-cyan-950/50",
                FOCUS,
              )}
            >
              {s.name}
            </button>
          );
        })}
      </div>

      <form onSubmit={search} className="mb-3 flex gap-2" role="search">
        <label htmlFor="musica-busca" className="sr-only">
          Pesquisar música, artista ou álbum
        </label>
        <input
          id="musica-busca"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (source === "local") void refreshLocal(e.target.value.trim());
          }}
          placeholder={source === "youtube" ? "Música, artista ou link do YouTube" : source === "catalogo" ? "Música, artista ou link (Spotify, Deezer, Apple Music)" : source === "local" ? "Filtrar as músicas guardadas" : "Música, artista ou álbum"}
          className={cn("min-w-0 flex-1 rounded border border-cw-cyan/40 bg-black/60 px-3 py-2 font-mono text-sm text-white placeholder:text-gray-500", FOCUS)}
          disabled={!config}
        />
        <button type="submit" disabled={!config || searching} className={cn("cw-cut-btn flex items-center gap-1.5 bg-cw-cyan px-4 py-2 pr-5 font-cyber text-xs font-bold tracking-wider text-black uppercase disabled:opacity-50", FOCUS)}>
          {searching ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />} Buscar
        </button>
      </form>

      {source === "local" && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-cw-cyan/20 bg-black/40 p-2">
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac" multiple className="sr-only" id="musica-arquivos" onChange={(e) => void onFiles(e.target.files)} />
          <label htmlFor="musica-arquivos" className={cn("flex cursor-pointer items-center gap-1.5 rounded bg-cw-cyan px-3 py-1.5 font-mono text-xs font-bold text-black", localBusy && "pointer-events-none opacity-60")}>
            {localBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            {localBusy ?? "Adicionar músicas do aparelho"}
          </label>
          <span className="flex items-center gap-1 font-mono text-[11px] text-gray-400">
            <HardDrive className="size-3.5" aria-hidden="true" />
            {storage ? `${fmtBytes(storage.usage)} usados de ${fmtBytes(storage.quota)}` : "Guardadas só neste navegador"}
          </span>
          {results.length > 0 && !query.trim() && (
            <button type="button" onClick={() => void clearSongs()} className={cn("ml-auto flex items-center gap-1 font-mono text-[11px] text-gray-500 hover:text-red-400", FOCUS)}>
              <Trash2 className="size-3" aria-hidden="true" /> Apagar todas
            </button>
          )}
        </div>
      )}

      {message && (
        <p role="status" className="mb-3 rounded border border-cw-yellow/30 bg-yellow-950/30 px-3 py-2 font-mono text-xs text-cw-yellow">
          {message}
        </p>
      )}

      {/* Player */}
      {current && (
        <div className="mb-4 rounded border border-cw-cyan/40 bg-black/70 p-3" aria-label="Player de músicas">
          {matching && (
            <p role="status" className="mb-3 flex items-center gap-2 font-mono text-xs text-cw-cyan">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Procurando a melhor fonte de áudio para "{current.title}"…
            </p>
          )}
          {mode === "youtube" && current.youtubeId && (
            <div className={cn("mb-3 aspect-video w-full overflow-hidden rounded", current.source === "catalogo" && "max-w-md")}>
              <iframe
                ref={ytRef}
                key={`${ytHost}/${current.youtubeId}`}
                onLoad={ytListen}
                title={`YouTube: ${current.title}`}
                src={embedSrc(ytHost, current.youtubeId)}
                allow="autoplay; encrypted-media; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="size-full"
              />
            </div>
          )}
          <div className="flex items-center gap-3">
            {current.artwork ? <img src={current.artwork} alt="" onError={(e) => (e.currentTarget.style.visibility = "hidden")} className="size-14 shrink-0 rounded object-cover" loading="lazy" /> : <div className="grid size-14 shrink-0 place-items-center rounded bg-gray-900"><Music2 className="size-6 text-cw-cyan" aria-hidden="true" /></div>}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-white" data-testid="musica-atual">{current.title}</p>
              <p className="truncate font-mono text-xs text-gray-400">
                {current.artist}
                {current.album && ` • ${current.album}`} • {current.source === "catalogo" ? (mode === "youtube" ? `${current.via ?? "Catálogo"} → música completa (YouTube)` : current.via ?? "Catálogo") : SOURCES.find((s) => s.id === current.source)?.name}
                {preview && " • prévia de 30 s"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={prev} aria-label="Música anterior" className={cn("rounded p-2 text-cw-cyan hover:bg-cyan-950/50", FOCUS)}>
                <SkipBack className="size-5" aria-hidden="true" />
              </button>
              <button type="button" onClick={toggle} aria-label={playing ? "Pausar música" : "Tocar música"} className={cn("grid size-11 place-items-center rounded-full bg-cw-cyan text-black", FOCUS)}>
                {loading ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : playing ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
              </button>
              <button type="button" onClick={next} aria-label="Próxima música" className={cn("rounded p-2 text-cw-cyan hover:bg-cyan-950/50", FOCUS)}>
                <SkipForward className="size-5" aria-hidden="true" />
              </button>
            </div>
          </div>
          {tapHint && mode === "youtube" && (
            <p role="status" className="mt-2 font-mono text-[11px] text-cw-yellow">Se a música não começou, toque no vídeo acima (alguns celulares exigem).</p>
          )}
          {mode !== null && (
            <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-gray-400">
              <span className="w-10 text-right">{fmtTime(time) || "0:00"}</span>
              <input type="range" min={0} max={Math.max(1, duration)} step={1} value={Math.min(time, duration || 1)} onChange={(e) => seek(Number(e.target.value))} disabled={(mode !== "audio" && mode !== "youtube") || !duration} aria-label="Posição na música" className="h-1 flex-1 accent-cyan-400" />
              <span className="w-10">{fmtTime(duration)}</span>
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume das músicas" className="h-1 w-20 accent-cyan-400" />
            </div>
          )}
          {current.source === "catalogo" && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => void openAlternatives()} disabled={matching} aria-expanded={showAlts} className={cn("flex items-center gap-1 rounded border border-cw-cyan/30 px-2 py-1 font-mono text-[11px] text-cw-cyan hover:bg-cyan-950/50 disabled:opacity-50", FOCUS)}>
                <Shuffle className="size-3" aria-hidden="true" /> Trocar fonte de áudio
              </button>
              <button type="button" onClick={() => void playAt(queue, index, { fresh: true })} disabled={matching} className={cn("flex items-center gap-1 rounded border border-cw-cyan/30 px-2 py-1 font-mono text-[11px] text-cw-cyan hover:bg-cyan-950/50 disabled:opacity-50", FOCUS)}>
                <RefreshCw className="size-3" aria-hidden="true" /> Procurar de novo
              </button>
              <button type="button" onClick={() => setLyricsOpen((v) => !v)} aria-expanded={lyricsOpen} aria-controls="musica-letra" className={cn("flex items-center gap-1 rounded border border-cw-cyan/30 px-2 py-1 font-mono text-[11px] hover:bg-cyan-950/50", lyricsOpen ? "bg-cw-cyan text-black" : "text-cw-cyan", FOCUS)}>
                <MicVocal className="size-3" aria-hidden="true" /> Letra
              </button>
              {ytOutLink}
              {inSiteOff && (
                <button type="button" onClick={retryInSite} data-testid="tentar-no-site" className={cn("flex items-center gap-1 rounded border border-cw-cyan/30 px-2 py-1 font-mono text-[11px] text-cw-cyan hover:bg-cyan-950/50", FOCUS)}>
                  <RefreshCw className="size-3" aria-hidden="true" /> Tentar tocar aqui de novo
                </button>
              )}
            </div>
          )}
          {current.source !== "catalogo" && ytOutLink && <div className="mt-2 flex flex-wrap gap-2">{ytOutLink}</div>}
          {showAlts && alts && alts.key === current.key && (
            <ul className="mt-2 space-y-1 rounded border border-cw-cyan/20 p-2" aria-label="Outras fontes de áudio">
              {alts.list.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => pickAlternative(c)} aria-current={c.id === current.youtubeId ? "true" : undefined} className={cn("flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-cyan-950/40", c.id === current.youtubeId && "bg-cyan-950/60", FOCUS)}>
                    <img src={`https://i.ytimg.com/vi/${c.id}/default.jpg`} alt="" className="h-8 w-12 shrink-0 rounded object-cover" loading="lazy" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-gray-200">{c.title}</span>
                      <span className="block truncate font-mono text-[10px] text-gray-500">{c.channel} • {fmtTime(c.duration) || "?"} • nota {c.score}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lyricsOpen && current.source === "catalogo" && (
            <div id="musica-letra" ref={lyricsRef} className="relative mt-2 max-h-56 overflow-y-auto rounded border border-cw-cyan/20 bg-black/50 p-3 text-center" aria-live="off">
              {!lyrics || lyrics.key !== current.key || lyrics.data === undefined ? null : lyrics.data === null ? (
                <p className="font-mono text-xs text-gray-500">{lyrics.blocked ? "O serviço de letras (LRCLib) não respondeu nesta rede." : "Letra não encontrada para essa música."}</p>
              ) : syncedOk ? (
                lyricData!.synced.map((l, k) => (
                  <p key={k} data-line={k} className={cn("py-0.5 text-sm transition-colors", k === activeLine ? "font-semibold text-cw-cyan" : "text-gray-500")}>
                    {l.text || "♪"}
                  </p>
                ))
              ) : (
                <p className="whitespace-pre-line text-sm text-gray-300">{lyricData?.plain || lyricData?.synced.map((l) => l.text).join("\n")}</p>
              )}
              {(!lyrics || lyrics.key !== current.key || lyrics.data === undefined) && <Loader2 className="mx-auto size-4 animate-spin text-cw-cyan" aria-label="Carregando letra" />}
              <p className="mt-2 font-mono text-[9px] text-gray-600">Letras: LRCLib</p>
            </div>
          )}
          {(current.page || current.license) && (
            <p className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] text-gray-500">
              {current.page && (
                <a href={current.page} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-cw-cyan">
                  Ver na fonte <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              )}
              {current.license && (
                <a href={current.license} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-cw-cyan">
                  Licença <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              )}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="min-w-0">
          <h3 className="mb-2 font-mono text-xs tracking-widest text-gray-400 uppercase">Resultados</h3>
          {results.length === 0 ? (
            <p className="font-mono text-xs text-gray-500">{!config ? "Carregando fontes…" : source === "local" ? "Nenhuma música guardada ainda. Toque em “Adicionar músicas do aparelho” e escolha arquivos de áudio (MP3, M4A, OGG, WAV, FLAC)." : "Faça uma busca para ver as músicas."}</p>
          ) : (
            <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1" aria-label="Resultados da busca">
              {results.map((t, i) => (
                <li key={t.key} className={cn("flex items-center gap-2 rounded px-2 py-1.5 hover:bg-cyan-950/30", current?.key === t.key && "bg-cyan-950/50")}>
                  <button type="button" onClick={() => void choose(t, i)} className={cn("flex min-w-0 flex-1 items-center gap-3 text-left", FOCUS)} aria-label={`Tocar ${t.title}, ${t.artist}`}>
                    {t.artwork ? <img src={t.artwork} alt="" onError={(e) => (e.currentTarget.style.visibility = "hidden")} className="size-10 shrink-0 rounded object-cover" loading="lazy" /> : <span className="grid size-10 shrink-0 place-items-center rounded bg-gray-900"><Music2 className="size-4 text-cw-cyan" aria-hidden="true" /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{t.title}</span>
                      <span className="block truncate font-mono text-[11px] text-gray-400">
                        {t.artist}
                        {t.album && ` • ${t.album}`}
                        {t.archiveItem && " • álbum/gravação: abre as faixas"}
                        {inIndex.has(t.key) && <span className="text-cw-cyan" title="Já está no índice do site: toca a música completa na hora"> • completa</span>}
                      </span>
                    </span>
                    {openingItem === t.key ? <Loader2 className="size-4 animate-spin text-cw-cyan" aria-hidden="true" /> : <span className="font-mono text-[11px] text-gray-500">{fmtTime(t.duration)}</span>}
                  </button>
                  {!t.archiveItem && (
                    <button type="button" onClick={() => addToQueue(t)} aria-label={`Adicionar ${t.title} à fila`} title="Adicionar à fila" className={cn("rounded p-1.5 text-gray-400 hover:text-cw-cyan", FOCUS)}>
                      <ListMusic className="size-4" aria-hidden="true" />
                    </button>
                  )}
                  {t.localId && (
                    <button type="button" onClick={() => void removeSong(t)} aria-label={`Remover ${t.title} do aparelho`} title="Remover do aparelho" className={cn("rounded p-1.5 text-gray-500 hover:text-red-400", FOCUS)}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-mono text-xs tracking-widest text-gray-400 uppercase">Fila ({queue.length})</h3>
            {queue.length > 0 && (
              <button type="button" onClick={() => { haltAll(); setMode(null); setQueue([]); setIndex(-1); }} className={cn("flex items-center gap-1 font-mono text-[11px] text-gray-500 hover:text-red-400", FOCUS)}>
                <Trash2 className="size-3" aria-hidden="true" /> Limpar
              </button>
            )}
          </div>
          {queue.length === 0 ? (
            <p className="font-mono text-xs text-gray-500">A fila começa quando você toca uma música.</p>
          ) : (
            <ol className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
              {queue.map((t, i) => (
                <li key={t.key}>
                  <button type="button" onClick={() => void playAt(queue, i)} aria-current={i === index ? "true" : undefined} className={cn("flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-cyan-950/30", i === index && "bg-cyan-950/60", FOCUS)}>
                    <span className="w-5 font-mono text-[11px] text-gray-500">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-xs", i === index ? "text-cw-cyan" : "text-gray-200")}>{t.title}</span>
                      <span className="block truncate font-mono text-[10px] text-gray-500">{t.artist}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      <details className="mt-4 rounded border border-cw-cyan/20 bg-black/40 p-3" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && !diag && void runDiag()}>
        <summary className={cn("flex cursor-pointer list-none items-center gap-2 font-mono text-xs text-cw-cyan", FOCUS)}>
          <Stethoscope className="size-4" aria-hidden="true" /> Diagnóstico das fontes (o que funciona neste aparelho)
        </summary>
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void runDiag()} disabled={diagRunning || !config} className={cn("flex items-center gap-1 rounded border border-cw-cyan/40 px-2 py-1 font-mono text-[11px] text-cw-cyan hover:bg-cyan-950/50 disabled:opacity-50", FOCUS)}>
              {diagRunning ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-3" aria-hidden="true" />} Testar de novo
            </button>
            {diag && !diagRunning && (
              <button type="button" onClick={() => void copyDiag()} className={cn("flex items-center gap-1 rounded border border-cw-cyan/40 px-2 py-1 font-mono text-[11px] text-cw-cyan hover:bg-cyan-950/50", FOCUS)}>
                <Copy className="size-3" aria-hidden="true" /> Copiar relatório
              </button>
            )}
          </div>
          {diag && (
            <ul className="space-y-1" aria-label="Resultado do diagnóstico" data-testid="diagnostico">
              {diag.map((r) => (
                <li key={r.id} className="flex items-start gap-2 font-mono text-[11px]" data-status={r.status} data-fonte={r.id}>
                  {r.status === "ok" ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" aria-label="funciona" /> : r.status === "falha" ? <CircleX className="mt-0.5 size-3.5 shrink-0 text-red-400" aria-label="falhou" /> : r.status === "desligado" ? <CircleMinus className="mt-0.5 size-3.5 shrink-0 text-gray-500" aria-label="não configurado" /> : <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-cw-cyan" aria-label="testando" />}
                  <span className="min-w-0">
                    <span className="text-gray-200">{r.name}</span> <span className="text-gray-500">— {r.role}</span>
                    <span className={cn("block", r.status === "ok" ? "text-emerald-300/80" : r.status === "falha" ? "text-red-300/80" : "text-gray-500")}>
                      {r.detail}
                      {r.ms !== undefined && ` • ${r.ms} ms`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div ref={diagBoxRef} data-testid="diag-player" aria-label="Player de teste do YouTube" />
        </div>
      </details>
      <p className="mt-4 font-mono text-[10px] text-gray-600">
        Catálogo: dados do iTunes/Deezer; a música completa toca pelo player oficial do YouTube (lógica do Spotube: metadados + busca da mesma gravação). “completa” = já conferida no índice do site, montado pelo GitHub. Internet Archive: acervo público. Do aparelho: seus arquivos, guardados só neste navegador. Cada fonte segue as próprias regras e licenças.
      </p>
    </section>
  );
}
