// Podcasts famosos da aba "Podcasts" (v30). Cada um é encontrado pelo nome no catálogo do Apple Podcasts
// (iTunes Search API, que abre até na rede da empresa/AVD) e os episódios vêm do mesmo catálogo.
// O GitHub Actions monta podcasts.json com os episódios a cada 6 horas; o site usa esse arquivo e,
// se ele faltar, consulta o catálogo direto do navegador.

export type PodcastTab = "noticias" | "humor" | "ciencia" | "historias" | "esportes" | "livros-pt" | "livros-outros";
export type PodcastLang = "pt" | "en" | "es";

export interface PodcastDef {
  id: string;
  name: string;
  tab: PodcastTab;
  /** Texto buscado no catálogo. */
  term: string;
  /** Trechos que o nome do podcast precisa ter (sem acento, minúsculas). */
  match: string[];
  /** Trecho que o nome do autor/produtora precisa ter (sem acento, minúsculas). */
  artist?: string;
  /** Loja do catálogo (padrão BR). */
  country?: "BR" | "US";
  /** Idioma, para o rótulo. */
  lang: PodcastLang;
  /** Código do programa no Apple Podcasts (quando já sabemos qual é: dispensa a busca pelo nome). */
  cid?: number;
  /** Audiolivro em capítulos: lista todos os episódios, do 1º capítulo ao último. */
  book?: boolean;
}

export const PODCAST_TABS: { id: PodcastTab; name: string }[] = [
  { id: "noticias", name: "Notícias" },
  { id: "humor", name: "Humor e entrevistas" },
  { id: "ciencia", name: "Ciência e tecnologia" },
  { id: "historias", name: "Histórias e crimes" },
  { id: "esportes", name: "Esportes" },
];

/** Abas da seção "Audiolivros" (v31): mesmos recursos do player de podcasts. */
export const AUDIOBOOK_TABS: { id: PodcastTab; name: string }[] = [
  { id: "livros-pt", name: "Em português" },
  { id: "livros-outros", name: "Outros idiomas" },
];

const pt = (id: string, name: string, tab: PodcastTab, match: string[], artist?: string, term = name): PodcastDef => ({ id, name, tab, term, match, artist, lang: "pt" });
const en = (id: string, name: string, tab: PodcastTab, match: string[], artist?: string, term = name): PodcastDef => ({ id, name, tab, term, match, artist, country: "US", lang: "en" });

export const PODCASTS: PodcastDef[] = [
  // Notícias
  pt("o-assunto", "O Assunto", "noticias", ["o assunto"], "g1", "O Assunto g1"),
  pt("cafe-da-manha", "Café da Manhã", "noticias", ["cafe da manha"], "folha"),
  pt("foro-de-teresina", "Foro de Teresina", "noticias", ["foro de teresina"]),
  pt("durma-com-essa", "Durma com Essa", "noticias", ["durma com essa"]),
  pt("xadrez-verbal", "Xadrez Verbal", "noticias", ["xadrez verbal"]),
  en("the-daily", "The Daily", "noticias", ["the daily"], "new york times"),
  en("up-first", "Up First", "noticias", ["up first"], "npr"),
  en("bbc-global-news", "Global News Podcast", "noticias", ["global news podcast"], "bbc"),
  // Humor e entrevistas
  pt("podpah", "Podpah", "humor", ["podpah"]),
  pt("flow", "Flow Podcast", "humor", ["flow"], undefined, "Flow Podcast"),
  pt("inteligencia-ltda", "Inteligência Ltda.", "humor", ["inteligencia ltda"]),
  pt("nerdcast", "NerdCast", "humor", ["nerdcast"], "jovem nerd"),
  pt("mamilos", "Mamilos", "humor", ["mamilos"]),
  pt("nao-inviabilize", "Não Inviabilize", "humor", ["nao inviabilize"]),
  en("joe-rogan", "The Joe Rogan Experience", "humor", ["joe rogan experience"]),
  en("smartless", "SmartLess", "humor", ["smartless"]),
  // Ciência e tecnologia
  pt("naruhodo", "Naruhodo", "ciencia", ["naruhodo"]),
  pt("dragoes-de-garagem", "Dragões de Garagem", "ciencia", ["dragoes de garagem"]),
  pt("braincast", "Braincast", "ciencia", ["braincast"]),
  pt("hipsters", "Hipsters Ponto Tech", "ciencia", ["hipsters"]),
  en("huberman-lab", "Huberman Lab", "ciencia", ["huberman lab"]),
  en("lex-fridman", "Lex Fridman Podcast", "ciencia", ["lex fridman"]),
  en("radiolab", "Radiolab", "ciencia", ["radiolab"]),
  en("ted-talks-daily", "TED Talks Daily", "ciencia", ["ted talks daily"]),
  // Histórias e crimes
  pt("projeto-humanos", "Projeto Humanos", "historias", ["projeto humanos"]),
  pt("modus-operandi", "Modus Operandi", "historias", ["modus operandi"]),
  pt("praia-dos-ossos", "Praia dos Ossos", "historias", ["praia dos ossos"]),
  pt("casa-abandonada", "A Mulher da Casa Abandonada", "historias", ["mulher da casa abandonada"]),
  en("crime-junkie", "Crime Junkie", "historias", ["crime junkie"]),
  en("serial", "Serial", "historias", ["serial"], "serial productions"),
  en("this-american-life", "This American Life", "historias", ["this american life"]),
  en("stuff-you-should-know", "Stuff You Should Know", "historias", ["stuff you should know"]),
  // Esportes
  pt("posse-de-bola", "Posse de Bola", "esportes", ["posse de bola"]),
  pt("futebol-no-mundo", "Futebol no Mundo", "esportes", ["futebol no mundo"]),
  pt("charla", "Charla Podcast", "esportes", ["charla"]),
  en("bill-simmons", "The Bill Simmons Podcast", "esportes", ["bill simmons"]),
  // ---- Audiolivros (v31): obras em domínio público publicadas como podcast (cada capítulo é um episódio) ----
  ...AUDIOBOOKS(),
];

function AUDIOBOOKS(): PodcastDef[] {
  const book = (id: string, name: string, tab: PodcastTab, lang: PodcastLang, cid: number, isBook: boolean, country: "BR" | "US" = "BR"): PodcastDef => ({
    id,
    name,
    tab,
    term: name,
    match: [],
    cid,
    country,
    lang,
    book: isBook || undefined,
  });
  return [
    // Em português
    book("livro-neolivros", "Audiolivros em português (Neolivros)", "livros-pt", "pt", 1537082032, true),
    book("livro-livros-para-ouvir", "Livros para Ouvir", "livros-pt", "pt", 1535338843, true),
    book("livro-leitura-de-ouvido", "Leitura de Ouvido", "livros-pt", "pt", 1502163177, false),
    book("livro-dominio-publico", "Domínio Público em Áudio", "livros-pt", "pt", 1551643281, true),
    book("livro-homem-arvores", "O Homem que Plantava Árvores", "livros-pt", "pt", 1534451139, true),
    // Outros idiomas
    book("livro-audiolibro-es", "Audiolibro En Español", "livros-outros", "es", 1802786237, false, "US"),
    book("livro-audiolibros-completos", "Audiolibros Completos", "livros-outros", "es", 1829587647, false, "US"),
    book("livro-pigeon-clasicos", "Audiolibros Pigeon: Clásicos", "livros-outros", "es", 1854667148, true, "US"),
    book("livro-librivox", "LibriVox Audiobooks", "livros-outros", "en", 1680031836, false, "US"),
    book("livro-sherlock-colecao", "Sherlock Holmes Complete Audiobook Collection", "livros-outros", "en", 1718444483, true, "US"),
    book("livro-sherlock-aventuras", "Adventures of Sherlock Holmes Audiobook", "livros-outros", "en", 1719866982, true, "US"),
    en("livro-classic-sleep", "Classic Books for Sleep", "livros-outros", ["classic books for sleep"]),
  ];
}

/** Serviços pagos de audiolivros: só atalhos (o áudio deles é protegido e toca apenas no app/site de cada um). */
export const PAID_AUDIOBOOKS: { name: string; url: string; info: string }[] = [
  { name: "Audible", url: "https://www.audible.com.br/", info: "Da Amazon. Best-sellers, lançamentos e clássicos em português; assinatura mensal com teste grátis." },
  { name: "Storytel", url: "https://www.storytel.com/br", info: "Assinatura de audiolivros e e-books, com muitos títulos narrados em português." },
  { name: "Ubook", url: "https://www.ubook.com/", info: "Serviço brasileiro de audiolivros, e-books e podcasts por assinatura." },
  { name: "Skeelo", url: "https://skeelo.com/pt/", info: "Um livro por mês (e-book ou audiolivro); às vezes já vem no plano do celular." },
  { name: "Apple Books", url: "https://www.apple.com/br/apple-books/", info: "Compra avulsa de audiolivros, com amostra grátis antes de comprar." },
  { name: "Google Play Livros", url: "https://play.google.com/store/books", info: "Compra avulsa de audiolivros; ouve no app Google Play Livros." },
];

/** Minúsculas, sem acentos e sem pontuação (igual ao `fold` do script do GitHub Actions). */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
