import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { subscribeViz, useVizLive } from "@/lib/audio-fx";

const REDUCED_MOTION = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Detalhes dos painéis chanfrados: cantoneiras nos cantos retos e um traço neon
 * acompanhando os dois cantos cortados (o painel precisa ser `relative`).
 */
export function Corners({ tone = "yellow" }: { tone?: "yellow" | "cyan" }) {
  const color = tone === "yellow" ? "#fcee0a" : "#00f0ff";
  const diagonal = {
    background: `linear-gradient(to top right, transparent calc(50% - 1.5px), ${color} calc(50% - 1.5px), ${color} calc(50% + 1.5px), transparent calc(50% + 1.5px))`,
  };
  return (
    <>
      <span aria-hidden="true" className={cn("pointer-events-none absolute top-0 left-0 size-3 border-t-2 border-l-2", tone === "yellow" ? "border-cw-yellow" : "border-cw-cyan")} />
      <span aria-hidden="true" className={cn("pointer-events-none absolute right-0 bottom-0 size-3 border-r-2 border-b-2", tone === "yellow" ? "border-cw-cyan" : "border-cw-yellow")} />
      <span aria-hidden="true" className="pointer-events-none absolute top-0 right-0 size-[22px]" style={diagonal} />
      <span aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 size-[22px]" style={diagonal} />
    </>
  );
}

/** Relógio do painel (HH:MM:SS), atualizado a cada segundo. */
export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <time aria-hidden="true" dateTime={now.toISOString()} className="tabular-nums">
      {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </time>
  );
}

const BARS = Array.from({ length: 40 }, (_, i) => ({
  duration: 0.55 + ((i * 37) % 11) / 11 * 0.9,
  delay: -((i * 53) % 13) / 13,
  rest: 6 + ((i * 29) % 7) * 2,
}));

/**
 * Espectro de barras. Quando a rádio libera a leitura do áudio, cada barra mostra a energia
 * de uma faixa de frequência do som que está tocando; senão, é uma animação decorativa.
 */
export function Spectrum({ on }: { on: boolean }) {
  const live = useVizLive() && on && !REDUCED_MOTION;
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    if (!live) return;
    return subscribeViz((f) => {
      for (let i = 0; i < bars.current.length; i++) {
        const el = bars.current[i];
        if (el) el.style.transform = `scaleY(${Math.max(0.03, f.bands[i] ?? 0).toFixed(3)})`;
      }
    });
  }, [live]);
  return (
    <div
      aria-hidden="true"
      className="flex h-16 items-end gap-[3px] overflow-hidden rounded border border-cw-yellow/20 bg-black/90 px-2 pt-2 sm:h-20"
    >
      {BARS.map((b, i) => (
        <span
          key={live ? `l${i}` : `d${i}`}
          ref={(el) => {
            bars.current[i] = el;
          }}
          className={cn(
            "flex-1 rounded-t-[1px] bg-linear-to-t from-cw-yellow via-cw-yellow to-cw-cyan",
            live ? "h-full origin-bottom" : on ? "eq-bar h-full" : "opacity-40",
          )}
          style={
            live
              ? { transform: "scaleY(0.03)" }
              : on
                ? { animationDuration: `${b.duration}s`, animationDelay: `${b.delay}s` }
                : { height: `${b.rest}%` }
          }
        />
      ))}
    </div>
  );
}

const LEDS = 12;

/** Medidor de nível em LEDs: segue o volume real do canal quando a rádio libera a leitura do áudio; senão é decorativo. */
export function VuMeter({ label, channel, on, tone }: { label: string; channel: string; on: boolean; tone: "cyan" | "magenta" }) {
  const live = useVizLive() && on && !REDUCED_MOTION;
  const mask = useRef<HTMLSpanElement>(null);
  const side = label === "R" ? "right" : "left";
  useEffect(() => {
    if (!live) return;
    return subscribeViz((f) => {
      if (mask.current) mask.current.style.height = `${((1 - f[side]) * 100).toFixed(1)}%`;
    });
  }, [live, side]);
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-36 flex-col justify-between rounded border bg-black/80 p-2",
        tone === "cyan" ? "border-cw-yellow/40" : "border-cw-cyan/40",
      )}
    >
      <div
        className={cn(
          "flex justify-between font-mono text-[10px] font-bold",
          tone === "cyan" ? "text-cw-yellow" : "text-cw-cyan",
        )}
      >
        <span>{label}</span>
        <span>PEAK</span>
      </div>
      <div className="relative my-2 flex h-full flex-col-reverse gap-[3px] px-1">
        {Array.from({ length: LEDS }, (_, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-[1px]",
              i < 7 ? "bg-cw-yellow shadow-[0_0_6px_rgba(252,238,10,0.6)]" : i < 10 ? "bg-cw-cyan shadow-[0_0_6px_rgba(0,240,255,0.6)]" : "bg-cw-red shadow-[0_0_6px_rgba(255,0,60,0.6)]",
            )}
          />
        ))}
        {/* Cobre os LEDs "apagados"; a altura animada simula o nível do som. */}
        <span
          key={live ? "live" : "demo"}
          ref={mask}
          className="vu-mask absolute inset-x-0 top-0 bg-black/85"
          data-on={live ? "live" : on ? "true" : "false"}
          style={
            live
              ? { height: "100%" }
              : { animationDuration: tone === "cyan" ? "1.15s" : "1.45s", animationDelay: tone === "cyan" ? "-0.2s" : "-0.7s" }
          }
        />
      </div>
      <div className="text-center font-mono text-[10px] text-gray-400">{channel}</div>
    </div>
  );
}
