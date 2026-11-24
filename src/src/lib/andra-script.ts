// Falas fixas da apresentadora ANDRA-18.
//
// Esta lista vai para dentro do index.html (bloco <script id="andra-frases">). O GitHub Actions lê
// esse bloco e grava cada fala em MP3 com uma voz neural feminina (pasta voz/), para a voz ser a
// mesma em qualquer aparelho e navegador. Mudou um texto aqui? O áudio dele é refeito sozinho.

import { STATIONS, type Station } from "@/data/stations";

export const ANDRA_NAME = "ANDRA-18";

export type Period = "manha" | "tarde" | "noite";
export const periodOf = (d: Date): Period => (d.getHours() < 12 && d.getHours() >= 5 ? "manha" : d.getHours() >= 12 && d.getHours() < 18 ? "tarde" : "noite");
const HELLO: Record<Period, string> = { manha: "Bom dia", tarde: "Boa tarde", noite: "Boa noite" };

const placeOf = (s: Station) => s.place ?? (s.city === "sp" ? "São Paulo" : s.city === "rj" ? "Rio de Janeiro" : s.city === "bh" ? "Belo Horizonte" : "");
const freq = (f: number) => f.toFixed(1).replace(".", ",");

/** Como a apresentadora fala o nome da rádio (sem pontos e siglas que a voz lê errado). */
function spokenStation(s: Station) {
  const name = s.name.replace(/^\./, "ponto ").replace(/\s*\((?:via|iHeart)[^)]*\)/i, "").replace(/!/g, "");
  const where = placeOf(s);
  const f = s.frequency ? `, ${freq(s.frequency)} FM` : "";
  return `${name}${f}${where && where !== "Web" ? `, de ${where}` : ""}`;
}

/** Anúncio da rádio: "Você está ouvindo …". Rádio descoberta usa o texto que o GitHub gravou (radios-extras.json). */
export const stationLine = (s: Station) => s.fala ?? `Você está ouvindo ${spokenStation(s)}.`;

export function phrases(): Record<string, string> {
  const p: Record<string, string> = {};
  for (const per of ["manha", "tarde", "noite"] as Period[]) {
    p[`ola-${per}-1`] = `${HELLO[per]}! Eu sou ANDRA-18, a apresentadora virtual da Cyberwave Radio. Fique comigo para a melhor programação e as principais notícias do mundo.`;
    p[`ola-${per}-2`] = `${HELLO[per]}, e bem-vindo à Cyberwave Radio. Aqui é ANDRA-18, conectada para trazer música, esporte e informação em tempo real.`;
  }
  p["sem-radio"] = "Escolha uma estação no dial e aperte o play para ouvir enquanto acompanha as notícias.";
  p["noticias-abre"] = "Agora, as principais manchetes do momento.";
  p["noticias-fecha"] = "Essas foram as manchetes. As matérias completas estão nos links da tela. Voltamos com a programação.";
  p["noticias-vazio"] = "No momento não consegui receber as manchetes. Tento de novo em instantes.";
  p["plantao-abre"] = "Atenção. Interrompemos a programação para um plantão urgente.";
  p["plantao-fecha"] = "Voltamos com a programação normal.";
  for (const s of STATIONS) p[`radio-${s.id}`] = stationLine(s);
  return p;
}

/** Id da saudação conforme a hora e uma variação. */
export const helloId = (d: Date, variant: 1 | 2) => `ola-${periodOf(d)}-${variant}`;
