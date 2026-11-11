import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#sintonizador"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Ir para o sintonizador
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 md:px-6">
          <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
            <rect width="32" height="32" rx="8" className="fill-zinc-950" />
            <circle cx="16" cy="18" r="2.6" className="fill-amber-300" />
            <path d="M11 13.5a7 7 0 0 1 10 0M8.2 10.6a11 11 0 0 1 15.6 0" fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-amber-300" />
            <path d="M16 20.5V26" strokeWidth="2" strokeLinecap="round" className="stroke-zinc-300" />
          </svg>
          <span className="text-base font-semibold tracking-tight">Radio Ao vivo AVD</span>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t">
        <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-muted-foreground md:px-6">
          As transmissões e marcas pertencem às respectivas emissoras. Este site apenas toca os streams públicos que
          elas disponibilizam; uma rádio pode sair do ar ou mudar de endereço sem aviso.
        </p>
      </footer>
      <Toaster />
    </div>
  );
}
