// Por onde o índice de músicas completas começa ("sementes").
// O GitHub procura as músicas mais ouvidas de cada artista daqui, das paradas e dos gêneros do Deezer.
// Para incluir músicas específicas, use musicas/pedidos.txt no repositório (não precisa mexer aqui).

/** Paradas com as músicas do momento (uma requisição cada). */
export const PARADAS = {
  /** Apple Music — mais tocadas (mesmos nomes do catálogo iTunes que o site usa). */
  apple: ["br", "us"],
  /** Playlists editoriais do Deezer: Top Brasil e Top Mundo. */
  deezerPlaylists: ["1111141961", "3155776842"],
};

/** Gêneros do Deezer cujos artistas mais ouvidos entram no índice (pop, rap, rock, dance, R&B, alternativo, eletrônica, metal, soul/funk, música brasileira, latina, reggae, country, jazz, blues, folk, gospel). */
export const GENEROS_DEEZER = [132, 116, 152, 113, 165, 85, 106, 464, 169, 75, 197, 144, 84, 129, 153, 466, 186];

/** Artistas das abas da rádio (Rock/Alt Metal/Metalcore, R&B, Brasil, synthwave) e grandes sucessos. */
export const ARTISTAS: string[] = [
  // Rock, Alt Metal, Metalcore, Hardcore
  "Linkin Park", "Bring Me The Horizon", "Slipknot", "Breaking Benjamin", "Disturbed", "Three Days Grace", "System Of A Down", "Deftones",
  "Korn", "Papa Roach", "Architects", "Parkway Drive", "Asking Alexandria", "Killswitch Engage", "August Burns Red", "Bad Omens", "Sleep Token",
  "Spiritbox", "Falling In Reverse", "Avenged Sevenfold", "Bullet For My Valentine", "Trivium", "Of Mice & Men", "A Day To Remember",
  "Motionless In White", "Ice Nine Kills", "I Prevail", "Wage War", "Beartooth", "Memphis May Fire", "Atreyu", "The Devil Wears Prada",
  "While She Sleeps", "Northlane", "Polaris", "Fit For A King", "Knocked Loose", "Turnstile", "Hatebreed", "Stick To Your Guns", "Sepultura",
  "Soulfly", "Mudvayne", "Godsmack", "Staind", "Chevelle", "Shinedown", "Starset", "Skillet", "Evanescence", "Within Temptation", "Nightwish",
  "Metallica", "Iron Maiden", "Megadeth", "Pantera", "Slayer", "Black Sabbath", "Ozzy Osbourne", "AC/DC", "Guns N' Roses", "Foo Fighters",
  "Nirvana", "Pearl Jam", "Soundgarden", "Alice In Chains", "Red Hot Chili Peppers", "Queens Of The Stone Age", "Muse", "Arctic Monkeys",
  "The Killers", "Green Day", "Blink-182", "My Chemical Romance", "Paramore", "Fall Out Boy", "Twenty One Pilots", "Imagine Dragons",
  "Rage Against The Machine", "Audioslave", "Limp Bizkit", "Incubus", "Hollywood Undead", "Five Finger Death Punch", "In This Moment",
  "Halestorm", "Ghost", "Gojira", "Mastodon", "Lamb Of God", "Bad Wolves", "Nothing More", "Seether", "Nickelback", "Creed", "3 Doors Down",
  "The Pretty Reckless", "Pitty", "Charlie Brown Jr.", "Capital Inicial", "Legião Urbana", "Titãs", "Skank", "Os Paralamas Do Sucesso",
  "Barão Vermelho", "CPM 22", "Detonautas Roque Clube", "NX Zero", "Fresno", "Raimundos", "O Rappa", "Engenheiros Do Hawaii", "Cazuza",
  "Raul Seixas", "Angra", "Project46", "Black Pantera", "Crypta",
  // R&B
  "The Weeknd", "SZA", "Beyoncé", "Usher", "Alicia Keys", "Rihanna", "Bruno Mars", "H.E.R.", "Chris Brown", "Frank Ocean", "Daniel Caesar",
  "Summer Walker", "Jhené Aiko", "Brent Faiyaz", "Giveon", "Miguel", "Ne-Yo", "John Legend", "Mariah Carey", "Whitney Houston",
  "Janet Jackson", "TLC", "Destiny's Child", "Boyz II Men", "Aaliyah", "Lauryn Hill", "Erykah Badu", "D'Angelo", "Kehlani", "Khalid",
  "Tinashe", "Victoria Monét", "Ari Lennox", "Jorja Smith", "Lucky Daye", "6LACK", "PARTYNEXTDOOR", "Tems", "Ella Mai", "Bryson Tiller",
  "Jeremih", "Mary J. Blige", "Toni Braxton", "Brandy", "Keyshia Cole", "Maxwell", "Anderson .Paak", "Silk Sonic", "Leon Bridges",
  "Coco Jones", "Muni Long",
  // Pop e sucessos internacionais
  "Taylor Swift", "Ed Sheeran", "Dua Lipa", "Billie Eilish", "Ariana Grande", "Justin Bieber", "Harry Styles", "Olivia Rodrigo",
  "Sabrina Carpenter", "Coldplay", "Maroon 5", "Lady Gaga", "Katy Perry", "Shawn Mendes", "Post Malone", "Drake", "Kendrick Lamar", "Eminem",
  "Travis Scott", "Doja Cat", "Bad Bunny", "Shakira", "Karol G", "Michael Jackson", "Queen", "The Beatles", "ABBA", "Madonna", "Elton John",
  "David Guetta", "Calvin Harris", "Avicii", "Alok", "Kygo", "Daft Punk",
  // Brasil
  "Anitta", "Ludmilla", "Pabllo Vittar", "Marília Mendonça", "Henrique & Juliano", "Jorge & Mateus", "Gusttavo Lima", "Zé Neto & Cristiano",
  "Maiara & Maraisa", "Simone Mendes", "Luan Santana", "Ana Castela", "Wesley Safadão", "Matheus & Kauan", "Os Barões Da Pisadinha",
  "Xand Avião", "João Gomes", "Péricles", "Thiaguinho", "Sorriso Maroto", "Grupo Menos É Mais", "Turma do Pagode", "Ferrugem", "Dilsinho",
  "Zeca Pagodinho", "Alcione", "Ivete Sangalo", "Claudia Leitte", "Djavan", "Caetano Veloso", "Gilberto Gil", "Chico Buarque", "Tim Maia",
  "Jorge Ben Jor", "Marisa Monte", "Seu Jorge", "Tribalistas", "Kid Abelha", "Lulu Santos", "Roberto Carlos", "Racionais MC's", "Matuê",
  "Filipe Ret", "L7NNON", "Veigh", "Orochi", "MC Cabelinho", "MC IG", "MC Ryan SP", "Kevin O Chris", "Pedro Sampaio", "Luísa Sonza", "IZA",
  "Gloria Groove", "Liniker", "Melim", "Vitor Kley", "Jão", "Marina Sena", "Natiruts", "Armandinho", "Hungria Hip Hop", "Projota",
  "Emicida", "Criolo", "BK'", "Djonga",
  // Synthwave / cyber
  "The Midnight", "Kavinsky", "Perturbator", "Carpenter Brut", "Gunship", "Timecop1983", "FM-84", "Mitch Murder", "Dance With The Dead",
  "Power Glove", "Lazerhawk", "Com Truise", "M83",
];
