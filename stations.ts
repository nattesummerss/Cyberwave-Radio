// Catálogo de rádios brasileiras com stream público.
// Endereços de stream tirados do diretório público Radio Browser (verificação de 17/10/2026).
// Streams de terceiros podem sair do ar ou mudar de endereço sem aviso.

export type CityId = "sp" | "rj" | "bh";
export type BandId = CityId | "web" | "intl" | "rock";

export interface Station {
  id: string;
  name: string;
  /** Rótulo curto usado no dial. */
  shortName: string;
  /** Cidade da frequência FM; `null` para rádios só na web. */
  city: CityId | null;
  /** Frequência FM em MHz; ausente para rádios só na web. */
  frequency?: number;
  /** Cidade de origem para rádios fora das abas de cidade (ex.: "Recife"). */
  place?: string;
  /** Rádio de fora do Brasil (aba Internacionais). */
  intl?: boolean;
  /** Rádio de rock de fora do Brasil (aba Rock internacional). */
  rock?: boolean;
  genre: string;
  streamUrl: string;
  codec?: "AAC" | "MP3";
  bitrate?: number;
  /** Rádio adicionada pelo próprio ouvinte (guardada no navegador). */
  custom?: boolean;
}

export const BAND_MIN = 87.5;
export const BAND_MAX = 108;

export const CITIES: { id: CityId; name: string }[] = [
  { id: "sp", name: "São Paulo" },
  { id: "rj", name: "Rio de Janeiro" },
  { id: "bh", name: "Belo Horizonte" },
];

const STW = "https://playerservices.streamtheworld.com/api/livestream-redirect/";

export const STATIONS: Station[] = [
  // São Paulo
  { id: "sp-89fm", name: "89 A Rádio Rock", shortName: "89 FM", city: "sp", frequency: 89.1, genre: "Rock", streamUrl: `${STW}RADIO_89FM_ADP.aac`, codec: "AAC", bitrate: 128 },
  { id: "sp-novabrasil", name: "Nova Brasil FM", shortName: "Nova Brasil", city: "sp", frequency: 89.7, genre: "MPB", streamUrl: `${STW}NOVABRASIL_SPAAC.aac`, codec: "AAC", bitrate: 96 },
  { id: "sp-cbn", name: "CBN São Paulo", shortName: "CBN", city: "sp", frequency: 90.5, genre: "Notícias", streamUrl: `${STW}CBN_SPAAC.aac`, codec: "AAC", bitrate: 128 },
  { id: "sp-disney", name: "Rádio Disney", shortName: "Disney", city: "sp", frequency: 91.3, genre: "Pop", streamUrl: `${STW}DISNEY_BRA_SP_ADP.aac`, codec: "AAC", bitrate: 128 },
  { id: "sp-kiss", name: "Kiss FM", shortName: "Kiss FM", city: "sp", frequency: 92.5, genre: "Rock", streamUrl: `${STW}RADIO_KISSFMAAC.aac`, codec: "AAC", bitrate: 64 },
  { id: "sp-bandnews", name: "BandNews FM", shortName: "BandNews", city: "sp", frequency: 96.9, genre: "Notícias", streamUrl: `${STW}BANDNEWSFM_SPAAC_SC`, codec: "AAC", bitrate: 64 },
  { id: "sp-transamerica", name: "Rádio Transamérica", shortName: "Transamérica", city: "sp", frequency: 100.1, genre: "Pop", streamUrl: `${STW}RT_SPAAC.aac`, codec: "AAC", bitrate: 32 },
  { id: "sp-alpha", name: "Alpha FM", shortName: "Alpha FM", city: "sp", frequency: 101.7, genre: "Adulto", streamUrl: `${STW}RADIO_ALPHAFM_ADP.aac`, codec: "AAC", bitrate: 128 },
  { id: "sp-mix", name: "Mix FM", shortName: "Mix FM", city: "sp", frequency: 106.3, genre: "Pop", streamUrl: `${STW}MIXFM_SAOPAULOAAC.aac`, codec: "AAC", bitrate: 64 },

  // Rio de Janeiro
  { id: "rj-novabrasil", name: "Nova Brasil FM Rio", shortName: "Nova Brasil", city: "rj", frequency: 89.5, genre: "MPB", streamUrl: `${STW}NOVABRASIL_RIOAAC.aac`, codec: "AAC", bitrate: 48 },
  { id: "rj-globo", name: "Rádio Globo", shortName: "Globo", city: "rj", frequency: 98.1, genre: "Notícias", streamUrl: `${STW}RADIO_GLOBO_RJAAC.aac`, codec: "AAC", bitrate: 128 },
  { id: "rj-jbfm", name: "JB FM", shortName: "JB FM", city: "rj", frequency: 99.9, genre: "Adulto", streamUrl: `${STW}JBFMAAC1.aac`, codec: "AAC", bitrate: 40 },
  { id: "rj-cidade", name: "Rádio Cidade", shortName: "Rádio Cidade", city: "rj", frequency: 102.9, genre: "Rock", streamUrl: `${STW}RADIOCIDADEAAC.aac`, codec: "AAC", bitrate: 48 },

  // Belo Horizonte
  { id: "bh-alvorada", name: "Alvorada FM", shortName: "Alvorada", city: "bh", frequency: 94.9, genre: "Adulto", streamUrl: `${STW}RADIO_ALVORADAAAC.aac`, codec: "AAC", bitrate: 96 },
  { id: "bh-bhfm", name: "BH FM", shortName: "BH FM", city: "bh", frequency: 102.1, genre: "Pop", streamUrl: `${STW}BHFMAAC.aac`, codec: "AAC", bitrate: 128 },
  { id: "bh-cbn", name: "CBN Belo Horizonte", shortName: "CBN", city: "bh", frequency: 106.1, genre: "Notícias", streamUrl: `${STW}CBN_BHAAC.aac`, codec: "AAC", bitrate: 128 },

  // Web e outras cidades
  { id: "web-alpha-mpb", name: "Alpha MPB", shortName: "Alpha MPB", city: null, genre: "MPB", streamUrl: `${STW}ALPHAMPBAAC.aac`, codec: "AAC", bitrate: 96 },
  { id: "web-saudade", name: "Saudade FM", shortName: "Saudade FM", city: null, place: "Santos", frequency: 99.7, genre: "Adulto", streamUrl: `${STW}SAUDADE_FMAAC.aac`, codec: "AAC", bitrate: 64 },
  { id: "web-mix-recife", name: "Mix FM Recife", shortName: "Mix Recife", city: null, place: "Recife", frequency: 97.1, genre: "Pop", streamUrl: `${STW}MIXFM_RECIFE971AAC.aac`, codec: "AAC", bitrate: 64 },
  { id: "web-mix-poa", name: "Mix FM Porto Alegre", shortName: "Mix POA", city: null, place: "Porto Alegre", genre: "Pop", streamUrl: `${STW}MIXFM_POAAAC.aac`, codec: "AAC", bitrate: 64 },
  { id: "web-novabrasil-maceio", name: "Nova Brasil FM Maceió", shortName: "Nova Brasil", city: null, place: "Maceió", genre: "MPB", streamUrl: `${STW}NOVABRASIL_MACAAC.aac`, codec: "AAC", bitrate: 48 },

  // Internacionais
  { id: "es-los40-classic", name: "LOS40 Classic", shortName: "LOS40 Classic", city: null, intl: true, place: "Espanha", genre: "Pop", streamUrl: `${STW}LOS40_CLASSIC.mp3`, codec: "MP3", bitrate: 128 },
  { id: "es-los40-dance", name: "LOS40 Dance", shortName: "LOS40 Dance", city: null, intl: true, place: "Espanha", genre: "Dance", streamUrl: `${STW}LOS40_DANCE.mp3`, codec: "MP3", bitrate: 128 },
  { id: "es-cadena-dial", name: "Cadena Dial", shortName: "Cadena Dial", city: null, intl: true, place: "Espanha", genre: "Pop", streamUrl: `${STW}CADENADIAL.mp3`, codec: "MP3", bitrate: 128 },
  { id: "es-cadena-ser", name: "Cadena SER", shortName: "Cadena SER", city: null, intl: true, place: "Espanha", genre: "Notícias", streamUrl: `${STW}CADENASER.mp3`, codec: "MP3", bitrate: 128 },
  { id: "es-radiole", name: "Radiolé", shortName: "Radiolé", city: null, intl: true, place: "Espanha", genre: "Flamenco", streamUrl: `${STW}RADIOLE.mp3`, codec: "MP3", bitrate: 128 },
  { id: "ar-la100", name: "La 100", shortName: "La 100", city: null, intl: true, place: "Argentina", frequency: 99.9, genre: "Pop", streamUrl: `${STW}FM999_56.mp3`, codec: "MP3", bitrate: 96 },
  { id: "ar-rockandpop", name: "Rock & Pop", shortName: "Rock & Pop", city: null, rock: true, place: "Argentina", frequency: 95.9, genre: "Rock", streamUrl: `${STW}ROCKANDPOPAAC.aac`, codec: "AAC", bitrate: 64 },
  { id: "ar-aspen", name: "Aspen", shortName: "Aspen", city: null, intl: true, place: "Argentina", frequency: 102.3, genre: "Adulto", streamUrl: `${STW}ASPEN.mp3`, codec: "MP3", bitrate: 96 },
  { id: "ar-mitre", name: "Radio Mitre AM 790", shortName: "Radio Mitre", city: null, intl: true, place: "Argentina", genre: "Notícias", streamUrl: `${STW}AM790_56AAC.aac`, codec: "AAC", bitrate: 64 },
  { id: "mx-los40", name: "LOS40 México", shortName: "LOS40 México", city: null, intl: true, place: "México", frequency: 101.7, genre: "Pop", streamUrl: `${STW}LOS40_MEXICOAAC.aac`, codec: "AAC", bitrate: 192 },
  { id: "mx-exa", name: "Exa FM", shortName: "Exa FM", city: null, intl: true, place: "México", frequency: 104.9, genre: "Pop", streamUrl: `${STW}XHEXAAAC.aac`, codec: "AAC", bitrate: 48 },
  { id: "mx-kebuena", name: "La Ke Buena", shortName: "La Ke Buena", city: null, intl: true, place: "México", frequency: 92.9, genre: "Regional mexicana", streamUrl: `${STW}KEBUENAAAC.aac`, codec: "AAC", bitrate: 192 },
  { id: "mx-wradio", name: "W Radio", shortName: "W Radio", city: null, intl: true, place: "México", frequency: 96.9, genre: "Notícias", streamUrl: `${STW}W_RADIOAAC.aac`, codec: "AAC", bitrate: 192 },
  { id: "mx-smooth-jazz", name: "Smooth Jazz (iHeart)", shortName: "Smooth Jazz", city: null, intl: true, place: "México", genre: "Jazz", streamUrl: `${STW}ACIR22_s01AAC.aac`, codec: "AAC", bitrate: 48 },
  { id: "us-977-hits", name: ".977 Hitz", shortName: ".977 Hitz", city: null, intl: true, place: "EUA", genre: "Pop", streamUrl: `${STW}977_HITS_SC`, codec: "MP3", bitrate: 128 },
  { id: "us-977-80s", name: ".977 80s", shortName: ".977 80s", city: null, intl: true, place: "EUA", genre: "Anos 80", streamUrl: `${STW}977_80_SC`, codec: "MP3", bitrate: 128 },
  { id: "us-977-90s", name: ".977 90s", shortName: ".977 90s", city: null, intl: true, place: "EUA", genre: "Anos 90", streamUrl: `${STW}977_90_SC`, codec: "MP3", bitrate: 128 },
  { id: "us-977-mix", name: ".977 The Mix", shortName: ".977 Mix", city: null, intl: true, place: "EUA", genre: "Adulto", streamUrl: `${STW}977_MIX_SC`, codec: "MP3", bitrate: 128 },
  { id: "us-977-country", name: ".977 Country", shortName: ".977 Country", city: null, intl: true, place: "EUA", genre: "Country", streamUrl: `${STW}977_COUNTRY_SC`, codec: "MP3", bitrate: 128 },
  { id: "us-977-jamz", name: ".977 Jamz", shortName: ".977 Jamz", city: null, intl: true, place: "EUA", genre: "Hip-hop e R&B", streamUrl: `${STW}977_JAMZ_SC`, codec: "MP3", bitrate: 128 },
  { id: "us-977-oldies", name: ".977 Oldies", shortName: ".977 Oldies", city: null, intl: true, place: "EUA", genre: "Oldies", streamUrl: `${STW}977_OLDIES_SC`, codec: "MP3", bitrate: 128 },
  { id: "us-977-smoothjazz", name: ".977 Smooth Jazz", shortName: ".977 Jazz", city: null, intl: true, place: "EUA", genre: "Jazz", streamUrl: `${STW}977_SMOOJAZZ_SC`, codec: "MP3", bitrate: 128 },
  { id: "us-cspan", name: "C-SPAN Radio", shortName: "C-SPAN", city: null, intl: true, place: "EUA", frequency: 90.1, genre: "Notícias", streamUrl: `${STW}CSPANRADIO_SC`, codec: "MP3", bitrate: 40 },
  { id: "us-bloomberg", name: "Bloomberg Radio", shortName: "Bloomberg", city: null, intl: true, place: "EUA", genre: "Notícias", streamUrl: `${STW}WRCAAMAAC.aac`, codec: "AAC", bitrate: 112 },
  { id: "uk-bbc-ws-wrvo", name: "BBC World Service (via WRVO)", shortName: "BBC World", city: null, intl: true, place: "Reino Unido", genre: "Notícias", streamUrl: `${STW}WRVOHD3_SC`, codec: "MP3", bitrate: 24 },
  { id: "cl-los40", name: "LOS40 Chile", shortName: "LOS40 Chile", city: null, intl: true, place: "Chile", genre: "Pop", streamUrl: `${STW}LOS40_CHILEAAC.aac`, codec: "AAC", bitrate: 56 },
  { id: "ar-metro", name: "Metro 95.1", shortName: "Metro", city: null, intl: true, place: "Argentina", frequency: 95.1, genre: "Dance", streamUrl: `${STW}METROAAC.aac`, codec: "AAC", bitrate: 64 },
  { id: "co-bluradio", name: "Blu Radio Bogotá", shortName: "Blu Radio", city: null, intl: true, place: "Colômbia", frequency: 89.9, genre: "Notícias", streamUrl: `${STW}BLURADIO.mp3`, codec: "MP3", bitrate: 128 },


  // Rock internacional
  { id: "mx-mix-hardrock", name: "MIX Hard Rock", shortName: "MIX Hard Rock", city: null, rock: true, place: "México", genre: "Hard rock", streamUrl: `${STW}ACIR10_s01AAC.aac`, codec: "AAC", bitrate: 48 },
  { id: "mx-mix-alternativa", name: "Alternativa by MIX", shortName: "Alternativa", city: null, rock: true, place: "México", genre: "Alternativo", streamUrl: `${STW}ACIR12_s01AAC.aac`, codec: "AAC", bitrate: 48 },
  { id: "mx-loud-metal", name: "LOUD! Metal Radio", shortName: "LOUD! Metal", city: null, rock: true, place: "México", genre: "Metal", streamUrl: `${STW}ACIR37_s01AAC.aac`, codec: "AAC", bitrate: 48 },
  { id: "mx-rock-espanol", name: "Rock en Español", shortName: "Rock en Español", city: null, rock: true, place: "México", genre: "Rock em espanhol", streamUrl: `${STW}ACIR20_S01AAC.aac`, codec: "AAC", bitrate: 48 },
  { id: "cl-rockandpop", name: "Rock & Pop Chile", shortName: "Rock & Pop CL", city: null, rock: true, place: "Chile", genre: "Rock", streamUrl: `${STW}ROCK_AND_POPAAC_SC`, codec: "AAC", bitrate: 56 },
  { id: "cl-futuro", name: "Radio Futuro", shortName: "Futuro", city: null, rock: true, place: "Chile", genre: "Classic rock", streamUrl: `${STW}FUTUROAAC.aac`, codec: "AAC", bitrate: 56 },
  { id: "cl-concierto", name: "Radio Concierto", shortName: "Concierto", city: null, rock: true, place: "Chile", genre: "Pop rock", streamUrl: `${STW}CONCIERTOAAC.aac`, codec: "AAC", bitrate: 56 },
  { id: "co-radioacktiva", name: "Radioacktiva Bogotá", shortName: "Radioacktiva", city: null, rock: true, place: "Colômbia", frequency: 97.9, genre: "Rock", streamUrl: `${STW}RADIO_ACTIVAAAC.aac`, codec: "AAC", bitrate: 64 },
  { id: "us-klos", name: "95.5 KLOS Los Angeles", shortName: "KLOS", city: null, rock: true, place: "EUA", frequency: 95.5, genre: "Classic rock", streamUrl: `${STW}KLOSFMAAC.aac`, codec: "AAC" },
  { id: "us-kshe", name: "KSHE 95 St. Louis", shortName: "KSHE 95", city: null, rock: true, place: "EUA", frequency: 94.7, genre: "Classic rock", streamUrl: `${STW}KSHEFMAAC.aac`, codec: "AAC" },
  { id: "us-wmmr", name: "93.3 WMMR Filadélfia", shortName: "WMMR", city: null, rock: true, place: "EUA", frequency: 93.3, genre: "Rock", streamUrl: `${STW}WMMRFMAACIHR.aac`, codec: "AAC" },
  { id: "us-wrif", name: "101 WRIF Detroit", shortName: "WRIF", city: null, rock: true, place: "EUA", frequency: 101.1, genre: "Hard rock", streamUrl: `${STW}WRIFFMAACIHR.aac`, codec: "AAC" },
  { id: "us-wbos", name: "Rock 92.9 Boston", shortName: "Rock 92.9", city: null, rock: true, place: "EUA", frequency: 92.9, genre: "Classic rock", streamUrl: `${STW}WBOSFMAACIHR.aac`, codec: "AAC" },
  { id: "us-kqrs", name: "92 KQRS Minneapolis", shortName: "KQRS", city: null, rock: true, place: "EUA", frequency: 92.5, genre: "Classic rock", streamUrl: `${STW}KQRSFMAAC.aac`, codec: "AAC" },
  { id: "us-kkfm", name: "Classic Rock 98.1 Colorado Springs", shortName: "KKFM 98.1", city: null, rock: true, place: "EUA", frequency: 98.1, genre: "Classic rock", streamUrl: `${STW}KKFMFMAAC.aac`, codec: "AAC" },
  { id: "us-wxrx", name: "104.9 The X Rockford", shortName: "The X", city: null, rock: true, place: "EUA", frequency: 104.9, genre: "Alternativo", streamUrl: `${STW}WXRXFMAAC.aac`, codec: "AAC" },
  { id: "us-kdot", name: "Rock 104.5 KDOT Reno", shortName: "KDOT", city: null, rock: true, place: "EUA", frequency: 104.5, genre: "Hard rock", streamUrl: `${STW}KDOTFMAAC.aac`, codec: "AAC" },
  { id: "us-kxxr", name: "93X Minneapolis", shortName: "93X", city: null, rock: true, place: "EUA", frequency: 93.7, genre: "Metal", streamUrl: `${STW}KXXRFMAAC.aac`, codec: "AAC" },
  { id: "us-wjjo", name: "94.1 WJJO Madison", shortName: "WJJO", city: null, rock: true, place: "EUA", frequency: 94.1, genre: "Metal", streamUrl: `${STW}WJJOFMAAC.aac`, codec: "AAC" },
  { id: "us-wedg", name: "103.3 The Edge Buffalo", shortName: "The Edge", city: null, rock: true, place: "EUA", frequency: 103.3, genre: "Hard rock", streamUrl: `${STW}WEDGFMAAC.aac`, codec: "AAC" },
];

/**
 * Versão MP3 da mesma transmissão, por rádio do catálogo. Conferida no serviço da
 * StreamTheWorld em 10/11/2026 (montagem existente, áudio em MP3). Serve de reserva
 * quando o navegador não consegue tocar a versão AAC.
 */
const MP3_MOUNTS: Record<string, string> = {
  "sp-89fm": "RADIO_89FM",
  "sp-novabrasil": "NOVABRASIL_SP",
  "sp-cbn": "CBN_SP",
  "sp-disney": "DISNEY_BRA_SP",
  "sp-kiss": "RADIO_KISSFM",
  "sp-bandnews": "BANDNEWSFM_SP",
  "sp-transamerica": "RT_SP",
  "sp-alpha": "RADIO_ALPHAFM",
  "sp-mix": "MIXFM_SAOPAULO",
  "rj-novabrasil": "NOVABRASIL_RIO",
  "rj-globo": "RADIO_GLOBO_RJ",
  "rj-jbfm": "JBFM",
  "rj-cidade": "RADIOCIDADE",
  "bh-alvorada": "RADIO_ALVORADA",
  "bh-bhfm": "BHFM",
  "bh-cbn": "CBN_BH",
  "web-saudade": "SAUDADE_FM",
  "web-mix-recife": "MIXFM_RECIFE971",
  "web-mix-poa": "MIXFM_POA",
  "web-novabrasil-maceio": "NOVABRASIL_MAC",
  "es-los40-classic": "LOS40_CLASSIC",
  "es-los40-dance": "LOS40_DANCE",
  "es-cadena-dial": "CADENADIAL",
  "es-cadena-ser": "CADENASER",
  "es-radiole": "RADIOLE",
  "ar-la100": "FM999_56",
  "ar-rockandpop": "ROCKANDPOP",
  "ar-aspen": "ASPEN",
  "ar-mitre": "AM790_56",
  "mx-los40": "LOS40_MEXICO",
  "mx-exa": "XHEXA",
  "mx-kebuena": "KEBUENA",
  "mx-wradio": "W_RADIO",
  "mx-smooth-jazz": "ACIR22_s01",
  "us-977-hits": "977_HITS",
  "us-977-80s": "977_80",
  "us-977-90s": "977_90",
  "us-977-mix": "977_MIX",
  "us-977-country": "977_COUNTRY",
  "us-977-jamz": "977_JAMZ",
  "us-977-oldies": "977_OLDIES",
  "us-977-smoothjazz": "977_SMOOJAZZ",
  "us-cspan": "CSPANRADIO",
  "us-bloomberg": "WRCAAM",
  "uk-bbc-ws-wrvo": "WRVOHD3",
  "cl-los40": "LOS40_CHILE",
  "ar-metro": "METRO",
  "co-bluradio": "BLURADIO",
  "mx-mix-hardrock": "ACIR10_s01",
  "mx-mix-alternativa": "ACIR12_s01",
  "mx-loud-metal": "ACIR37_s01",
  "mx-rock-espanol": "ACIR20_S01",
  "cl-rockandpop": "ROCK_AND_POP",
  "cl-futuro": "FUTURO",
  "cl-concierto": "CONCIERTO",
  "co-radioacktiva": "RADIO_ACTIVA",
  "us-klos": "KLOSFM",
  "us-kshe": "KSHEFM",
  "us-wbos": "WBOSFM",
  "us-kqrs": "KQRSFM",
  "us-kkfm": "KKFMFM",
  "us-wxrx": "WXRXFM",
  "us-kdot": "KDOTFM",
  "us-kxxr": "KXXRFM",
  "us-wjjo": "WJJOFM",
  "us-wedg": "WEDGFM",
};

/** Versão MP3 da rádio, usada como reserva se a principal não tocar. */
export function mp3StreamUrl(s: Station): string | undefined {
  const mount = s.custom ? undefined : MP3_MOUNTS[s.id];
  if (mount) return `${STW}${mount}.mp3`;
  return /\.mp3(\?|$)/i.test(s.streamUrl) ? s.streamUrl : undefined;
}
