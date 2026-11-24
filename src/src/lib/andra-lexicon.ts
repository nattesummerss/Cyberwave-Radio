// Vocabulário de pronúncia da ANDRA-18.
//
// As vozes em português leem palavras inglesas como se fossem portuguesas ("Cyberwave" vira
// "Quiberuave"). Antes de falar, o texto passa por esta lista, que troca cada termo pela grafia
// que a voz pt-BR lê com o som certo. A legenda continua mostrando o texto original.
//
// A mesma lista vai para o index.html (bloco "andra-lexico") e é usada:
//  - pela voz do navegador (andra-voice.ts e host.js);
//  - pelo GitHub Actions, ao gravar as falas com a voz neural.
//
// Para incluir uma palavra: acrescente [padrão, como falar]. O padrão é uma expressão regular
// (sem diferenciar maiúsculas); coloque os termos mais longos antes dos mais curtos.

export type LexEntry = [pattern: string, say: string];

export const LEXICON: LexEntry[] = [
  // Marca e apresentadora
  ["\\bcyber\\s*-?\\s*wave\\s+radio\\b", "Sáiber-uêiv Rêidio"],
  ["\\bcyber\\s*-?\\s*wave\\b", "Sáiber-uêiv"],
  ["\\bcyberpunk\\b", "Sáiber-pânk"],
  ["\\bcyber\\b", "Sáiber"],
  ["\\bandra\\s*-\\s*18\\b", "Ândra dezoito"],
  ["\\bandra\\s+18\\b", "Ândra dezoito"],
  ["\\bandra\\b", "Ândra"],
  ["\\bnight\\s+city\\b", "Náit Síti"],
  ["\\bcw\\s+news\\b", "cê dáblio niús"],

  // Rádio e música
  ["\\bstream\\s*the\\s*world\\b", "Strím dâ Uôrld"],
  ["\\bstreaming\\b", "strímin"],
  ["\\bplaylists?\\b", "plêi-list"],
  ["\\bdjs?\\b", "di-djêi"],
  ["\\bhosts?\\b", "rôust"],
  ["\\bon\\s*-?\\s*line\\b", "on-láin"],
  ["\\boff\\s*-?\\s*line\\b", "óf-láin"],
  ["\\blive\\b", "láiv"],
  ["\\br\\s*&\\s*b\\b", "ár en bí"],
  ["\\brhythm\\s+and\\s+blues\\b", "ríttim en blús"],
  ["\\bhip\\s*-?\\s*hop\\s+house\\b", "rip-róp Ráus"],
  ["\\bhip\\s*-?\\s*hop\\b", "rip-róp"],
  ["\\bheavy\\s+metal\\b", "révi métal"],
  ["\\balt\\s+metal\\b", "ólt métal"],
  ["\\bmetalcore\\b", "métal-cór"],
  ["\\bhardcore\\b", "rárd-cór"],
  ["\\bhard\\s+rock\\b", "rárd róc"],
  ["\\bclassic\\s+rock\\b", "clássic róc"],
  ["\\bsoul\\b", "sôul"],
  ["\\bloud!?(?=\\s|$)", "láud"],
  ["\\bkiss\\s+fm\\b", "Quíss éfe-ême"],
  ["\\bmajic\\b", "Médjik"],
  ["\\bthe\\s+box\\b", "Dâ Bóx"],
  ["\\bfoxy\\b", "Fóksi"],
  ["\\bjamz\\b", "Djéms"],
  ["\\bjams\\b", "Djéms"],
  ["\\bhot\\s+(?=\\d)", "Rót "],
  ["\\bpower\\s+(?=\\d)", "Páuer "],
  ["\\b92q\\b", "noventa e dois quiú"],
  ["\\bthe\\s+beat\\b", "Dâ Bít"],
  ["\\bmagic\\b", "Médjik"],
  ["\\bthe\\s+rock\\b", "Dâ Róc"],
  ["\\bthe\\s+rat\\b", "Dâ Rét"],
  ["\\bnew\\s+century\\b", "Niú Séntchuri"],
  ["\\biheart\\b", "Ai-rárt"],
  ["\\bkupd\\b", "Kêi-iú-pí-dí"],
  ["\\bwzak\\b", "Dáblio-Zéc"],
  ["\\bband\\s+fm\\b", "Bandi éfe-ême"],
  ["\\blos\\s*40\\s+urban\\b", "Los Cuarenta Ârban"],
  ["\\blos\\s*40\\b", "Los Cuarenta"],
  ["\\bradio\\s+bob!?", "Rêidio Bób"],
  ["\\brock\\s*&\\s*pop\\b", "róc en póp"],
  ["\\bbillboard\\b", "Bíl-bórd"],
  ["\\bgrammy\\b", "Grémi"],
  ["\\bspotify\\b", "Spótifai"],

  // Notícias e fontes
  ["\\bbreaking\\s+news\\b", "brêiquin niús"],
  ["\\bfox\\s+news\\b", "Fócs Niús"],
  ["\\bbbc\\b", "bi-bi-ci"],
  ["\\bcnn\\b", "ci-éne-éne"],
  ["\\bnews\\b", "niús"],
  ["\\breuters\\b", "Róiters"],
  ["\\bnew\\s+york\\b", "Niu Iórk"],
  ["\\bwhite\\s+house\\b", "Uáit Ráus"],
  ["\\bblack\\s+friday\\b", "Bléc Fráidei"],
  ["\\bhalloween\\b", "Rálouín"],
  ["\\bpremier\\s+league\\b", "Prímier Líg"],
  ["\\bchampions\\s+league\\b", "Tchêmpions Líg"],

  // Tecnologia
  ["\\byoutube\\b", "Iú-túbi"],
  ["\\btik\\s*tok\\b", "Tíc-Tóc"],
  ["\\bwhatsapp\\b", "Uóts-ép"],
  ["\\bwi\\s*-?\\s*fi\\b", "uái-fái"],
  ["\\bsmartphones?\\b", "smárt-fôun"],
  ["\\biphone\\b", "ái-fôun"],
  ["\\bmicrosoft\\b", "Máicro-sóft"],
  ["\\bgoogle\\b", "Gúgol"],
  ["\\bnetflix\\b", "Nét-flics"],
  ["\\bopenai\\b", "Ôupen Êi Ái"],
  ["\\bchatgpt\\b", "Tchét Gê Pê Tê"],
  ["\\bfeed\\b", "fíd"],
];

let compiled: [RegExp, string][] | null = null;

/** Texto como a voz deve ler (a legenda continua com o original). */
export function forSpeech(text: string): string {
  compiled ??= LEXICON.map(([p, say]) => [new RegExp(p, "gi"), say]);
  let out = text;
  for (const [re, say] of compiled) out = out.replace(re, say);
  return out;
}
