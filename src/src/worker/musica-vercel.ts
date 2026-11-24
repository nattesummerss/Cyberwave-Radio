// Buscador de músicas da Cyberwave Radio — versão Vercel (plano Hobby, gratuito).
// Na Vercel este arquivo vira api/musica.js; o endereço fica https://<projeto>.vercel.app/api/musica
// A lógica fica em musica-core.ts (a mesma da versão Cloudflare).

import { allowOrigin, handle, type CoreEnv } from "./musica-core";

declare const process: { env: Record<string, string | undefined> };

interface VercelReq {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}
interface VercelRes {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

const header = (req: VercelReq, name: string) => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
};

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  const env: CoreEnv = { ORIGENS: process.env.ORIGENS, YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY };
  const allowed = allowOrigin(header(req, "origin"), env);
  res.setHeader("access-control-allow-origin", allowed ?? "null");
  res.setHeader("access-control-allow-methods", "GET, OPTIONS");
  res.setHeader("vary", "origin");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (!allowed) {
    res.statusCode = 403;
    res.setHeader("cache-control", "no-store");
    res.end("origem não autorizada");
    return;
  }
  const url = new URL(req.url ?? "/", `https://${header(req, "host") || "localhost"}`);
  try {
    const out = await handle(url, env);
    res.statusCode = out.status;
    res.setHeader("content-type", out.contentType);
    // s-maxage: a CDN da Vercel guarda a resposta e responde sem chamar o YouTube de novo.
    res.setHeader("cache-control", out.maxAge && out.status === 200 ? `public, max-age=600, s-maxage=${out.maxAge}, stale-while-revalidate=86400` : "no-store");
    res.end(out.body);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ erro: String(e) }));
  }
}
