// Player oficial do YouTube: endereço do player, significado dos erros, link para ouvir no próprio
// YouTube e o teste de reprodução de verdade usado pelo "Diagnóstico das fontes".

const VIDEO = /^[\w-]{11}$/;

/** Endereço do player oficial (iframe) com a identificação do site que o YouTube exige. */
export function embedSrc(host: string, id: string, opts: { mute?: boolean } = {}): string {
  const p = new URLSearchParams({ autoplay: "1", enablejsapi: "1", playsinline: "1", origin: location.origin, widget_referrer: location.href.split("#")[0] });
  if (opts.mute) p.set("mute", "1");
  return `https://${host}/embed/${id}?${p}`;
}

/** Erros que dependem do navegador/rede (não do vídeo): trocar de vídeo não adianta. */
export const YT_ENV_ERRORS = new Set([152, 153]);

/** Erros em que o YouTube recusou tocar o vídeo dentro do site. */
export const YT_REFUSALS = new Set([101, 150, 152, 153]);

/**
 * Vídeos de teste sem música (o 1º é o exemplo da documentação do player do YouTube). Se nem eles tocam
 * dentro do site, a recusa é da rede ou do navegador — não da gravadora de uma música.
 */
export const CONTROL_VIDEOS = ["M7lc1UVf-VE", "jNQXAC9IVRw"];

/** O que cada código de erro do player do YouTube quer dizer, em linguagem simples. */
export function ytErrorText(code: number): string {
  switch (code) {
    case 2:
      return "erro 2: endereço do vídeo inválido";
    case 5:
      return "erro 5: o navegador não conseguiu tocar o vídeo";
    case 100:
      return "erro 100: vídeo removido ou privado";
    case 101:
    case 150:
      return `erro ${code}: o YouTube não liberou este vídeo dentro de outros sites`;
    case 152:
    case 153:
      return `erro ${code}: o endereço do site não chegou ao YouTube (bloqueado pelo navegador, por extensão ou pela rede)`;
    default:
      return `erro ${code}`;
  }
}

/** Busca da música no próprio YouTube (para quando o site não tem o vídeo dela). */
export function youtubeSearchUrl(artist: string, title: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${title}`.trim())}`;
}

/** Link para ouvir no próprio site do YouTube: um vídeo, ou vários em sequência (lista temporária, até 50). */
export function youtubeListUrl(ids: string[]): string | null {
  const list = [...new Set(ids.filter((id) => VIDEO.test(id)))].slice(0, 50);
  if (!list.length) return null;
  if (list.length === 1) return `https://www.youtube.com/watch?v=${list[0]}`;
  return `https://www.youtube.com/watch_videos?video_ids=${list.join(",")}`;
}

export interface PlaybackResult {
  ok: boolean;
  /** O player respondeu (abriu)? */
  heard: boolean;
  code?: number;
  detail: string;
}

export interface PlaybackTestOptions {
  /** Teste escondido (o ouvinte não vê o quadro); some ao terminar. */
  hidden?: boolean;
  /** Considera aprovado se o player abrir e não recusar o vídeo neste tempo (ms), mesmo sem começar a tocar. */
  okWhenReadyMs?: number;
}

/**
 * Toca alguns segundos de um vídeo, sem som, num player de teste dentro de `box` e diz se tocou de verdade.
 * Se falhar, o quadro fica na tela para o ouvinte ver a mensagem do próprio YouTube.
 */
export function playbackTest(box: HTMLElement, host: string, videoId: string, caption: string, ms = 15_000, opts: PlaybackTestOptions = {}): Promise<PlaybackResult> {
  return new Promise((resolve) => {
    const wrap = document.createElement("figure");
    wrap.className = "mt-2";
    wrap.dataset.teste = videoId;
    if (opts.hidden) {
      wrap.setAttribute("aria-hidden", "true");
      wrap.style.cssText = "position:fixed;left:0;bottom:0;width:356px;height:200px;margin:0;opacity:0;pointer-events:none;z-index:-1;overflow:hidden";
    }
    const cap = document.createElement("figcaption");
    cap.className = "mb-1 font-mono text-[10px] text-gray-400";
    cap.textContent = `${caption}: testando…`;
    const f = document.createElement("iframe");
    f.title = `Teste do YouTube: ${caption}`;
    f.allow = "autoplay; encrypted-media";
    f.referrerPolicy = "strict-origin-when-cross-origin";
    f.style.cssText = opts.hidden ? "display:block;width:356px;height:200px;border:0" : "display:block;width:100%;max-width:356px;aspect-ratio:16/9;border:0;border-radius:4px;background:#000";
    f.src = embedSrc(host, videoId, { mute: true });
    wrap.append(cap, f);
    box.append(wrap);

    let heard = false;
    let done = false;
    let maxT = 0;
    let tries = 0;
    const post = (o: Record<string, unknown>) => f.contentWindow?.postMessage(JSON.stringify({ ...o, id: 1, channel: "widget" }), "*");
    const cmd = (func: string, args: unknown[] = []) => post({ event: "command", func, args });
    const finish = (r: PlaybackResult) => {
      if (done) return;
      done = true;
      window.clearInterval(hs);
      window.clearTimeout(to);
      if (readyTimer) window.clearTimeout(readyTimer);
      window.removeEventListener("message", onMsg);
      if (r.ok || opts.hidden) {
        cmd("pauseVideo");
        wrap.remove();
      } else cap.textContent = `${caption}: ${r.detail}. O que o YouTube mostrou:`;
      resolve(r);
    };
    let readyTimer: number | null = null;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== f.contentWindow) return;
      let d: { event?: string; info?: unknown };
      try {
        d = JSON.parse(String(e.data)) as typeof d;
      } catch {
        return;
      }
      if (!heard) {
        heard = true;
        for (const ev of ["onReady", "onStateChange", "onError"]) cmd("addEventListener", [ev]);
        cmd("mute");
        cmd("playVideo");
        if (opts.okWhenReadyMs) readyTimer = window.setTimeout(() => finish({ ok: true, heard: true, detail: "o player abriu sem recusar o vídeo" }), opts.okWhenReadyMs);
      }
      if (d.event === "onError") {
        const code = Number(d.info);
        finish({ ok: false, heard, code, detail: ytErrorText(code) });
        return;
      }
      const info = (d.info && typeof d.info === "object" ? d.info : {}) as { currentTime?: number };
      if (typeof info.currentTime === "number") maxT = Math.max(maxT, info.currentTime);
      if (maxT >= 1.5) finish({ ok: true, heard, detail: "tocou de verdade" });
    };
    window.addEventListener("message", onMsg);
    // Aperto de mão do IFrame API: repete "listening" até o player responder.
    const hs = window.setInterval(() => {
      if (!heard && ++tries <= 40) post({ event: "listening" });
    }, 400);
    f.addEventListener("load", () => post({ event: "listening" }));
    const to = window.setTimeout(
      () =>
        finish(
          heard
            ? { ok: false, heard, detail: "o player abriu, mas o vídeo não começou (o YouTube pode ter pedido login ou o servidor de vídeo está bloqueado nesta rede)" }
            : { ok: false, heard, detail: "o player do YouTube não respondeu nesta rede" },
        ),
      ms,
    );
  });
}

// ---------------------------------------------------------------- o YouTube toca dentro do site aqui?
export interface EmbedVerdict {
  /** "ok" = o vídeo de teste tocou dentro do site; "recusa" = o YouTube recusou até o vídeo de teste. */
  v: "ok" | "recusa";
  code?: number;
  em: number;
}
const EMBED_KEY = "musica.yt-embed";
const VERDICT_TTL = 6 * 3600_000;

/** Resultado recente (até 6 h) do teste com o vídeo sem música, neste navegador. */
export function embedVerdict(): EmbedVerdict | null {
  try {
    const v = JSON.parse(localStorage.getItem(EMBED_KEY) || "null") as EmbedVerdict | null;
    return v && (v.v === "ok" || v.v === "recusa") && Date.now() - v.em < VERDICT_TTL ? v : null;
  } catch {
    return null;
  }
}

export function saveEmbedVerdict(v: EmbedVerdict | null) {
  try {
    if (v) localStorage.setItem(EMBED_KEY, JSON.stringify(v));
    else localStorage.removeItem(EMBED_KEY);
  } catch {
    /* sem armazenamento */
  }
}

/** Converte o resultado do teste com o vídeo sem música em veredito (null = sem conclusão). */
export function verdictFrom(r: PlaybackResult | null): EmbedVerdict | null {
  if (!r) return null;
  if (r.ok) return { v: "ok", em: Date.now() };
  if (r.code !== undefined && YT_REFUSALS.has(r.code)) return { v: "recusa", code: r.code, em: Date.now() };
  return null;
}

/** Testa, sem mostrar nada, se o YouTube toca um vídeo sem música dentro do site neste navegador/rede. */
export async function checkEmbedsHere(box: HTMLElement, host: string): Promise<EmbedVerdict | null> {
  for (const id of CONTROL_VIDEOS) {
    const r = await playbackTest(box, host, id, "teste", 12_000, { hidden: true, okWhenReadyMs: 5000 });
    if (r.code === 100 || r.code === 2) continue; // o vídeo de teste saiu do ar: usa o próximo
    const v = verdictFrom(r);
    if (v) saveEmbedVerdict(v);
    return v;
  }
  return null;
}
