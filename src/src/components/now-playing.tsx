import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { streamUrlOf, type Station } from "@/data/stations";
import {
  fetchArtistSummary,
  fetchNowPlaying,
  fetchSongDetails,
  fmtClock,
  fmtDuration,
  isOnAirNow,
  mainArtist,
  tidyName,
  tritonMount,
  type Track,
} from "@/lib/now-playing";
import { safeUrl } from "@/lib/safe-url";
import { useLiveMeta } from "@/lib/live-meta";
import { Corners } from "@/components/cyber";

const POLL_MS = 20_000;
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function Note({ children }: { children: ReactNode }) {
  return <p className="font-mono text-sm text-gray-300">{children}</p>;
}

export function NowPlayingPanel({ station, active }: { station: Station | null; active: boolean }) {
  const mount = station ? tritonMount(streamUrlOf(station)) : null;
  const live = useLiveMeta();
  const liveHere = station && live.stationId === station.id ? live : null;
  const liveTrack = active ? (liveHere?.current ?? null) : null;

  const np = useQuery({
    queryKey: ["now-playing", mount],
    queryFn: ({ signal }) => fetchNowPlaying(mount as string, signal),
    enabled: !!mount && active,
    refetchInterval: active ? POLL_MS : false,
    staleTime: POLL_MS - 5_000,
    retry: 1,
  });

  const tracks = np.data ?? [];
  // Prioridade: música avisada em tempo real pelo canal da rádio; depois, o histórico público.
  const latest = liveTrack ?? tracks[0];
  const fromLive = !!liveTrack;
  const isSong = !!latest?.artist;
  const onAir = fromLive ? true : latest ? isOnAirNow(latest) : false;
  const inAd = !!liveHere?.adUntil && liveHere.adUntil > Date.now();
  const sourceLabel = fromLive ? "Tempo real" : tracks.length > 0 ? "Histórico Triton" : liveHere?.source === "on" ? "Canal conectado" : "";
  const rawArtist = latest?.artist ?? "";
  const rawTitle = latest?.title ?? "";

  const details = useQuery({
    queryKey: ["song-details", rawArtist, rawTitle],
    queryFn: ({ signal }) => fetchSongDetails(rawArtist, rawTitle, signal),
    enabled: active && isSong,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: 0,
  });
  const detailsSettled = details.isSuccess || details.isError;

  const title = details.data?.title ?? tidyName(rawTitle);
  const artist = details.data?.artist ?? tidyName(rawArtist);
  const lookupArtist = details.data?.artist ?? tidyName(mainArtist(rawArtist));

  const summary = useQuery({
    queryKey: ["artist-summary", lookupArtist],
    queryFn: ({ signal }) => fetchArtistSummary(lookupArtist, signal),
    enabled: active && isSong && detailsSettled && !!lookupArtist,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: 0,
  });

  // Mostra a música também nos controles de mídia do sistema (tela de bloqueio, teclado).
  useEffect(() => {
    if (!active || !station || !isSong || !onAir) return;
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album: station.name });
  }, [active, station, isSong, onAir, title, artist]);

  if (!station) return null;

  const album = details.data?.album ?? (latest?.album ? tidyName(latest.album) : undefined);
  const durationMs = details.data?.durationMs ?? latest?.durationMs;
  const facts: { label: string; value: string }[] = [];
  if (album) facts.push({ label: "Álbum", value: album });
  if (details.data?.year) facts.push({ label: "Ano", value: details.data.year });
  if (details.data?.genre) facts.push({ label: "Gênero", value: details.data.genre });
  if (durationMs) facts.push({ label: "Duração", value: fmtDuration(durationMs) });
  if (latest?.startedAt) facts.push({ label: onAir ? "Começou às" : "Tocou às", value: fmtClock(latest.startedAt) });

  const sameAs = (t: Track) => !!latest && norm(t.title) === norm(latest.title) && norm(t.artist) === norm(latest.artist);
  const history = fromLive
    ? (tracks.length > 0 ? tracks.filter((t) => !sameAs(t)) : (liveHere?.history ?? [])).slice(0, 4)
    : tracks.slice(1, 5);
  const wikiUrl = safeUrl(summary.data?.url);

  let body: ReactNode;
  if (!mount) {
    body = <Note>Esta rádio não informa o nome da música que está tocando.</Note>;
  } else if (!active) {
    body = <Note>Aperte o play para ver a música que está tocando e as informações da banda.</Note>;
  } else if (!latest && inAd) {
    body = <Note>Intervalo comercial. A próxima música aparece aqui assim que entrar no ar.</Note>;
  } else if (!latest && (np.isPending || liveHere?.source === "connecting")) {
    body = <Note>Buscando a música que está tocando…</Note>;
  } else if (!latest && np.isError && liveHere?.source !== "on") {
    body = <Note>Não foi possível obter o nome da música desta rádio agora. Tentaremos de novo em instantes.</Note>;
  } else if (!latest) {
    body = <Note>A rádio não está informando a música agora (pode ser um programa falado, notícias, futebol ou intervalo).</Note>;
  } else {
    body = (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div aria-live="polite" aria-atomic="true">
            {!onAir && (
              <p className="mb-1 font-mono text-xs text-cw-red/90">
                Última música informada pela rádio — agora pode estar no ar um programa falado ou intervalo.
              </p>
            )}
            <p className="font-cyber text-xl leading-tight font-bold tracking-wide text-white md:text-2xl">{title}</p>
            {isSong ? (
              <p className="glow-cyan mt-1.5 text-lg font-semibold text-cw-cyan">{artist}</p>
            ) : (
              <p className="mt-1 font-mono text-sm text-gray-300">Programa ou vinheta, sem dados de música.</p>
            )}
          </div>

          {facts.length > 0 && (
            <dl className="mt-4 flex flex-wrap gap-x-7 gap-y-3 text-sm">
              {facts.map((f) => (
                <div key={f.label} className="min-w-0">
                  <dt className="font-mono text-[11px] tracking-wider text-cw-yellow/80 uppercase">{f.label}</dt>
                  <dd className="font-medium text-gray-100">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {isSong && details.isFetching && !details.data && (
            <p className="mt-3 font-mono text-xs text-gray-400">Buscando álbum, ano e gênero…</p>
          )}

          {history.length > 0 && (
            <div className="mt-5">
              <h4 className="font-mono text-[11px] tracking-widest text-cw-yellow uppercase">Tocou antes</h4>
              <ol className="mt-2 divide-y divide-cw-yellow/10 text-sm">
                {history.map((t, i) => (
                  <li key={`${t.startedAt ?? i}-${t.title}`} className="flex gap-3 py-1.5">
                    <span className="w-12 shrink-0 font-mono text-xs leading-5 text-cw-cyan tabular-nums">
                      {t.startedAt ? fmtClock(t.startedAt) : "—"}
                    </span>
                    <span className="min-w-0 truncate text-gray-200">
                      {tidyName(t.title)}
                      {t.artist && <span className="text-gray-400"> — {tidyName(t.artist)}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {isSong && (
          <aside aria-labelledby="sobre-banda" className="min-w-0 rounded-lg border border-cw-yellow/30 bg-black/60 p-4">
            <h4 id="sobre-banda" className="font-cyber text-sm font-bold tracking-wide text-cw-yellow">
              Sobre {summary.data?.title ?? artist}
            </h4>
            {!summary.data && (summary.isPending || summary.isFetching) && (
              <p className="mt-2 font-mono text-sm text-gray-300">Buscando informações da banda…</p>
            )}
            {summary.isError && <p className="mt-2 font-mono text-sm text-gray-300">Não foi possível buscar informações da banda agora.</p>}
            {summary.isSuccess && !summary.data && (
              <p className="mt-2 font-mono text-sm text-gray-300">Não encontramos um resumo desta banda ou artista na Wikipédia.</p>
            )}
            {summary.data && (
              <>
                {summary.data.description && (
                  <p className="mt-1 font-mono text-xs text-cw-cyan">{summary.data.description}</p>
                )}
                <p className="mt-2 line-clamp-6 text-sm leading-relaxed text-gray-200">{summary.data.extract}</p>
                {wikiUrl && (
                  <a
                    href={wikiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 rounded font-mono text-sm text-cw-yellow underline underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cw-yellow"
                  >
                    Ler mais na Wikipédia{summary.data.lang === "en" ? " (em inglês)" : ""}
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                    <span className="sr-only">(abre em nova aba)</span>
                  </a>
                )}
              </>
            )}
          </aside>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby="tocando-agora" className="cw-glass-cyan relative p-4 sm:p-6">
      <Corners tone="cyan" />
      <h2
        id="tocando-agora"
        className="mb-3 flex items-center gap-2 border-b border-cw-cyan/30 pb-2 font-cyber text-xs font-bold tracking-widest text-cw-cyan uppercase"
      >
        <span aria-hidden="true" className={active ? "size-2 rounded-sm bg-cw-cyan motion-safe:animate-pulse" : "size-2 rounded-sm bg-gray-600"} />
        Tocando agora
        {active && sourceLabel && (
          <span className="ml-auto font-mono text-[10px] font-normal tracking-wider text-gray-400">FONTE: {sourceLabel}</span>
        )}
      </h2>
      {body}
    </section>
  );
}
