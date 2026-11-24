// Buscador de músicas da Cyberwave Radio — versão Cloudflare Worker (plano gratuito).
// A lógica fica em musica-core.ts (a mesma da versão Vercel, api/musica.js).

import { allowOrigin, handle, type CoreEnv } from "./musica-core";

export default {
  async fetch(req: Request, env: CoreEnv): Promise<Response> {
    const url = new URL(req.url);
    const allowed = allowOrigin(req.headers.get("origin") ?? "", env);
    const cors: Record<string, string> = { "access-control-allow-origin": allowed ?? "null", "access-control-allow-methods": "GET, OPTIONS", vary: "origin" };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!allowed) return new Response("origem não autorizada", { status: 403, headers: { ...cors, "cache-control": "no-store" } });
    if (req.method !== "GET") return new Response("método não suportado", { status: 405, headers: cors });

    // Cache da borda: a mesma busca não vai ao YouTube de novo por algumas horas.
    const cache = (globalThis as unknown as { caches?: { default: Cache } }).caches?.default;
    const key = new Request(`https://cache.cyberwave${url.pathname}${url.search}`);
    const hit = await cache?.match(key);
    if (hit) {
      const r = new Response(hit.body, hit);
      for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
      return r;
    }
    const out = await handle(url, env);
    const res = new Response(out.body, {
      status: out.status,
      headers: { ...cors, "content-type": out.contentType, "cache-control": out.maxAge ? `public, max-age=${out.maxAge}` : "no-store" },
    });
    if (cache && out.maxAge && out.status === 200) await cache.put(key, res.clone());
    return res;
  },
};
