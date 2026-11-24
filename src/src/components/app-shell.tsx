import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

/** Moldura do site: atalho de acessibilidade, conteúdo (cabeçalho + página) e rodapé. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <div aria-hidden="true" className="cw-logo-bg" />
      <a
        href="#sintonizador"
        className="sr-only z-50 rounded bg-cw-yellow px-3 py-2 font-mono text-sm font-bold text-black focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Ir para o sintonizador
      </a>
      {children}
      <footer className="bg-cw-black">
        <div aria-hidden="true" className="cw-hazard h-1 w-full opacity-60" />
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-4 font-mono text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <p>
            <span className="text-cw-yellow">CYBERWAVE RADIO</span> • StreamTheWorld Powered
          </p>
          <p className="max-w-xl sm:text-right">
            As transmissões e marcas pertencem às respectivas emissoras. Este site apenas toca os streams públicos que elas
            disponibilizam; uma rádio pode sair do ar ou mudar de endereço sem aviso.
          </p>
        </div>
      </footer>
      <Toaster />
    </div>
  );
}
