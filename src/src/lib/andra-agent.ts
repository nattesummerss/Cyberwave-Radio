// Conversa com o agente de I.A. generativa da ANDRA-18 (Microsoft Copilot Studio), pelo
// Direct Line do Bot Framework.
//
// O endereço do agente fica no arquivo agente.json, na raiz do repositório:
//   { "tokenEndpoint": "https://....api.powerplatform.com/powervirtualagents/botsbyschema/.../directline/token?api-version=2022-03-01-preview" }
// (Copilot Studio → agente → Canais → Aplicativo móvel → "Ponto de extremidade do token").
// Sem esse arquivo, a caixa de pergunta avisa que o agente não está configurado.
// O token vale só para uma conversa; nenhuma chave fica no site.

const CONFIG_URL = "./agente.json";
const DEFAULT_DL = "https://directline.botframework.com/v3/directline";
const POLL_MS = 1000;
const REPLY_TIMEOUT_MS = 90_000;

export type AgentLink = { title: string; url: string };
export type AgentReply = { text: string; links: AgentLink[] };

let configP: Promise<string | null> | null = null;

/** Só aceita o endereço de token do próprio Copilot Studio (Power Platform), em https. */
export function validTokenEndpoint(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" || u.username || u.password) return null;
    if (!/(^|\.)api\.powerplatform\.(com|us|cn)$/i.test(u.hostname) && !/(^|\.)powerplatform\.(com|us|cn)$/i.test(u.hostname)) return null;
    if (!/\/directline\/token/i.test(u.pathname)) return null;
    return u.href;
  } catch {
    return null;
  }
}

export function agentEndpoint(): Promise<string | null> {
  configP ??= fetch(CONFIG_URL, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: unknown) => (j && typeof j === "object" ? validTokenEndpoint((j as Record<string, unknown>).tokenEndpoint) : null))
    .catch(() => null);
  return configP;
}

const URL_RE = /https?:\/\/[^\s<>()"'\]]+/g;

/** Texto para legenda e voz: sem markdown, sem marcas de citação [1] e sem endereços. */
export function plainText(md: string): string {
  return md
    .replace(/^\s*\[\d+\]:\s*\S+.*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1")
    .replace(/\[\d+\]/g, "")
    .replace(URL_RE, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Links citados na resposta (markdown, notas [1]: url "título" e endereços soltos). */
export function linksOf(md: string, extra: AgentLink[] = []): AgentLink[] {
  const out: AgentLink[] = [];
  const add = (url: string, title: string) => {
    try {
      const u = new URL(url.replace(/[.,;:!?]+$/, ""));
      if (u.protocol !== "https:" && u.protocol !== "http:") return;
      if (out.some((l) => l.url === u.href)) return;
      out.push({ url: u.href, title: (title || u.hostname.replace(/^www\./, "")).slice(0, 80) });
    } catch {
      /* ignora */
    }
  };
  for (const l of extra) add(l.url, l.title);
  for (const m of md.matchAll(/^\s*\[\d+\]:\s*(\S+)(?:\s+"([^"]*)")?/gm)) add(m[1]!, m[2] ?? "");
  for (const m of md.matchAll(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g)) add(m[2]!, m[1]!);
  for (const m of md.matchAll(URL_RE)) add(m[0], "");
  return out.slice(0, 4);
}

/** Divide a resposta em frases para a legenda acompanhar a fala. */
export function sentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && last.length + p.length < 140) out[out.length - 1] = `${last} ${p}`;
    else out.push(p);
  }
  return out;
}

type Activity = {
  type?: string;
  from?: { id?: string; role?: string };
  text?: string;
  replyToId?: string;
  entities?: { type?: string; citation?: { appearance?: { name?: string; url?: string } }[] }[];
  attachments?: unknown[];
};

export class AgentChat {
  private dl = DEFAULT_DL;
  private token = "";
  private conversationId = "";
  private watermark = "";
  private readonly userId = "visitante-" + Math.random().toString(36).slice(2, 10);

  private async start(endpoint: string, signal?: AbortSignal) {
    // Endereço regional do Direct Line (o Copilot Studio informa; se falhar, usa o global).
    try {
      const base = endpoint.replace(/\/powervirtualagents\/.*$/i, "");
      const rs = await fetch(`${base}/powervirtualagents/regionalchannelsettings?api-version=2022-03-01-preview`, { signal });
      if (rs.ok) {
        const j = (await rs.json()) as { channelUrlsById?: { directline?: string } };
        const u = j.channelUrlsById?.directline;
        if (u && /^https:\/\//.test(u)) this.dl = u.replace(/\/+$/, "") + "/v3/directline";
      }
    } catch {
      /* usa o global */
    }
    const tr = await fetch(endpoint, { signal });
    if (!tr.ok) throw new Error(tr.status === 401 || tr.status === 403 ? "o agente exige login (ative 'Sem autenticação' no Copilot Studio)" : `token HTTP ${tr.status}`);
    const tj = (await tr.json()) as { token?: string };
    if (!tj.token) throw new Error("token vazio");
    this.token = tj.token;
    const cr = await fetch(`${this.dl}/conversations`, { method: "POST", headers: { Authorization: `Bearer ${this.token}` }, signal });
    if (!cr.ok) throw new Error(`conversa HTTP ${cr.status}`);
    const cj = (await cr.json()) as { conversationId?: string; token?: string };
    if (!cj.conversationId) throw new Error("conversa sem id");
    this.conversationId = cj.conversationId;
    if (cj.token) this.token = cj.token;
    this.watermark = "";
  }

  reset() {
    this.conversationId = "";
    this.token = "";
    this.watermark = "";
  }

  /** Envia a pergunta e espera a resposta do agente. */
  async ask(question: string, signal?: AbortSignal): Promise<AgentReply> {
    const endpoint = await agentEndpoint();
    if (!endpoint) throw new Error("agente não configurado (falta o arquivo agente.json)");
    if (!this.conversationId) await this.start(endpoint, signal);
    const send = () =>
      fetch(`${this.dl}/conversations/${encodeURIComponent(this.conversationId)}/activities`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "message", from: { id: this.userId, role: "user" }, locale: "pt-BR", text: question.slice(0, 1000) }),
        signal,
      });
    let sr = await send();
    if (sr.status === 403 || sr.status === 404) {
      // Conversa expirada: abre outra.
      this.reset();
      await this.start(endpoint, signal);
      sr = await send();
    }
    if (!sr.ok) throw new Error(`envio HTTP ${sr.status}`);
    const sentId = ((await sr.json()) as { id?: string }).id ?? "";

    const started = Date.now();
    const texts: string[] = [];
    const extra: AgentLink[] = [];
    let quietSince = 0;
    while (Date.now() - started < REPLY_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (signal?.aborted) throw new DOMException("cancelado", "AbortError");
      const gr = await fetch(
        `${this.dl}/conversations/${encodeURIComponent(this.conversationId)}/activities${this.watermark ? `?watermark=${encodeURIComponent(this.watermark)}` : ""}`,
        { headers: { Authorization: `Bearer ${this.token}` }, signal },
      );
      if (!gr.ok) throw new Error(`resposta HTTP ${gr.status}`);
      const gj = (await gr.json()) as { activities?: Activity[]; watermark?: string };
      if (gj.watermark) this.watermark = gj.watermark;
      let got = false;
      for (const a of gj.activities ?? []) {
        if (a.from?.id === this.userId || a.from?.role === "user") continue;
        if (a.type !== "message" || !a.text) continue;
        if (sentId && a.replyToId && a.replyToId !== sentId) continue;
        texts.push(a.text);
        for (const e of a.entities ?? []) for (const c of e.citation ?? []) if (c.appearance?.url) extra.push({ url: c.appearance.url, title: c.appearance.name ?? "" });
        got = true;
      }
      if (got) quietSince = Date.now();
      // Espera mais um pouco depois da primeira mensagem, caso o agente mande outra em seguida.
      if (texts.length && Date.now() - quietSince >= 1500) break;
    }
    if (!texts.length) throw new Error("o agente não respondeu a tempo");
    const md = texts.join("\n");
    return { text: plainText(md), links: linksOf(md, extra) };
  }
}
