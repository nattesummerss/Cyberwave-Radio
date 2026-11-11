import type { Station } from "@/data/stations";

// "Minhas rádios" ficam guardadas no próprio navegador de cada pessoa
// (o site não tem login nem banco de dados).

export const MINHAS_STORAGE_KEY = "radio.minhas";

export interface MinhaRadio {
  id: string;
  name: string;
  streamUrl: string;
  genre: string;
}

/** Só endereços https tocam num site publicado em https. */
export function playableUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function newMinhaRadio(input: { name: string; streamUrl: string; genre: string }): MinhaRadio {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return { id: `minha-${rand}`, ...input };
}

/** Converte o que veio do navegador em rádio; ignora entradas que não tenham o formato esperado. */
export function toStations(saved: unknown): Station[] {
  if (!Array.isArray(saved)) return [];
  const out: Station[] = [];
  for (const item of saved) {
    if (!item || typeof item !== "object") continue;
    const { id, name, streamUrl, genre } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id.startsWith("minha-") || typeof name !== "string") continue;
    const label = name.trim() || "Sem nome";
    out.push({
      id,
      name: label,
      shortName: label.slice(0, 16),
      city: null,
      genre: typeof genre === "string" && genre.trim() ? genre.trim() : "Variedades",
      streamUrl: playableUrl(streamUrl) ?? "",
      custom: true,
    });
  }
  return out;
}
