import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Station } from "@/data/stations";
import { checkStation, readReport, saveReport, stationCheckReport, type CheckReport, type StationCheck } from "@/lib/stream-health";
import { cn } from "@/lib/utils";

/**
 * Testa todas as rádios do catálogo no próprio aparelho (sem som) e mostra quais tocam.
 * Feito para comparar ambientes: computador de casa, celular, área de trabalho virtual (AVD),
 * rede da empresa. O resultado fica só neste navegador.
 */

const PARALLEL = 3;
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cw-yellow";

const placeOf = (s: Station) => s.place ?? (s.city === "sp" ? "São Paulo" : s.city === "rj" ? "Rio de Janeiro" : s.city === "bh" ? "Belo Horizonte" : "Web");

export function StationCheckDialog({
  open,
  onOpenChange,
  stations,
  hidden,
  onHide,
  busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stations: Station[];
  hidden: string[];
  onHide: (ids: string[]) => void;
  busy: boolean;
}) {
  const [report, setReport] = useState<CheckReport | null>(() => readReport());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [copyText, setCopyText] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => () => void (cancelRef.current = true), []);

  const run = async () => {
    cancelRef.current = false;
    setRunning(true);
    setProgress(0);
    setCopyMsg(null);
    setCopyText(null);
    const results: Record<string, StationCheck> = {};
    const queue = [...stations];
    let done = 0;
    const worker = async () => {
      for (;;) {
        if (cancelRef.current) return;
        const s = queue.shift();
        if (!s) return;
        results[s.id] = await checkStation(s);
        done++;
        setProgress(done);
        setReport({ at: Date.now(), results: { ...results } });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    const final = { at: Date.now(), results };
    if (!cancelRef.current) saveReport(final);
    setReport(final);
    setRunning(false);
  };

  const failed = useMemo(() => (report ? stations.filter((s) => report.results[s.id] && !report.results[s.id]!.ok) : []), [report, stations]);
  const okCount = report ? stations.filter((s) => report.results[s.id]?.ok).length : 0;
  const tested = report ? stations.filter((s) => report.results[s.id]).length : 0;
  /** Resultado separado: abas principais (StreamTheWorld) e aba "Fora da empresa" (que não toca na rede da AVD). */
  const split = useMemo(() => {
    if (!report) return null;
    const count = (outside: boolean) => {
      const list = stations.filter((s) => !!s.outside === outside && report.results[s.id]);
      return { ok: list.filter((s) => report.results[s.id]!.ok).length, total: list.length };
    };
    return { main: count(false), fora: count(true) };
  }, [report, stations]);

  /** Copia o resultado (com o servidor de cada rádio) para colar na conversa de suporte. */
  const copyReport = async () => {
    if (!report) return;
    const text = stationCheckReport(stations, report);
    try {
      await navigator.clipboard.writeText(text);
      setCopyText(null);
      setCopyMsg("Resultado copiado. Cole na conversa para eu ver quais servidores passam nesta rede.");
    } catch {
      // Navegador sem acesso à área de transferência: mostra o texto para copiar à mão.
      setCopyText(text);
      setCopyMsg("Não deu para copiar sozinho: selecione o texto abaixo e copie (Ctrl+C).");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) cancelRef.current = true;
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-hidden border-cw-yellow/40 bg-[#07070c] text-gray-100 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-cyber tracking-widest text-cw-yellow">TESTE DE RÁDIOS NESTE APARELHO</DialogTitle>
          <DialogDescription className="text-gray-300">
            Toca cada rádio por alguns segundos, sem som, e mostra quais funcionam aqui. Faça o teste em cada lugar onde você usa o site
            (computador, celular, área de trabalho virtual / AVD): a rede de uma empresa pode bloquear rádios que tocam em casa.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <button
            type="button"
            disabled={running}
            onClick={run}
            className={cn("rounded border border-cw-yellow/60 bg-cw-yellow/15 px-3 py-1.5 font-bold text-cw-yellow hover:bg-cw-yellow hover:text-black disabled:opacity-50", FOCUS)}
          >
            {running ? `Testando… ${progress}/${stations.length}` : report ? "Testar de novo" : `Testar ${stations.length} rádios`}
          </button>
          {running && (
            <button type="button" onClick={() => (cancelRef.current = true)} className={cn("rounded border border-gray-600 px-3 py-1.5 text-gray-300", FOCUS)}>
              Parar
            </button>
          )}
          {!running && failed.length > 0 && (
            <button
              type="button"
              onClick={() => onHide(failed.map((s) => s.id))}
              className={cn("rounded border border-cw-red/60 px-3 py-1.5 text-cw-red hover:bg-cw-red/10", FOCUS)}
            >
              Ocultar as {failed.length} que não tocaram
            </button>
          )}
          {!running && report && tested > 0 && (
            <button
              type="button"
              onClick={copyReport}
              data-testid="copiar-teste-radios"
              className={cn("rounded border border-cw-cyan/60 px-3 py-1.5 text-cw-cyan hover:bg-cw-cyan/10", FOCUS)}
            >
              Copiar resultado
            </button>
          )}
          {hidden.length > 0 && !running && (
            <button type="button" onClick={() => onHide([])} className={cn("rounded border border-gray-600 px-3 py-1.5 text-gray-300", FOCUS)}>
              Mostrar todas ({hidden.length} ocultas)
            </button>
          )}
        </div>
        {busy && !running && <p className="font-mono text-[11px] text-gray-400">A rádio que está tocando continua tocando durante o teste.</p>}
        {copyMsg && (
          <p role="status" className="font-mono text-[11px] text-cw-cyan">
            {copyMsg}
          </p>
        )}
        {copyText && (
          <textarea
            readOnly
            value={copyText}
            aria-label="Resultado do teste das rádios"
            onFocus={(e) => e.currentTarget.select()}
            className="h-28 w-full resize-none rounded border border-gray-700 bg-black/70 p-2 font-mono text-[10px] text-gray-200"
          />
        )}

        {report && (
          <p role="status" className="font-mono text-xs text-gray-300">
            <span className="text-cw-cyan">{okCount} tocaram</span> • <span className="text-cw-red">{failed.length} não tocaram</span> • {tested}/
            {stations.length} testadas • {new Date(report.at).toLocaleString("pt-BR")}
          </p>
        )}
        {split && split.fora.total > 0 && (
          <p data-testid="resumo-abas" className="font-mono text-[11px] text-gray-400">
            Abas principais: <span className="text-cw-cyan">{split.main.ok} de {split.main.total} tocaram</span> • Aba Fora da empresa:{" "}
            {split.fora.ok} de {split.fora.total} (na rede da empresa é normal não tocarem)
          </p>
        )}

        {report && (
          <ul className="cw-scrollbar max-h-[45vh] space-y-1 overflow-y-auto pr-1 font-mono text-xs">
            {[...stations]
              .filter((s) => report.results[s.id])
              .sort((a, b) => Number(report.results[a.id]!.ok) - Number(report.results[b.id]!.ok))
              .map((s) => {
                const r = report.results[s.id]!;
                // "erro do navegador; motivo dado pela StreamTheWorld": o motivo vai numa linha própria.
                const [error, reason] = r.ok ? ["", ""] : r.error.split(/;\s(.+)/, 2);
                return (
                  <li key={s.id} className="rounded border border-gray-800 bg-black/50 px-2 py-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">
                        <span className={r.ok ? "text-cw-cyan" : "text-cw-red"}>{r.ok ? "OK " : "FALHOU "}</span>
                        {s.name} <span className="text-gray-500">• {placeOf(s)}{s.outside ? " • fora da empresa" : ""}{s.extra ? " • descoberta" : ""}</span>
                      </span>
                      <span className="max-w-[45%] shrink-0 truncate text-right text-gray-400" title={r.ok ? undefined : error}>
                        {r.ok ? `${(r.ms / 1000).toFixed(1)} s` : error}
                      </span>
                    </div>
                    {reason && <p className="mt-0.5 text-[11px] leading-snug text-cw-yellow/90">{reason}</p>}
                  </li>
                );
              })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
