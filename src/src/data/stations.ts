// Catálogo de rádios com stream público.
// Endereços de stream tirados do diretório público Radio Browser (verificação de 17/10/2026).
// Streams de terceiros podem sair do ar ou mudar de endereço sem aviso.

export type CityId = "sp" | "rj" | "bh";
export type BandId = CityId | "sports" | "web" | "intl" | "rock" | "rnb" | "fora";

/** Busca do endereço no diretório público Radio Browser, na hora de tocar (ver src/lib/station-lookup.ts). */
export interface StationLookup {
  /** Texto buscado no nome da rádio. */
  query: string;
  /** País (código ISO, ex.: "BR"). */
  country?: string;
  /** Palavras que o nome precisa ter (sem acento, minúsculas). */
  match?: string[];
  /** Pelo menos uma destas palavras precisa estar no nome. */
  matchAny?: string[];
  /** Nenhuma destas palavras pode estar no nome (ex.: canais extras da mesma marca). */
  exclude?: string[];
}

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
  /** Rádio de R&B e soul (aba R&B). */
  rnb?: boolean;
  /** Rádio de esportes (aba Esportes). */
  sports?: boolean;
  /**
   * Só toca fora da rede da empresa (aba "Fora da empresa"): o servidor da rádio não é a StreamTheWorld,
   * e na rede da AVD só a StreamTheWorld passa (teste de 19/11/2026: 85 de 85 tocaram nela, 0 de 28 fora dela).
   */
  outside?: boolean;
  genre: string;
  /** Endereço fixo. Vazio quando a rádio usa `lookup`. */
  streamUrl: string;
  /** Endereço buscado no diretório Radio Browser na hora de tocar (para rádios sem endereço fixo conferido). */
  lookup?: StationLookup;
  /**
   * Nomes possíveis do ponto de montagem na StreamTheWorld (Triton). Na hora de tocar, o site
   * pergunta à Triton quais existem e usa o primeiro que responder; se nenhum existir, usa `lookup`.
   */
  tritonCandidates?: string[];
  codec?: "AAC" | "MP3";
  bitrate?: number;
  /** Rádio adicionada pelo próprio ouvinte (guardada no navegador). */
  custom?: boolean;
  /**
   * Rádio descoberta automaticamente pelo GitHub (radios-extras.json, uma busca por dia no diretório
   * Radio Browser; só StreamTheWorld). Ver src/lib/radio-extras.ts.
   */
  extra?: boolean;
  /** Quando a rádio descoberta entrou no site (ms desde 1970). */
  addedAt?: number;
  /** Texto do anúncio da apresentadora para a rádio descoberta (o GitHub grava o áudio dele). */
  fala?: string;
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
  // Nativa FM (Grupo Bandeirantes). As rádios do grupo ficam na StreamTheWorld (BANDFM_SPAAC,
  // BANDNEWSFM_SPAAC, RadioBandeirantesAAC); o nome exato da Nativa não está publicado, então o site
  // pergunta à Triton quais destes existem. Se nenhum, procura no diretório Radio Browser.
  { id: "sp-nativa", name: "Nativa FM", shortName: "Nativa", city: "sp", frequency: 95.3, genre: "Sertanejo", streamUrl: "", codec: "AAC", tritonCandidates: ["NATIVAFM_SPAAC", "NATIVA_SPAAC", "NATIVA_FM_SPAAC", "NATIVAFMAAC", "NATIVAAAC", "RADIO_NATIVAAAC", "NATIVA_SAOPAULOAAC"], lookup: { query: "Nativa", country: "BR", match: ["nativa"], matchAny: ["95.3", "95,3", "sao paulo"] } },
  // Band FM (Grupo Bandeirantes), na StreamTheWorld: endereço listado no diretório Radio Browser
  // (BANDFM_SPAAC, conferido em 16/11/2026) e a versão MP3 (BANDFM_SP) em listas públicas de streams.
  { id: "sp-bandfm", name: "Band FM", shortName: "Band FM", city: "sp", frequency: 96.1, genre: "Popular", streamUrl: `${STW}BANDFM_SPAAC.aac`, codec: "AAC", bitrate: 64 },
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
  // Mix FM Porto Alegre: na StreamTheWorld e no ar segundo o Radio Browser (16/11/2026), mas não tocou na
  // AVD em 19/11/2026. O teste do aparelho agora mostra o motivo dado pela StreamTheWorld (404/453).
  { id: "web-mix-poa", name: "Mix FM Porto Alegre", shortName: "Mix POA", city: null, place: "Porto Alegre", genre: "Pop", streamUrl: `${STW}MIXFM_POAAAC.aac`, codec: "AAC", bitrate: 64 },
  // Mundo Livre FM (Curitiba), na StreamTheWorld: endereço listado no diretório Radio Browser (16/11/2026).
  { id: "web-mundolivre-cwb", name: "Mundo Livre FM", shortName: "Mundo Livre", city: null, place: "Curitiba", genre: "Pop rock", streamUrl: `${STW}MUNDOLIVRE_CWBAAC_64.aac`, codec: "AAC", bitrate: 64 },
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
  { id: "us-977-jamz", name: ".977 Jamz", shortName: ".977 Jamz", city: null, rnb: true, place: "EUA", genre: "Hip-hop e R&B", streamUrl: `${STW}977_JAMZ_SC`, codec: "MP3", bitrate: 128 },
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
  // Metal, nu metal e hard rock atuais, na StreamTheWorld (v26), no lugar dos canais da RADIO BOB! (que foram
  // para a aba "Fora da empresa": o servidor da BOB é bloqueado na rede da AVD). Pontos de montagem conferidos nas
  // páginas "Listen online" do netplayer.net e em radiostationsusa.com em 19/11/2026. KUPD é do mesmo grupo da
  // KSHE (Hubbard) e WRAT do mesmo grupo da WMMR/WRIF (Beasley), que tocaram na AVD; New Century é do Grupo ACIR,
  // como MIX Hard Rock e LOUD! Metal.
  { id: "us-kupd", name: "98 KUPD Phoenix", shortName: "98 KUPD", city: null, rock: true, place: "EUA", frequency: 97.9, genre: "Metal e hard rock", streamUrl: `${STW}KUPDFMAAC.aac`, codec: "AAC" },
  { id: "us-kilo", name: "94.3 KILO Colorado Springs", shortName: "KILO", city: null, rock: true, place: "EUA", frequency: 94.3, genre: "Metal e hard rock", streamUrl: `${STW}KILOFMAAC.aac`, codec: "AAC" },
  { id: "ca-ckge", name: "94.9 The Rock Oshawa", shortName: "The Rock", city: null, rock: true, place: "Canadá", frequency: 94.9, genre: "Metal e hard rock", streamUrl: `${STW}CKGEFMAAC.aac`, codec: "AAC" },
  { id: "us-wrat", name: "95.9 The Rat Nova Jersey", shortName: "The Rat", city: null, rock: true, place: "EUA", frequency: 95.9, genre: "Rock", streamUrl: `${STW}WRATFMAACIHR.aac`, codec: "AAC" },
  { id: "mx-new-century", name: "New Century (iHeart)", shortName: "New Century", city: null, rock: true, place: "México", genre: "Rock dos anos 2000", streamUrl: `${STW}ACIR04_S01AAC.aac`, codec: "AAC", bitrate: 48 },
  { id: "us-wedg", name: "103.3 The Edge Buffalo", shortName: "The Edge", city: null, rock: true, place: "EUA", frequency: 103.3, genre: "Hard rock", streamUrl: `${STW}WEDGFMAAC.aac`, codec: "AAC" },

  // R&B e soul.
  // 1) Na StreamTheWorld (Triton), a mesma plataforma da .977 Jamz e da maioria das rádios do site: é a que
  //    toca na rede da AVD. Pontos de montagem conferidos na lista pública da Triton
  //    (playerservices.streamtheworld.com/pls/<ponto>.pls) em 18/11/2026; as 7 tocaram na AVD em 19/11/2026.
  { id: "us-wzfx", name: "Foxy 99 WZFX", shortName: "Foxy 99", city: null, rnb: true, place: "EUA", frequency: 99.1, genre: "Hip-hop e R&B", streamUrl: `${STW}WZFXFMAAC.aac`, codec: "AAC", bitrate: 64 },
  { id: "us-wrnb", name: "100.3 WRNB Filadélfia", shortName: "WRNB 100.3", city: null, rnb: true, place: "EUA", frequency: 100.3, genre: "R&B", streamUrl: `${STW}WRNBFMAAC.aac`, codec: "AAC" },
  { id: "us-wmmj", name: "Majic 102.3 Washington", shortName: "Majic 102.3", city: null, rnb: true, place: "EUA", frequency: 102.3, genre: "R&B e soul", streamUrl: `${STW}WMMJFMAAC.aac`, codec: "AAC" },
  { id: "us-wamj", name: "Majic 107.5 Atlanta", shortName: "Majic 107.5", city: null, rnb: true, place: "EUA", frequency: 107.5, genre: "R&B e soul", streamUrl: `${STW}WAMJFMAAC.aac`, codec: "AAC" },
  { id: "us-wkys", name: "WKYS 93.9 Washington", shortName: "WKYS 93.9", city: null, rnb: true, place: "EUA", frequency: 93.9, genre: "Hip-hop e R&B", streamUrl: `${STW}WKYSFMAAC.aac`, codec: "AAC" },
  { id: "us-kbxx", name: "97.9 The Box Houston", shortName: "The Box", city: null, rnb: true, place: "EUA", frequency: 97.9, genre: "Hip-hop e R&B", streamUrl: `${STW}KBXXFMAAC.aac`, codec: "AAC" },
  { id: "es-los40-urban", name: "LOS40 Urban", shortName: "LOS40 Urban", city: null, rnb: true, place: "Espanha", genre: "Urbano (R&B, reggaeton, trap)", streamUrl: `${STW}LOS40_URBAN.mp3`, codec: "MP3", bitrate: 128 },
  // 2) Mais R&B e hip-hop na StreamTheWorld (v26), no lugar das 12 rádios de servidor próprio (que foram para a
  //    aba "Fora da empresa": na AVD só a StreamTheWorld passa). Pontos de montagem conferidos nas páginas
  //    "Listen online" do netplayer.net, em radiostationsusa.com e tingfm.com em 19/11/2026. A maioria é do grupo
  //    Urban One, o mesmo da WRNB, Majic 102.3/107.5, WKYS e The Box, que tocaram na AVD; Power 98 é da Beasley
  //    (mesmo grupo da Foxy 99); Hip-Hop House é do Grupo ACIR (iHeartRadio México).
  { id: "us-wqht", name: "HOT 97 Nova York", shortName: "HOT 97", city: null, rnb: true, place: "EUA", frequency: 97.1, genre: "Hip-hop", streamUrl: `${STW}WQHTFMAAC.aac`, codec: "AAC" },
  { id: "us-whta", name: "Hot 107.9 Atlanta", shortName: "Hot 107.9", city: null, rnb: true, place: "EUA", frequency: 107.9, genre: "Hip-hop e R&B", streamUrl: `${STW}WHTAFMAAC.aac`, codec: "AAC" },
  { id: "us-kmjq", name: "Majic 102.1 Houston", shortName: "Majic 102.1", city: null, rnb: true, place: "EUA", frequency: 102.1, genre: "R&B e soul", streamUrl: `${STW}KMJQFMAAC.aac`, codec: "AAC" },
  { id: "us-kzmj", name: "Majic 94.5 Dallas", shortName: "Majic 94.5", city: null, rnb: true, place: "EUA", frequency: 94.5, genre: "R&B e soul", streamUrl: `${STW}KZMJFMAAC.aac`, codec: "AAC" },
  { id: "us-kbfb", name: "97.9 The Beat Dallas", shortName: "The Beat", city: null, rnb: true, place: "EUA", frequency: 97.9, genre: "Hip-hop e R&B", streamUrl: `${STW}KBFBFMAAC.aac`, codec: "AAC" },
  { id: "us-werq", name: "92Q Jams Baltimore", shortName: "92Q", city: null, rnb: true, place: "EUA", frequency: 92.3, genre: "Hip-hop e R&B", streamUrl: `${STW}WERQFMAAC.aac`, codec: "AAC" },
  { id: "us-wwin", name: "Magic 95.9 Baltimore", shortName: "Magic 95.9", city: null, rnb: true, place: "EUA", frequency: 95.9, genre: "R&B e soul", streamUrl: `${STW}WWINFMAAC.aac`, codec: "AAC" },
  { id: "us-wzak", name: "93.1 WZAK Cleveland", shortName: "WZAK", city: null, rnb: true, place: "EUA", frequency: 93.1, genre: "R&B e soul", streamUrl: `${STW}WZAKFMAAC.aac`, codec: "AAC" },
  { id: "us-wpeg", name: "Power 98 Charlotte", shortName: "Power 98", city: null, rnb: true, place: "EUA", frequency: 97.9, genre: "Hip-hop e R&B", streamUrl: `${STW}WPEGFMAAC.aac`, codec: "AAC" },
  { id: "mx-hiphop-house", name: "Hip-Hop House (iHeart)", shortName: "Hip-Hop House", city: null, rnb: true, place: "México", genre: "Hip-hop em espanhol", streamUrl: `${STW}ACIR49_S01AAC.aac`, codec: "AAC", bitrate: 48 },

  // Esportes. Endereços citados em diretórios públicos (netplayer.net, radios.com.br, webradiodb,
  // tingfm.com), levantados em 11/11/2026. Todos na StreamTheWorld, que é o que toca na AVD (teste de
  // 19/11/2026). Itatiaia, Tupi, Grenal, Guaíba, Continental, talkSPORT, ESPN Radio e Fox Sports Radio usam
  // outros servidores e foram para a aba "Fora da empresa".
  { id: "sp-esp-bandeirantes", name: "Rádio Bandeirantes", shortName: "Bandeirantes", city: null, sports: true, place: "São Paulo", frequency: 90.9, genre: "Notícias e esportes", streamUrl: `${STW}RadioBandeirantesAAC.aac`, codec: "AAC", bitrate: 64 },
  { id: "ar-esp-dsports", name: "D Sports Radio 103.1", shortName: "D Sports", city: null, sports: true, place: "Argentina", frequency: 103.1, genre: "Esportes", streamUrl: `${STW}DSPORTSRADIOAAC.aac`, codec: "AAC", bitrate: 64 },
  { id: "ar-esp-lared", name: "La Red AM 910", shortName: "La Red", city: null, sports: true, place: "Argentina", genre: "Notícias e esportes", streamUrl: `${STW}LA_RED_AM910AAC.aac`, codec: "AAC" },
  { id: "es-esp-marca", name: "Radio Marca", shortName: "Marca", city: null, sports: true, place: "Espanha", genre: "Esportes", streamUrl: `${STW}RADIOMARCA_NACIONAL.mp3`, codec: "MP3" },
  // ADN (Chile) e Caracol Radio (Colômbia), do grupo Prisa, como Futuro/Concierto/LOS40 Chile e Radioacktiva, que
  // tocaram na AVD. Pontos de montagem conferidos nas páginas "Listen online" do netplayer.net em 19/11/2026.
  { id: "cl-esp-adn", name: "ADN Radio Chile", shortName: "ADN", city: null, sports: true, place: "Chile", frequency: 91.7, genre: "Notícias e esportes", streamUrl: `${STW}ADN.mp3`, codec: "MP3" },
  { id: "co-esp-caracol", name: "Caracol Radio Bogotá", shortName: "Caracol", city: null, sports: true, place: "Colômbia", frequency: 100.9, genre: "Notícias e esportes", streamUrl: `${STW}CARACOL_RADIOAAC.aac`, codec: "AAC" },
  { id: "us-esp-espn630", name: "ESPN 630 Washington", shortName: "ESPN 630", city: null, sports: true, place: "EUA", genre: "Esportes", streamUrl: `${STW}WSBNAMAAC.aac`, codec: "AAC" },
  { id: "us-esp-knbr", name: "KNBR 680 San Francisco", shortName: "KNBR", city: null, sports: true, place: "EUA", genre: "Esportes", streamUrl: `${STW}KNBRAMAAC.aac`, codec: "AAC" },
  { id: "us-esp-ticket", name: "The Ticket 1310 Dallas", shortName: "The Ticket", city: null, sports: true, place: "EUA", genre: "Esportes", streamUrl: `${STW}KTCKAMAAC.aac`, codec: "AAC" },
  { id: "us-esp-espndeportes", name: "ESPN Deportes 1460 Las Vegas", shortName: "ESPN Deportes", city: null, sports: true, place: "EUA", genre: "Esportes em espanhol", streamUrl: `${STW}KENOAMAAC.aac`, codec: "AAC" },
  { id: "mx-esp-wdeportes", name: "W Deportes 730", shortName: "W Deportes", city: null, sports: true, place: "México", genre: "Esportes", streamUrl: `${STW}TDW730AMAAC_SC`, codec: "AAC" },

  // Fora da empresa (aba própria, v26). Rádios que tocam no celular e em casa, mas não na rede da empresa (AVD):
  // usam servidores próprios ou de outras plataformas (brasilstream, Zeno.fm, Shoutcast, iHeart, Amperwave,
  // streamabc/RADIO BOB!, laut.fm, ...), e na AVD só a StreamTheWorld passa (teste de 19/11/2026: 85 de 85 rádios
  // da StreamTheWorld tocaram; 0 de 28 de outros servidores). Ficam juntas aqui para as abas principais tocarem
  // inteiras na AVD. Mesmos ids de antes: favoritas e "última rádio" continuam valendo.
  // São Paulo. Energia 97 não publica o endereço; a Metropolitana usa o servidor da Fábrica (listado no
  // diretório Radio Browser em 16/11/2026); a Jovem Pan só tem o retransmissor na Zeno.fm.
  { id: "sp-energia97", name: "Energia 97 FM", shortName: "Energia 97", city: null, outside: true, place: "São Paulo", frequency: 97.7, genre: "Pop", streamUrl: "", codec: "AAC", lookup: { query: "Energia 97", country: "BR", match: ["energia"], matchAny: ["97"] } },
  { id: "sp-metropolitana", name: "Metropolitana FM", shortName: "Metropolitana", city: null, outside: true, place: "São Paulo", frequency: 98.5, genre: "Pop", streamUrl: "https://ice.fabricahost.com.br/metropolitana985sp", codec: "AAC", bitrate: 64, lookup: { query: "Metropolitana", country: "BR", match: ["metropolitana"], matchAny: ["98.5", "98,5", "985", "sao paulo"], exclude: ["pop", "sertanejo", "funk", "light", "ribeirao", "foz", "maceio", "fortaleza", "salvador", "goiania"] } },
  { id: "sp-jovempan", name: "Jovem Pan FM", shortName: "Jovem Pan", city: null, outside: true, place: "São Paulo", frequency: 100.9, genre: "Pop", streamUrl: "https://stream.zeno.fm/c45wbq2us3buv", codec: "AAC", bitrate: 128 },
  // Web. Procurada no diretório Radio Browser na hora de tocar.
  { id: "web-alternativa-baixio", name: "Alternativa Educadora FM", shortName: "Alternativa", city: null, outside: true, place: "Baixio (CE)", frequency: 91.5, genre: "Popular", streamUrl: "", lookup: { query: "Alternativa Educadora", country: "BR", match: ["alternativa", "educadora"] } },
  // Rock: canais oficiais da RADIO BOB! (Alemanha), conforme a lista publicada em streams.radiobob.de (13/11 e
  // 18/11/2026). streams.radiobob.de redireciona para regiocast.streamabc.net. Reserva: MP3 de 128 kbps.
  { id: "de-bob-metalcore", name: "RADIO BOB! Metalcore", shortName: "BOB Metalcore", city: null, outside: true, rock: true, place: "Alemanha", genre: "Metalcore", streamUrl: "https://streams.radiobob.de/metalcore/mp3-192/streams.radiobob.de/", codec: "MP3", bitrate: 192 },
  { id: "de-bob-numetal", name: "RADIO BOB! Nu Metal", shortName: "BOB Nu Metal", city: null, outside: true, rock: true, place: "Alemanha", genre: "Nu metal / alt metal", streamUrl: "https://streams.radiobob.de/numetal/mp3-192/streams.radiobob.de/", codec: "MP3", bitrate: 192 },
  { id: "de-bob-rockamring", name: "Rock am Ring Radio (RADIO BOB!)", shortName: "Rock am Ring", city: null, outside: true, rock: true, place: "Alemanha", genre: "Metalcore / alt metal", streamUrl: "https://streams.radiobob.de/rockamring/mp3-192/streams.radiobob.de/", codec: "MP3", bitrate: 192 },
  { id: "de-bob-punk", name: "RADIO BOB! Punk", shortName: "BOB Punk", city: null, outside: true, rock: true, place: "Alemanha", genre: "Punk / hardcore", streamUrl: "https://streams.radiobob.de/bob-punk/mp3-192/streams.radiobob.de/", codec: "MP3", bitrate: 192 },
  { id: "de-bob-metal", name: "RADIO BOB! Metal", shortName: "BOB Metal", city: null, outside: true, rock: true, place: "Alemanha", genre: "Metal", streamUrl: "https://streams.radiobob.de/bob-metal/mp3-192/streams.radiobob.de/", codec: "MP3", bitrate: 192 },
  // R&B: servidores próprios de cada rádio (diretório Radio Browser, 16/10/2026; só https).
  { id: "us-181-truernb", name: "181.FM True R&B", shortName: "True R&B", city: null, outside: true, rnb: true, place: "EUA", genre: "R&B", streamUrl: "https://listen.181fm.com/181-rnb_128k.mp3", codec: "MP3", bitrate: 128 },
  { id: "us-181-beat", name: "181.FM The Beat", shortName: "181 The Beat", city: null, outside: true, rnb: true, place: "EUA", genre: "Hip-hop e R&B", streamUrl: "https://listen.181fm.com/181-beat_128k.mp3", codec: "MP3", bitrate: 128 },
  { id: "us-100hiphoprnb", name: "100 Hip Hop and RNB FM", shortName: "100 HipHop RnB", city: null, outside: true, rnb: true, place: "EUA", genre: "Hip-hop e R&B", streamUrl: "https://streaming.shoutcast.com/100-hip-hop-and-rnb-fm", codec: "MP3", bitrate: 128 },
  { id: "de-1live-rnb", name: "1LIVE RnB & Hip Hop", shortName: "1LIVE RnB", city: null, outside: true, rnb: true, place: "Alemanha", genre: "R&B e hip-hop", streamUrl: "https://wdr-1live-hiphoprnb.icecast.wdr.de/wdr/1live/hiphoprnb/mp3/128/stream.mp3", codec: "MP3", bitrate: 128 },
  { id: "de-0n-black", name: "0N Black on Radio", shortName: "0N Black", city: null, outside: true, rnb: true, place: "Alemanha", genre: "R&B e soul", streamUrl: "https://0n-black.radionetz.de/0n-black.mp3", codec: "MP3", bitrate: 128 },
  { id: "it-rmc-rnb", name: "RMC R&B", shortName: "RMC R&B", city: null, outside: true, rnb: true, place: "Itália", genre: "R&B", streamUrl: "https://icy.unitedradio.it/rmcweb003", codec: "MP3", bitrate: 128 },
  { id: "nl-npo-blend", name: "NPO Blend", shortName: "NPO Blend", city: null, outside: true, rnb: true, place: "Holanda", genre: "Soul e R&B", streamUrl: "https://icecast.omroep.nl/npoblend-bb-mp3", codec: "MP3", bitrate: 192 },
  { id: "de-luxfunk-blackmix", name: "Luxfunk Blackmix", shortName: "Luxfunk", city: null, outside: true, rnb: true, place: "Alemanha", genre: "Black music", streamUrl: "https://luxfunkbroadcast.com/proxy/luxfunkblackmix/stream", codec: "MP3", bitrate: 192 },
  { id: "de-astounded", name: "Astounded Old School", shortName: "Old School", city: null, outside: true, rnb: true, place: "Alemanha", genre: "R&B old school", streamUrl: "https://stream.laut.fm/astounded", codec: "MP3", bitrate: 128 },
  { id: "er-whitney", name: "Exclusively Whitney Houston", shortName: "Whitney", city: null, outside: true, rnb: true, place: "Web", genre: "R&B", streamUrl: "https://streaming.exclusive.radio/er/whitneyhouston/icecast.audio", codec: "MP3", bitrate: 128 },
  { id: "er-weeknd", name: "Exclusively The Weeknd", shortName: "The Weeknd", city: null, outside: true, rnb: true, place: "Web", genre: "R&B", streamUrl: "https://streaming.exclusive.radio/er/theweeknd/icecast.audio", codec: "MP3", bitrate: 128 },
  { id: "er-janet", name: "Exclusively Janet Jackson", shortName: "Janet", city: null, outside: true, rnb: true, place: "Web", genre: "R&B", streamUrl: "https://streaming.exclusive.radio/er/janetjackson/icecast.audio", codec: "MP3", bitrate: 128 },
  // Esportes. A Radio Continental saiu da StreamTheWorld (o ponto CONTINENTALAAC não tocou em 19/11/2026) e hoje
  // transmite pelo radiohdvivo.com (netplayer.net, 19/11/2026).
  { id: "bh-esp-itatiaia", name: "Rádio Itatiaia", shortName: "Itatiaia", city: null, outside: true, sports: true, place: "Belo Horizonte", frequency: 95.7, genre: "Notícias e esportes", streamUrl: "https://8903.brasilstream.com.br/stream", codec: "AAC", bitrate: 64 },
  { id: "rj-esp-tupi", name: "Super Rádio Tupi", shortName: "Tupi", city: null, outside: true, sports: true, place: "Rio de Janeiro", frequency: 96.5, genre: "Notícias e esportes", streamUrl: "https://8923.brasilstream.com.br/stream", codec: "AAC", bitrate: 32 },
  { id: "poa-esp-grenal", name: "Rádio Grenal", shortName: "Grenal", city: null, outside: true, sports: true, place: "Porto Alegre", frequency: 95.9, genre: "Futebol", streamUrl: "https://grenal.audiostream.com.br:20000/aac", codec: "AAC" },
  { id: "poa-esp-guaiba", name: "Rádio Guaíba", shortName: "Guaíba", city: null, outside: true, sports: true, place: "Porto Alegre", frequency: 101.3, genre: "Notícias e esportes", streamUrl: "https://radio.saopaulo01.com.br:10827/stream" },
  { id: "ar-esp-continental", name: "Radio Continental", shortName: "Continental", city: null, outside: true, sports: true, place: "Argentina", genre: "Notícias e esportes", streamUrl: "https://frontend.radiohdvivo.com/continental/live" },
  { id: "uk-esp-talksport", name: "talkSPORT", shortName: "talkSPORT", city: null, outside: true, sports: true, place: "Reino Unido", genre: "Esportes", streamUrl: "https://radio.talksport.com/stream", bitrate: 64 },
  { id: "us-esp-espn", name: "ESPN Radio", shortName: "ESPN", city: null, outside: true, sports: true, place: "EUA", genre: "Esportes", streamUrl: "https://live.amperwave.net/direct/espn-network-48" },
  { id: "us-esp-foxsports", name: "Fox Sports Radio", shortName: "Fox Sports", city: null, outside: true, sports: true, place: "EUA", genre: "Esportes", streamUrl: "https://stream.revma.ihrhls.com/zc4732" },
  // Rádios GTA (v29): web rádios de fãs com as músicas das rádios dos jogos Grand Theft Auto. Não são da Rockstar.
  // GTA Radio: endereço listado em radiostationsusa.com (23/11/2026). Los Santos Radio: canal do laut.fm (Alemanha)
  // "Musik aller GTA 5 Radiosender" (laut.fm/los-santos-radio, 23/11/2026). Reserva: diretório Radio Browser.
  { id: "web-gta-radio", name: "GTA Radio", shortName: "GTA Radio", city: null, outside: true, place: "Web", genre: "Trilhas do GTA", streamUrl: "https://ss-edge.joeycast.com/gtaradio.mp3", codec: "MP3", lookup: { query: "GTA Radio", match: ["gta"] } },
  { id: "de-los-santos-radio", name: "Los Santos Radio", shortName: "Los Santos", city: null, outside: true, place: "Alemanha", genre: "Trilhas do GTA V", streamUrl: "https://stream.laut.fm/los-santos-radio", codec: "MP3", bitrate: 128, lookup: { query: "Los Santos Radio", match: ["los santos"] } },
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
  "sp-bandfm": "BANDFM_SP",
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
  // RADIO BOB!: reserva em 128 kbps.
  if (s.streamUrl.includes("streams.radiobob.de/") && s.streamUrl.includes("/mp3-192/")) return s.streamUrl.replace("/mp3-192/", "/mp3-128/");
  return /\.mp3(\?|$)/i.test(s.streamUrl) ? s.streamUrl : undefined;
}

/** Endereço descoberto na hora de tocar (StreamTheWorld ou diretório), por rádio. */
const RESOLVED = new Map<string, string>();
export function setResolvedStream(id: string, url: string) {
  RESOLVED.set(id, url);
}
/** Endereço efetivo da rádio: o fixo ou o descoberto na hora de tocar. */
export function streamUrlOf(s: Station): string {
  return s.streamUrl || RESOLVED.get(s.id) || "";
}

const COUNTRY_OF_PLACE: Record<string, string> = {
  Espanha: "ES",
  Argentina: "AR",
  "México": "MX",
  EUA: "US",
  Chile: "CL",
  "Colômbia": "CO",
  "Reino Unido": "GB",
  Alemanha: "DE",
  "Itália": "IT",
  Holanda: "NL",
  "Canadá": "CA",
  // Países que as rádios descobertas automaticamente podem ter (radios-extras.json).
  Peru: "PE",
  Equador: "EC",
  Uruguai: "UY",
  Paraguai: "PY",
  "Bolívia": "BO",
  Venezuela: "VE",
  "Costa Rica": "CR",
  Guatemala: "GT",
  "Panamá": "PA",
  "República Dominicana": "DO",
  "Porto Rico": "PR",
  "El Salvador": "SV",
  Honduras: "HN",
  "Nicarágua": "NI",
  Cuba: "CU",
  Portugal: "PT",
  Irlanda: "IE",
  "França": "FR",
  "Bélgica": "BE",
  "Austrália": "AU",
  "Nova Zelândia": "NZ",
  "África do Sul": "ZA",
};
const STOP_WORDS = new Set(["fm", "am", "radio", "the", "via", "de", "da", "do", "la", "el", "and", "by"]);
const foldName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/**
 * Última tentativa quando nenhum endereço da rádio tocou: procura a mesma rádio (mesmo nome e país)
 * no diretório Radio Browser. Sem país conhecido, não procura (o nome sozinho pode achar outra rádio).
 */
export function rescueLookupOf(s: Station): StationLookup | null {
  // Rádio descoberta: o GitHub confere todo dia e tira as que param de tocar; não procura substituta.
  if (s.custom || s.extra) return null;
  if (s.lookup) return s.lookup;
  const country = s.city || (!s.intl && !s.rock && !s.rnb && s.place && !COUNTRY_OF_PLACE[s.place] && s.place !== "Web") ? "BR" : s.place ? COUNTRY_OF_PLACE[s.place] : undefined;
  if (!country) return null;
  const base = s.name.replace(/\(.*?\)/g, " ");
  const words = foldName(base)
    .split(/[^a-z0-9.!&]+/)
    .map((w) => w.replace(/[!.]+$/, ""))
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  if (!words.length) return null;
  return { query: base.trim(), country, match: words.slice(0, 3) };
}
