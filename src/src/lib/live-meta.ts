// Estado do "Tocando agora" recebido em tempo real pelo canal da Triton (SBM).
// O player escreve aqui; o painel "Tocando agora" lê.

import { useSyncExternalStore } from "react";
import type { Track } from "@/lib/now-playing";

export type LiveSource = "off" | "connecting" | "on" | "failed";

export interface LiveMeta {
  stationId: string | null;
  source: LiveSource;
  current: Track | null;
  /** Músicas anteriores recebidas nesta sessão (a mais recente primeiro). */
  history: Track[];
  /** Fim previsto do intervalo comercial em andamento (ms desde 1970), se houver. */
  adUntil: number | null;
}

const EMPTY: LiveMeta = { stationId: null, source: "off", current: null, history: [], adUntil: null };
let state: LiveMeta = EMPTY;
const listeners = new Set<() => void>();

function set(next: LiveMeta) {
  state = next;
  listeners.forEach((l) => l());
}

export const liveMeta = {
  reset(stationId: string | null) {
    set({ ...EMPTY, stationId });
  },
  setSource(stationId: string, source: LiveSource) {
    if (state.stationId !== stationId || state.source === source) return;
    set({ ...state, source });
  },
  setTrack(stationId: string, track: Track) {
    if (state.stationId !== stationId) return;
    const prev = state.current;
    if (prev && prev.title === track.title && prev.artist === track.artist) {
      if (state.adUntil) set({ ...state, adUntil: null });
      return;
    }
    const history = prev ? [prev, ...state.history].slice(0, 4) : state.history;
    set({ ...state, current: track, history, adUntil: null });
  },
  setAd(stationId: string, durationMs: number | undefined) {
    if (state.stationId !== stationId) return;
    set({ ...state, adUntil: Date.now() + (durationMs ?? 60_000) });
  },
};

export function useLiveMeta(): LiveMeta {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}
