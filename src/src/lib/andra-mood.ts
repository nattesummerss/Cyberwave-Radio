// Humor da ANDRA-18 de acordo com o que ela vai falar (notícia grave, alegre, esporte, plantão).
// O cartão da apresentadora (host.js) transforma o humor em expressão e gestos.

export type RigMood = "neutral" | "happy" | "serious" | "excited" | "alert";

/* ---------- Leitura da notícia ---------- */

const GRAVE =
  /\b(mort[eoa]s?|morre\w*|mata\w*|guerra|ataque\w*|bomba\w*|explos\w*|trag[eé]d\w*|desastre\w*|terremoto|tsunami|enchente\w*|inunda\w*|inc[eê]ndio\w*|tiroteio|v[ií]tima\w*|feridos?|acidente\w*|crise|colapso|sequestr\w*|assassin\w*|massacre|luto|desaparecid\w*|pris[aã]o|preso|condena\w*|killed|dead|death|war|attack|shooting|crash|disaster|victims?)\b/i;
const HAPPY =
  /\b(vit[oó]ria|vence\w*|venceu|recorde|conquist\w*|campe[aã]o|celebra\w*|comemora\w*|festa|cura|descobert\w*|avan[cç]o|acordo|paz|lan[cç]a\w*|estreia|sucesso|pr[eê]mio|alta|cresce\w*|win|wins|record|champion|celebrat\w*)\b/i;
const SPORT = /\b(gol|gols|jogo|partida|campeonato|copa|libertadores|brasileir[aã]o|f[oó]rmula|f1|t[ií]tulo|cl[aá]ssico|time|sele[cç][aã]o|placar|nba|nfl|ufc|tenis|t[eê]nis)\b/i;

/** Humor da apresentadora para um texto falado. */
export function moodFor(text: string, tag: string): RigMood {
  if (/PLANT[AÃ]O|URGENTE/i.test(tag)) return "alert";
  if (GRAVE.test(text)) return "serious";
  if (SPORT.test(text)) return HAPPY.test(text) ? "excited" : "happy";
  if (HAPPY.test(text)) return "happy";
  if (/APRESENTA|SINTONIA/i.test(tag)) return "happy";
  return "neutral";
}
