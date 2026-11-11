import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import type { Station } from "@/data/stations";
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
} from "@/lib/now-playing";
import { safeUrl } from "@/lib/safe-url";

const POLL_MS = 20_000;

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-300">{children}</p>;
}

export function NowPlayingPanel({ station, active }: { station: Station | null; active: boolean }) {
  const mount = station ? tritonMount(station.streamUrl) : null;

  const np = useQuery({
    queryKey: ["now-playing", mount],
    queryFn: ({ signal }) => fetchNowPlaying(mount as string, signal),
    enabled: !!mount && active,
    refetchInterval: active ? POLL_MS : false,
    staleTime: POLL_MS - 5_000,
    retry: 1,
  });

  const tracks = np.data ?? [];
  const latest = tracks[0];
  const isSong = !!latest?.artist;
  const onAir = latest ? isOnAirNow(latest) : false;
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

  const history = tracks.slice(1, 5);
  const wikiUrl = safeUrl(summary.data?.url);

  let body: ReactNode;
  if (!mount) {
    body = <Note>Esta rádio não informa o nome da música que está tocando.</Note>;
  } else if (!active) {
    body = <Note>Aperte o play para ver a música que está tocando e as informações da banda.</Note>;
  } else if (np.isPending) {
    body = <Note>Buscando a música que está tocando…</Note>;
  } else if (np.isError && tracks.length === 0) {
    body = <Note>Não foi possível obter o nome da música desta rádio agora. Tentaremos de novo em instantes.</Note>;
  } else if (!latest) {
    body = <Note>A rádio não está informando a música agora (pode ser um programa falado, notícias ou intervalo).</Note>;
  } else {
    body = (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div aria-live="polite" aria-atomic="true">
            {!onAir && (
              <p className="mb-1 text-xs text-zinc-300">
                Última música informada pela rádio — agora pode estar no ar um programa falado ou intervalo.
              </p>
            )}
            <p className="font-serif text-2xl leading-tight font-semibold text-zinc-50 md:text-3xl">{title}</p>
            {isSong ? (
              <p className="mt-1 text-lg text-amber-200">{artist}</p>
            ) : (
              <p className="mt-1 text-sm text-zinc-300">Programa ou vinheta, sem dados de música.</p>
            )}
          </div>

          {facts.length > 0 && (
            <dl className="mt-4 flex flex-wrap gap-x-7 gap-y-3 text-sm">
              {facts.map((f) => (
                <div key={f.label} className="min-w-0">
                  <dt className="text-xs text-zinc-400">{f.label}</dt>
                  <dd className="font-medium text-zinc-100">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {isSong && details.isFetching && !details.data && (
            <p className="mt-3 text-xs text-zinc-400">Buscando álbum, ano e gênero…</p>
          )}

          {history.length > 0 && (
            <div className="mt-5">
              <h4 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Tocou antes</h4>
              <ol className="mt-2 divide-y divide-zinc-800/80 text-sm">
                {history.map((t, i) => (
                  <li key={`${t.startedAt ?? i}-${t.title}`} className="flex gap-3 py-1.5">
                    <span className="w-12 shrink-0 font-mono text-xs leading-5 text-zinc-400 tabular-nums">
                      {t.startedAt ? fmtClock(t.startedAt) : "—"}
                    </span>
                    <span className="min-w-0 truncate text-zinc-200">
                      {tidyName(t.title)}
                      {t.artist && <span className="text-zinc-400"> — {tidyName(t.artist)}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {isSong && (
          <aside aria-labelledby="sobre-banda" className="min-w-0 rounded-2xl bg-zinc-900/70 p-4 ring-1 ring-zinc-800">
            <h4 id="sobre-banda" className="text-sm font-semibold text-zinc-50">
              Sobre {summary.data?.title ?? artist}
            </h4>
            {!summary.data && (summary.isPending || summary.isFetching) && (
              <p className="mt-2 text-sm text-zinc-300">Buscando informações da banda…</p>
            )}
            {summary.isError && <p className="mt-2 text-sm text-zinc-300">Não foi possível buscar informações da banda agora.</p>}
            {summary.isSuccess && !summary.data && (
              <p className="mt-2 text-sm text-zinc-300">Não encontramos um resumo desta banda ou artista na Wikipédia.</p>
            )}
            {summary.data && (
              <>
                {summary.data.description && (
                  <p className="mt-1 text-xs text-amber-200">{summary.data.description}</p>
                )}
                <p className="mt-2 line-clamp-6 text-sm leading-relaxed text-zinc-200">{summary.data.extract}</p>
                {wikiUrl && (
                  <a
                    href={wikiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 rounded text-sm font-medium text-amber-300 underline underline-offset-4 hover:text-amber-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
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
    <section aria-labelledby="tocando-agora" className="border-t border-zinc-800 px-5 py-5 md:px-7">
      <h3 id="tocando-agora" className="mb-3 text-xs font-semibold tracking-widest text-amber-300 uppercase">
        Tocando agora
      </h3>
      {body}
    </section>
  );
}
