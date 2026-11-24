// Diagnóstico das fontes de música, rodado no navegador de quem abre o site.
// Mostra o que responde de verdade naquela rede/aparelho — útil porque cada serviço pode falhar
// por motivos diferentes (bloqueio regional, extensão de privacidade, serviço fora do ar).

import { INVIDIOUS, fetchLyrics, helperBase, helperUrl, lastfmIds, oembedCheck, searchDeezer, searchItunes, viaHelper, viaInvidious, viaYoutubeApi, wikidataIds } from "@/lib/music-catalog";
import { searchArchive, type MusicConfig } from "@/lib/music-sources";
import { clearClipFirst, idsInIndex, loadIndex, noteFirstIndexIdBlocked } from "@/lib/music-index";
import { SITE_VERSION } from "@/lib/version";
import { CONTROL_VIDEOS, YT_REFUSALS, playbackTest, saveEmbedVerdict, verdictFrom, ytErrorText, type PlaybackResult } from "@/lib/yt-player";

export type DiagStatus = "testando" | "ok" | "falha" | "desligado";

export interface DiagResult {
  id: string;
  name: string;
  /** Para que serve a fonte (mostrado em letra pequena). */
  role: string;
  status: DiagStatus;
  ms?: number;
  detail: string;
}

const SAMPLE = { artist: "Linkin Park", title: "Numb" } as const;
const SAMPLE_VIDEO = "kXYiU_JCYtU";

const BLOCKED = "bloqueado ou fora do ar (rede/CORS)";
const YT_HOSTS = ["www.youtube.com", "www.youtube-nocookie.com"];

/** Só verifica se o endereço abre nesta rede (resposta opaca; erro = bloqueado ou fora do ar). */
async function reachable(url: string, ms = 8000): Promise<boolean> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), ms);
  try {
    await fetch(url, { mode: "no-cors", credentials: "omit", signal: ctrl.signal, cache: "no-store" });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(t);
  }
}

/** Falha com explicação já pronta (mostrada como está, sem encurtar). */
class DiagFail extends Error {
  name = "DiagFail";
}

function errText(e: unknown): string {
  if (e instanceof DiagFail) return e.message;
  const m = e instanceof Error ? e.message : String(e);
  if (/abort|tempo esgotado/i.test(m)) return "não respondeu a tempo";
  if (/failed to fetch|networkerror|load failed|falha de rede/i.test(m)) return BLOCKED;
  return m.slice(0, 120);
}

interface Probe {
  id: string;
  name: string;
  role: string;
  run: () => Promise<string>;
  /** Mensagem quando a fonte não está configurada (o teste não roda). */
  off?: string;
  /** Tempo máximo do teste (padrão 25 s). */
  timeoutMs?: number;
}

/** Resultado do teste de reprodução, para o resumo. */
interface PlaybackInfo {
  /** Vídeo de teste sem música: mostra se o YouTube toca QUALQUER vídeo dentro do site aqui. */
  control: PlaybackResult | null;
  clip: PlaybackResult | null;
  index: PlaybackResult | null;
}

const refused = (r: PlaybackResult | null | undefined) => !!r && !r.ok && r.code !== undefined && YT_REFUSALS.has(r.code);

/**
 * Testa de verdade, tocando alguns segundos sem som: 1º um vídeo sem música (o exemplo do próprio YouTube),
 * depois o clipe oficial e o áudio do índice. Se nem o vídeo sem música toca, a recusa é da rede/navegador.
 */
async function playbackProbe(box: HTMLElement, info: { value: PlaybackInfo | null }): Promise<string> {
  box.replaceChildren();
  const host = (await reachable(`https://${YT_HOSTS[0]}/embed/${SAMPLE_VIDEO}`)) || !(await reachable(`https://${YT_HOSTS[1]}/embed/${SAMPLE_VIDEO}`)) ? YT_HOSTS[0] : YT_HOSTS[1];
  let control: PlaybackResult | null = null;
  for (const id of CONTROL_VIDEOS) {
    const r = await playbackTest(box, host, id, "Vídeo de teste do YouTube (sem música)");
    if (r.code === 100 || r.code === 2) {
      box.lastElementChild?.remove(); // o vídeo de teste saiu do ar: usa o próximo
      continue;
    }
    control = r;
    break;
  }
  const verdict = verdictFrom(control);
  if (verdict) saveEmbedVerdict(verdict);
  if (verdict?.v === "recusa") clearClipFirst(); // a recusa é de tudo, não só do áudio do YouTube Music
  if (control && !control.ok) {
    // Nem o vídeo sem música tocou: testar as músicas não acrescenta nada (o quadro do YouTube fica na tela).
    info.value = { control, clip: null, index: null };
    throw new DiagFail(`vídeo de teste do YouTube (sem música): ${control.detail}`);
  }
  const clip = await playbackTest(box, host, SAMPLE_VIDEO, "Clipe oficial (Numb)");
  const idx = await loadIndex().catch(() => null);
  const first = idx ? idsInIndex(idx, SAMPLE)[0] : undefined;
  const index = first && first !== SAMPLE_VIDEO ? await playbackTest(box, host, first, "Áudio do YouTube Music no índice (Numb)") : null;
  info.value = { control, clip, index };
  // O áudio do YouTube Music é recusado em sites aqui, mas o clipe toca: o player já começa pelo clipe.
  if (index && !index.ok && (index.code === 101 || index.code === 150) && clip.ok) noteFirstIndexIdBlocked("diagnostico", true);
  const parts = [...(control ? [`vídeo de teste: ${control.detail}`] : []), `clipe oficial: ${clip.detail}`, ...(index ? [`áudio do YouTube Music (índice): ${index.detail}`] : [])];
  if (!clip.ok && !index?.ok) throw new DiagFail(parts.join(" • "));
  return parts.join(" • ");
}

function probes(c: MusicConfig, box: HTMLElement | null, info: { value: PlaybackInfo | null }): Probe[] {
  const base = helperBase(c);
  return [
    { id: "itunes", name: "Catálogo iTunes", role: "busca de músicas (nome, artista, capa)", run: async () => `${(await searchItunes(`${SAMPLE.artist} ${SAMPLE.title}`)).length} resultados` },
    { id: "deezer", name: "Catálogo Deezer", role: "complemento do catálogo e links do Deezer", run: async () => `${(await searchDeezer(`${SAMPLE.artist} ${SAMPLE.title}`, c)).length} resultados` },
    {
      id: "oembed",
      name: "YouTube (verificação)",
      role: "confere se o vídeo pode tocar no site",
      run: async () => {
        const info = await oembedCheck(SAMPLE_VIDEO);
        if (!info) throw new Error("oEmbed do YouTube não respondeu");
        return info.title || "ok";
      },
    },
    {
      id: "player",
      name: "Player do YouTube",
      role: "toca a música completa dentro do site",
      run: async () => {
        const ok = await Promise.all(YT_HOSTS.map((h) => reachable(`https://${h}/embed/${SAMPLE_VIDEO}`)));
        if (!ok.some(Boolean)) throw new Error("youtube.com e youtube-nocookie.com bloqueados nesta rede");
        return YT_HOSTS.map((h, i) => `${h.replace("www.", "")}: ${ok[i] ? "abre" : "bloqueado"}`).join(" • ");
      },
    },
    {
      id: "reproducao",
      name: "Teste de reprodução",
      role: "toca alguns segundos sem som — a prova final de que a música completa toca aqui",
      off: "não testado",
      timeoutMs: 70_000,
      run: async () => {
        if (!box) throw new Error("__off__");
        return playbackProbe(box, info);
      },
    },
    {
      id: "indice",
      name: "Índice do site",
      role: "músicas populares já conferidas pelo GitHub (completas, sem cadastro)",
      run: async () => {
        const idx = await loadIndex(true);
        if (!idx.count) throw new Error("ainda não gerado — publique a versão nova e aguarde uma execução do GitHub Actions");
        const when = idx.generatedAt ? new Date(idx.generatedAt) : null;
        const sample = idsInIndex(idx, SAMPLE).length ? `; "${SAMPLE.title}" está nele` : "";
        return `${idx.count.toLocaleString("pt-BR")} músicas${when && !Number.isNaN(when.getTime()) ? `, atualizado em ${when.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}${sample}`;
      },
    },
    {
      id: "buscador",
      name: "Buscador próprio",
      role: "busca no YouTube Music para músicas fora do índice (opcional)",
      off: "não configurado (opcional — o índice do site já cobre as músicas mais ouvidas)",
      run: async () => {
        if (!base) throw new Error("não configurado");
        const health = await fetch(helperUrl(base, { op: "saude" }), { credentials: "omit" });
        if (!health.ok) throw new Error(`saúde HTTP ${health.status}`);
        return `${(await viaHelper(base, `${SAMPLE.artist} ${SAMPLE.title}`)).length} vídeos encontrados`;
      },
    },
    {
      id: "api",
      name: "Chave da YouTube Data API",
      role: "busca oficial do YouTube para músicas fora do índice (cerca de 100 buscas por dia; este teste gasta 1)",
      off: "não configurada (opcional)",
      run: async () => `${(await viaYoutubeApi(c.youtubeApiKey ?? "", `${SAMPLE.artist} ${SAMPLE.title}`)).length} vídeos`,
    },
    {
      id: "lastfm",
      name: "Last.fm (sem configuração)",
      role: "vídeo indicado para cada faixa",
      run: async () => {
        const ids = await lastfmIds(SAMPLE);
        if (!ids.length) throw new Error("nenhum vídeo na página");
        return `vídeo ${ids[0]}`;
      },
    },
    {
      id: "wikidata",
      name: "Wikidata (sem configuração)",
      role: "clipe oficial de músicas conhecidas",
      run: async () => {
        const ids = await wikidataIds(SAMPLE);
        if (!ids.length) throw new Error("nenhum vídeo registrado");
        return `vídeo ${ids[0]}`;
      },
    },
    {
      id: "invidious",
      name: "Invidious (sem configuração)",
      role: "busca alternativa no YouTube",
      run: async () => {
        const res = await Promise.allSettled(INVIDIOUS.map((b) => viaInvidious(b, `${SAMPLE.artist} ${SAMPLE.title}`)));
        const ok = res.filter((r) => r.status === "fulfilled").length;
        // Todas recusadas pela rede (não "fora do ar"): conta como bloqueio no resumo.
        if (!ok && res.every((r) => r.status === "rejected" && /failed to fetch|networkerror|load failed/i.test(String((r as PromiseRejectedResult).reason)))) throw new Error("Failed to fetch");
        if (!ok) throw new Error(`0 de ${INVIDIOUS.length} instâncias responderam`);
        return `${ok} de ${INVIDIOUS.length} instâncias responderam`;
      },
    },
    { id: "archive", name: "Internet Archive", role: "acervo público", run: async () => `${(await searchArchive("grateful dead")).length} resultados` },
    {
      id: "lrclib",
      name: "Letras (LRCLib)",
      role: "letra sincronizada",
      run: async () => {
        const l = await fetchLyrics({ key: "diag", source: "catalogo", title: SAMPLE.title, artist: SAMPLE.artist, duration: 186 });
        if (!l) throw new Error("letra não encontrada");
        return l.synced.length ? `${l.synced.length} linhas sincronizadas` : "letra simples";
      },
    },
  ].map((p) => (p.id === "api" && !c.youtubeApiKey) || (p.id === "buscador" && !base) ? { ...p, run: async () => Promise.reject(new Error("__off__")) } : p);
}

/** Roda todos os testes em paralelo; `onUpdate` recebe a lista a cada resultado. `playerBox` recebe o player de teste. */
export async function runDiagnostics(c: MusicConfig, onUpdate: (r: DiagResult[]) => void, opts: { playerBox?: HTMLElement | null } = {}): Promise<DiagResult[]> {
  const info: { value: PlaybackInfo | null } = { value: null };
  const list = probes(c, opts.playerBox ?? null, info);
  const results: DiagResult[] = list.map((p) => ({ id: p.id, name: p.name, role: p.role, status: "testando", detail: "testando…" }));
  onUpdate([...results]);
  await Promise.all(
    list.map(async (p, i) => {
      const t0 = performance.now();
      try {
        const detail = await Promise.race([p.run(), new Promise<string>((_, rej) => window.setTimeout(() => rej(new Error("tempo esgotado")), p.timeoutMs ?? 25_000))]);
        results[i] = { ...results[i], status: "ok", ms: Math.round(performance.now() - t0), detail };
      } catch (e) {
        const off = e instanceof Error && e.message === "__off__";
        results[i] = { ...results[i], status: off ? "desligado" : "falha", ms: off ? undefined : Math.round(performance.now() - t0), detail: off ? p.off ?? "desligado" : errText(e) };
      }
      onUpdate([...results]);
    }),
  );
  results.push(summarize(results, info.value));
  onUpdate([...results]);
  return results;
}

/** Resumo em linguagem simples: o que toca completo neste aparelho/rede e o que está bloqueado. */
function summarize(results: DiagResult[], play: PlaybackInfo | null): DiagResult {
  const get = (id: string) => results.find((r) => r.id === id);
  const ok = (id: string) => get(id)?.status === "ok";
  const blocked = results.filter((r) => r.status === "falha" && r.detail === BLOCKED).map((r) => r.name.replace(/\s*\(.*\)$/, ""));
  const parts: string[] = [];
  let good = false;
  const OUVIR = "Para ouvir a música completa, toque em “Ouvir no YouTube” no player: ela abre no próprio site do YouTube, com as próximas da lista em sequência. Se lá também não tocar, nesta rede só funcionam as prévias e as músicas do aparelho.";
  const c = play?.control;
  if (!ok("player")) parts.push("O YouTube está bloqueado nesta rede: aqui só tocam as prévias de 30 s e os arquivos do aparelho.");
  else if (c && !c.ok) {
    // Nem o vídeo sem música tocou: é a rede ou o navegador, não a gravadora.
    if (refused(c) && (c.code === 152 || c.code === 153))
      parts.push(`Neste computador/rede o YouTube não deixa tocar nenhum vídeo dentro de outros sites — nem o vídeo de teste do próprio YouTube (${ytErrorText(c.code!)}). Uma extensão de privacidade, a configuração do navegador ou o proxy da empresa está escondendo o endereço do site.`);
    else if (refused(c))
      parts.push(
        `Neste computador/rede o YouTube não deixa tocar nenhum vídeo dentro de outros sites — nem o vídeo de teste do próprio YouTube (${ytErrorText(c.code!)}). Não é a gravadora: em redes de empresa isso costuma ser a verificação do YouTube “Faça login para confirmar que você não é um robô” (veja o quadro abaixo). Experimente abrir youtube.com neste navegador, entrar com uma conta Google e clicar em “Testar de novo”.`,
      );
    else if (c.heard) parts.push(`O player do YouTube abre, mas o vídeo não tocou aqui — nem o vídeo de teste do próprio YouTube (${c.detail}).`);
    else parts.push("O player do YouTube não respondeu nesta rede.");
    parts.push(OUVIR);
  } else if (get("reproducao")?.status === "falha" && play?.clip) {
    const m = play.clip;
    if (c?.ok && refused(m))
      parts.push(`O YouTube toca vídeos dentro do site aqui (o vídeo de teste tocou), mas não liberou “${SAMPLE.title}” (${ytErrorText(m.code!)}): é uma restrição da gravadora dessa música. Músicas de outras gravadoras tocam no site; nas bloqueadas, use “Ouvir no YouTube”.`);
    else if (m.code === 152 || m.code === 153) parts.push(`O YouTube recusou tocar dentro do site neste navegador (${ytErrorText(m.code)}).`);
    else parts.push(m.heard ? `O player do YouTube abre, mas não tocou aqui (${m.detail}).` : "O player do YouTube não respondeu nesta rede.");
    parts.push(OUVIR);
  } else if (ok("indice") || ok("buscador") || ok("api")) {
    good = true;
    parts.push(`Músicas completas funcionam aqui (${[ok("indice") && "índice do site", ok("buscador") && "buscador próprio", ok("api") && "chave do YouTube"].filter(Boolean).join(" + ")} + player do YouTube${ok("reproducao") ? "; o teste de reprodução passou" : ""}).`);
    if (play?.index && !play.index.ok && play.clip?.ok)
      parts.push(`O áudio do YouTube Music é recusado em sites aqui (${play.index.detail}); o player já começa pelo clipe oficial de cada música.`);
  } else if (ok("lastfm") || ok("wikidata") || ok("invidious")) {
    good = true;
    parts.push("Músicas completas funcionam aqui só para parte das músicas (Last.fm/Wikidata/Invidious).");
  } else parts.push("Nenhuma fonte de música completa respondeu: publique a versão nova do site e aguarde o GitHub montar o índice (passo “Montar o índice de músicas completas” na aba Actions).");
  if (blocked.length >= 3) parts.push(`Esta rede bloqueia ${blocked.join(", ")} — comum em computador de empresa/AVD; fora dela essas fontes voltam a funcionar.`);
  else if (blocked.length) parts.push(`Bloqueado ou fora do ar agora: ${blocked.join(", ")}.`);
  return { id: "resumo", name: "Resumo", role: "o que isso significa", status: good ? "ok" : "falha", detail: parts.join(" ") };
}

/** Texto para copiar e colar numa mensagem de suporte. */
export function diagnosticsReport(results: DiagResult[], c: MusicConfig): string {
  const icon: Record<DiagStatus, string> = { ok: "OK", falha: "FALHOU", desligado: "—", testando: "…" };
  const lines = results.map((r) => `${icon[r.status].padEnd(6)} ${r.name}: ${r.detail}${r.ms !== undefined ? ` (${r.ms} ms)` : ""}`);
  return [
    `Cyberwave Radio ${SITE_VERSION} — diagnóstico das fontes de música (${new Date().toLocaleString("pt-BR")})`,
    `Navegador: ${navigator.userAgent}`,
    `Buscador próprio: ${helperBase(c) ? "configurado" : "não configurado"} • Chave do YouTube: ${c.youtubeApiKey ? "configurada" : "não configurada"}`,
    ...lines,
  ].join("\n");
}
