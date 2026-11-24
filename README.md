# Cyberwave Radio

Site de rádios ao vivo (brasileiras, internacionais e de esportes) que toca as transmissões
públicas das emissoras direto no navegador. Não precisa de login nem de licença: basta o link.
Visual inspirado no estilo Cyberpunk 2077 (sem usar logotipos ou marcas do jogo).

## Publicar no GitHub Pages

O site fica no **index.html** mais os arquivos da apresentadora ANDRA-18: **host.css**,
**host.js**, **host-rig.js** e **assets/host.png** (no pacote cyberwave-radio-site.zip ou na pasta
`dist`, depois de gerar o site). Envie todos, mantendo a pasta `assets`.

1. Crie um repositório **público** no GitHub.
2. Na página do repositório: **Add file → Upload files**, arraste o conteúdo do pacote
   (index.html, host.css, host.js, host-rig.js e a pasta assets) e clique em **Commit changes**.
3. Vá em **Settings → Pages → Build and deployment** e, em *Source*, escolha **GitHub Actions**. Quem publica o
   site é o workflow `.github/workflows/noticias.yml` (vem no pacote; veja "Notícias da apresentadora").
4. Em alguns minutos o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Alterar o site (para quem programa)

Requer Node.js 20 ou mais novo.

```
npm install
npm run dev      # abre uma versão local para testar
npm run build    # gera a pasta dist com o site pronto
```

Depois de gerar, envie o `dist/index.html` para o repositório, substituindo o antigo.

- Lista de rádios: `src/data/stations.ts`
- Logo do fundo da página: `src/assets/logo-cyberwave.webp` (estilo `.cw-logo-bg` em `src/index.css`)
- Tela principal: `src/pages/home.tsx`
- "Tocando agora" em tempo real (canal Sideband Metadata da Triton): `src/lib/triton-live.ts`
- "Tocando agora" pelo histórico público da Triton, álbum e banda: `src/lib/now-playing.ts`
- Espectro de frequência e medidores VU sincronizados com o som (Web Audio API): `src/lib/audio-fx.ts`
- Transmissão I.A. (apresentadora ANDRA-18, só no computador): `src/components/ai-broadcast.tsx`
  e as animações no fim de `src/index.css` (classes `ai-*` e `andra-*`)
- Falas fixas da ANDRA-18: `src/lib/andra-script.ts`; voz: `src/lib/andra-voice.ts`
- Estabilidade das rádios e teste no aparelho: `src/lib/stream-health.ts` e `src/components/station-check.tsx`
- Manchetes da apresentadora: `src/lib/news.ts` (lê o `noticias.json`) e `.github/workflows/noticias.yml`
  (busca as manchetes e publica o site)

## Notícias da apresentadora (CNN Brasil, BBC News Brasil, Fox News, Revista Oeste, Ancapsu)

Os sites de notícia não deixam o navegador ler as manchetes direto, então o próprio GitHub busca
as manchetes a cada 15 minutos e publica o arquivo `noticias.json` junto com o site.

1. No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Add file → Create new file**, nome `.github/workflows/noticias.yml`, cole o conteúdo do arquivo
   `noticias.yml` e clique em **Commit changes**.
3. Na aba **Actions**, a execução "Cyberwave Radio - site e notícias" deve ficar verde em 1 ou 2 minutos.
   Depois disso, cada envio de arquivo e a cada 15 minutos o site é publicado de novo com as manchetes novas.

Fontes usadas: CNN Brasil (seção Internacional), BBC News Brasil, Fox News (World, em inglês),
Revista Oeste (seção Mundo) e o canal Ancapsu no YouTube. Se o site de uma fonte bloquear os
servidores do GitHub, o workflow tenta o Google Notícias daquele veículo e, se nada responder,
mantém as manchetes da execução anterior. Para trocar as fontes, edite a lista `SOURCES` no
`noticias.yml` e a lista `NEWS_SOURCES` em `src/lib/news.ts` (as duas precisam ficar iguais). Manchetes com "urgente", "plantão", "ao vivo", "breaking" e parecidas, publicadas
nas últimas 12 horas, viram plantão urgente e interrompem a apresentadora uma vez por sessão.

A apresentadora repete apenas o título publicado por cada fonte, com o nome da fonte e o link para a
matéria; não escreve nem resume notícias. Ela aparece em telas de computador (1024 px ou mais, com
mouse) e pode ser ocultada pelo botão "Ocultar". O GitHub pausa agendamentos de repositórios sem
nenhuma atividade por 60 dias; se as notícias pararem, abra a aba Actions e reative.

**Plano B no navegador (conexão direta):** se o `noticias.json` não existir, vier vazio, estiver
com mais de 3 horas ou se alguma fonte falhou no GitHub, o próprio site busca os feeds dessas fontes
pelo serviço público rss2json.com (sem enviar o endereço do site) e guarda o resultado por 15 minutos.

**Diagnóstico:** clique no status das notícias, no canto do painel da apresentadora (ex.:
"NOTÍCIAS 16h20 • 5/5 FONTES"), para ver se o arquivo do GitHub foi publicado e o que aconteceu
com cada fonte. Na aba **Actions**, cada execução mostra um resumo com o status de cada fonte.

- "não encontrado (HTTP 404)": o workflow ainda não publicou o site. Confira se o arquivo está em
  `.github/workflows/noticias.yml` (com o ponto no começo) e se a aba Actions mostra
  "Cyberwave Radio - site e notícias" no menu da esquerda. Atenção: com Source = GitHub Actions,
  só o workflow publica o site; sem ele, nenhum arquivo novo entra no ar.
- "desatualizado": o agendamento parou ou atrasou; abra a aba Actions e rode o workflow
  (**Run workflow**).
- Execução vermelha com *Multiple artifacts named "github-pages"*: aconteceu ao repetir uma execução
  (**Re-run jobs**) com o workflow anterior à v28. Use **Run workflow** (execução nova) ou espere a próxima
  automática; a partir da v28 o Re-run também funciona.

O espectro e o VU seguem o som de verdade quando o servidor da rádio libera a leitura do áudio
para outros sites (cabeçalho CORS). Quando não libera, ou no celular, a animação é simulada e o
painel mostra "ANIMAÇÃO SIMULADA". Se a leitura só devolver silêncio, o player volta sozinho para
o modo comum, para a rádio nunca ficar muda.

A Jovem Pan FM (aba "Fora da empresa") toca por um retransmissor na Zeno.fm listado no diretório Radio
Browser; não foi encontrado um endereço HTTPS público do servidor da própria emissora.

As rádios adicionadas em "Minhas rádios" e as favoritas ficam salvas no navegador de cada pessoa.
As transmissões e marcas pertencem às respectivas emissoras.

## ANDRA-18 v5 "Human Motion" (cartão animado)

Arquivos na raiz do repositório (vêm de `public/` no build):

- `host.css`, `host-rig.js` (movimento: molas, respiração, gestos, olhar que segue o cursor, boca),
  `host.js` (legenda, botões, gestos de acordo com a fala) e `assets/host.png` (1024 x 1536, não redimensione).
- O cartão `#cw-host` está no `index.html`. O site o coloca dentro do painel CW NEWS (coluna da
  esquerda no computador, topo no celular). "Ocultar" no painel guarda o cartão e para a animação.
- A voz é a do site (neural feminina gravada em `voz/`, ou a voz feminina do navegador). O `host.js`
  recebe os eventos `cw:speak`, `cw:speakend`, `cw:stationchange` e `cw:trackchange` e escolhe
  gestos e expressão: plantão → inclina e se surpreende; notícia grave → expressão pensativa e
  movimentos calmos; esporte/vitória → feliz e mais energia; manchete → toca o headset ou aponta.
- Ajuste de movimento no console: `CyberwaveRig.config.amp = 1.3`, `CyberwaveRig.gesture('wave')`.
  A integração reduz o deslocamento da cabeça (linha `Object.assign(rig().config, …)` em `host.js`)
  para não aparecer a "cabeça dupla" das camadas recortadas.

## Teste automático das rádios (GitHub)

A cada 6 horas (e a cada envio de arquivos) o GitHub testa todas as rádios e publica
`radios-status.json`. O resumo aparece na aba Actions, com cada rádio fora do ar e o motivo.
O site usa o resultado para começar pelo endereço que funcionou e mostra um "!" vermelho nas
rádios que falharam nos 2 últimos testes. Os servidores do GitHub ficam nos EUA: rádios que só
liberam acesso no Brasil podem aparecer como fora do ar lá e tocar normalmente aqui.
Intervalo: variável `RADIOS_A_CADA_HORAS` (Settings → Secrets and variables → Actions → Variables).

## Rádios descobertas na hora de tocar

**Nativa FM (São Paulo):** as rádios do Grupo Bandeirantes ficam na StreamTheWorld, mas o nome exato
do ponto de montagem da Nativa não está publicado. Ao apertar o play, o site pergunta à Triton
(StreamTheWorld) quais dos nomes da lista `tritonCandidates` existem e toca o primeiro; com isso o
"Tocando agora" também funciona. Se nenhum existir, procura no diretório público Radio Browser.

**Alternativa Educadora FM (Baixio-CE):** procurada no diretório Radio Browser (`src/lib/station-lookup.ts`),
só endereços https (o navegador bloqueia áudio http num site https). O resultado fica guardado 12 h.
Se não houver endereço https, o player mostra a falha e "Tentar de novo".

A aba **Rock internacional** reúne rock, hard rock e metal; a aba **R&B**, R&B, soul e hip-hop. Os canais da
RADIO BOB! (Metalcore, Nu Metal, Rock am Ring, Punk e Metal) ficam na aba **Fora da empresa** (veja a v26).

## Voz da ANDRA-18 (igual em qualquer aparelho)

A voz não depende mais do navegador: o GitHub Actions grava as falas e as manchetes em MP3 com
uma voz neural feminina em português (pasta `voz/` do site, atualizada a cada 15 minutos).

- **Recomendado (oficial):** crie um recurso *Speech* no Azure (plano gratuito F0) e cadastre em
  **Settings → Secrets and variables → Actions** os segredos `AZURE_SPEECH_KEY` e
  `AZURE_SPEECH_REGION` (ex.: `brazilsouth`).
- **Sem cadastro:** sem esses segredos, a gravação usa o pacote `edge-tts` (mesmas vozes neurais,
  serviço não oficial, pode parar sem aviso).
- Voz padrão: `pt-BR-ThalitaMultilingualNeural` (lê bem também as manchetes em inglês); se não
  estiver disponível, `pt-BR-FranciscaNeural`. Para trocar, crie a variável `ANDRA_VOZ` em
  **Settings → Secrets and variables → Actions → Variables**.
- Enquanto não houver gravação (ou se ela falhar), o site usa a voz feminina em português mais
  natural do navegador. Vozes masculinas nunca são usadas; sem voz feminina no aparelho, aparece
  só a legenda.
- Arte própria: um arquivo `assets/host.png` no repositório substitui o desenho da apresentadora.
- Botões: **Apresentar**, **Notícias**, **Silenciar** e **Voz automática** (anuncia a rádio, lê
  plantões urgentes e faz um giro de notícias a cada 30 minutos). Pelo código:
  `CyberwaveHost.speak(texto)`, `CyberwaveHost.readNews()`, `CyberwaveHost.present()`, `CyberwaveHost.stop()`.

## Estabilidade das rádios (computador, celular e AVD)

- Endereço que não responde em 15 s é trocado pela reserva (MP3 da mesma rádio); se nenhum tocar, o
  site procura a mesma rádio no diretório Radio Browser e lembra neste navegador o endereço que funcionou.
- Queda de conexão durante a reprodução: reconecta sozinho (até 2 vezes seguidas) e volta a tocar
  quando a internet, VPN ou a área de trabalho virtual reconecta.
- **Testar rádios neste aparelho** (acima do dial): toca cada rádio sem som e mostra quais
  funcionam ali. Faça o teste em cada ambiente; as que falharem podem ser ocultadas só naquele navegador.

## Agente de I.A. da ANDRA-18 (Copilot Studio)

Os visitantes podem perguntar à ANDRA-18 por texto ou pelo microfone (Chrome e Edge). A resposta vem
de um agente do Microsoft Copilot Studio ("ANDRA-18 Cyberwave Radio", com busca na web), aparece em
legenda com os links das fontes e é lida pela voz feminina do navegador. Código: `src/lib/andra-agent.ts`.

Para ligar:
1. No Copilot Studio, abra o agente → **Configurações → Segurança → Autenticação** → **Sem autenticação**
   (necessário para um site público; a política da empresa pode bloquear essa opção).
2. **Publicar** o agente.
3. **Canais → Aplicativo móvel** → copie o **Ponto de extremidade do token**.
4. Crie na raiz do repositório o arquivo `agente.json` (modelo em `agente.exemplo.json`):
   `{ "tokenEndpoint": "https://....api.powerplatform.com/powervirtualagents/botsbyschema/.../directline/token?api-version=2022-03-01-preview" }`

Sem o `agente.json`, a caixa de pergunta fica desativada. O site só aceita endereços do próprio
Power Platform. Cada pergunta consome créditos do Copilot Studio.

## Pronúncia da ANDRA-18

As vozes em português leem palavras inglesas "à portuguesa" (ex.: Cyberwave → "Quiberuave").
O arquivo `src/lib/andra-lexicon.ts` tem a lista de termos e como cada um deve soar
(ex.: Cyberwave → "Sáiber-uêiv", ANDRA-18 → "Ândra dezoito", Night City → "Náit Síti", BBC, CNN, Fox News, R&B…).
A legenda continua mostrando o texto original. A lista vai para o `index.html` (bloco `andra-lexico`)
e vale para a voz do navegador e para a voz neural gravada pelo GitHub Actions (que regrava as falas
na próxima execução). Com Azure AI Speech e voz "Multilingual", as manchetes em inglês são lidas com
pronúncia americana.

## Energia 97 FM e Metropolitana FM

Ficam na aba "Fora da empresa" (não estão na StreamTheWorld). A Energia 97 não publica o endereço do stream:
o site busca no diretório Radio Browser (só endereços https que passaram no último teste). A Metropolitana toca
pelo servidor da Fábrica (ice.fabricahost.com.br), com o diretório como reserva (ignora os canais
Pop/Sertanejo/Funk/Light e as afiliadas de outras cidades).

## Audiolivros que tocam na AVD — v33

- O teste na AVD mostrou que só toca o áudio guardado em `d3ctxlq1ktw2nl.cloudfront.net` (podcasts hospedados no Spotify for Creators, antigo anchor.fm). Redcircle, Castbox, Megaphone e Podtrac são bloqueados.
- O GitHub Actions agora **descobre sozinho** audiolivros hospedados no anchor (buscas "audiolivro completo", "audiolibro completo", "full audiobook", "librivox audiobook"…), até 10 por aba, e refaz a busca a cada 7 dias. Eles aparecem nas abas "Em português" e "Outros idiomas". Ajuste o máximo com a variável `AUDIOLIVROS_AUTO_POR_ABA` (0 desliga).
- Na aba "Buscar audiolivro", os resultados hospedados no anchor vêm primeiro e, se esse servidor já tocou no aparelho, mostram "✓ servidor que toca nesta rede".

## Correções — v32

- **Audiolivros aparecem logo após publicar:** se o `podcasts.json` ainda não tem algum podcast ou audiolivro da lista, o site busca esse item direto no catálogo do Apple Podcasts. O GitHub Actions também atualiza na hora (sem esperar as 6 h) quando a lista do site ganha itens novos.
- **Mais áudios tocam em rede de empresa:** links que passam por serviços de estatística (anchor.fm, podtrac, chartable, pdst, op3…) agora são abertos direto no servidor do arquivo.
- **Teste sempre disponível:** o botão "Testar audiolivros neste aparelho" funciona mesmo com a lista vazia e explica o motivo.

## Audiolivros — v31

Seção **Audiolivros** (botão "Audiolivros" no topo), logo abaixo de Podcasts, com abas **Em português**,
**Outros idiomas**, **Buscar audiolivro** e **Audible, Storytel e outros (pagos)**.

- **Gratuitos (tocam no site):** obras em domínio público publicadas como podcast, cada capítulo um episódio.
  Em português: Audiolivros em português (Neolivros), Livros para Ouvir, Leitura de Ouvido, Domínio Público em Áudio,
  O Homem que Plantava Árvores. Outros idiomas: Audiolibro En Español, Audiolibros Completos, Audiolibros Pigeon:
  Clásicos, LibriVox Audiobooks, Sherlock Holmes Complete Audiobook Collection, Adventures of Sherlock Holmes
  Audiobook, Classic Books for Sleep.
- **Lista:** fica em `src/data/podcasts.ts` (função `AUDIOBOOKS`). Cada um é achado pelo código do Apple Podcasts
  (`cid`), sem depender do nome. `book: true` = livro em capítulos: lista todos (até 200), do 1º capítulo ao último.
  O mesmo passo do GitHub Actions que atualiza os podcasts atualiza os audiolivros (`podcasts.json`).
- **Player:** o mesmo dos podcasts, e no fim de um capítulo passa sozinho para o próximo. O botão **Ordem** troca
  entre "do 1º capítulo" e "mais novos primeiro". **Testar audiolivros neste aparelho** mostra quais tocam na rede.
- **Pagos (só atalhos):** Audible, Storytel, Ubook, Skeelo, Apple Books e Google Play Livros. Não têm API pública e o
  áudio é protegido (DRM), então só abrem no site/app de cada um, com a conta do usuário. Lista em `PAID_AUDIOBOOKS`.
- **AVD:** o áudio vem do servidor de cada audiolivro (Spreaker, Anchor/Spotify, RedCircle...). Os gravados da
  LibriVox ficam no Internet Archive, que a AVD bloqueia.

## Podcasts — v30

Seção **Podcasts** (botão "Podcasts" no topo), com abas **Notícias, Humor e entrevistas, Ciência e tecnologia,
Histórias e crimes, Esportes** e **Buscar podcast** (qualquer podcast do catálogo do Apple Podcasts).

- **Lista:** `src/data/podcasts.ts` (36 podcasts brasileiros e internacionais). Cada um é achado pelo nome no catálogo
  do Apple Podcasts (iTunes Search API, que abre até na AVD). Para trocar, edite a lista e gere o site de novo.
- **Episódios:** o passo **"Atualizar os podcasts (a cada 6 h)"** do `noticias.yml` publica `podcasts.json` com os 20
  episódios mais novos de cada um e o endereço final do áudio dos 3 mais novos (sem podtrac/chartable, que algumas
  redes bloqueiam). Sem esse arquivo, o site consulta o catálogo direto do navegador. Variáveis opcionais:
  `PODCASTS_A_CADA_HORAS` (6) e `PODCASTS_EPISODIOS` (20). Resumo em Actions → execução → **Podcasts**.
- **Player:** tocar/pausar, voltar 15 s, avançar 30 s, velocidade 1x–2x e "parou em…" (lembra onde parou). A rádio e as
  músicas param quando um podcast começa, e vice-versa; a ANDRA-18 abaixa o volume quando fala.
- **AVD:** o áudio vem do servidor de cada podcast (Megaphone, Simplecast, Omny, Acast, Libsyn...), não da
  StreamTheWorld. Se a rede bloquear um servidor, o site tenta o outro endereço, explica qual servidor não respondeu,
  marca "não tocou nesta rede" e põe os que tocam primeiro. **Testar podcasts neste aparelho** testa todos e tem
  **Copiar resultado**.

## Rádios GTA — v29

Na aba **Fora da empresa**: **GTA Radio** (`ss-edge.joeycast.com/gtaradio.mp3`, listada em radiostationsusa.com) e
**Los Santos Radio** (laut.fm, "música de todas as rádios do GTA 5"), com reserva pelo diretório Radio Browser.
São web rádios de fãs, sem ligação com a Rockstar; não usam a StreamTheWorld, então não tocam na AVD.
Endereços conferidos só nas páginas das rádios em 23/11/2026 (o áudio não pôde ser testado daqui).

## Publicação à prova de "Re-run" — v28

- **O erro:** ao repetir uma execução com **Re-run jobs**, o passo final parava com *Multiple artifacts named
  "github-pages" were unexpectedly found for this workflow run. Artifact count is 2.* O GitHub guarda o pacote do
  site enviado pela primeira tentativa, a repetição enviava outro com o mesmo nome e a publicação (deploy-pages)
  recusa quando encontra dois. O site continuava no ar com a última publicação que deu certo.
- **A correção:** cada tentativa envia o site com um nome próprio (`github-pages-1`, `github-pages-2`…) e publica
  exatamente esse pacote, então repetir uma execução funciona. Os caches (voz, teste das rádios, índice de músicas
  e rádios descobertas) também levam o número da tentativa, para a repetição conseguir salvar o que fez.
- **Espera de 20 s** entre o envio e a publicação: evita a falha ocasional *No artifacts named … were found*, que
  acontece quando os dois passos ficam na mesma etapa (actions/deploy-pages, issue #451).
- **Fim do aviso "Node.js 20 is deprecated":** ações nas versões que rodam em Node.js 24 — checkout v5, setup-node v5,
  configure-pages v6, setup-python v6, cache v5, upload-pages-artifact v5 e deploy-pages v5.
- Obs.: o upload-pages-artifact v5 deixa de fora arquivos ocultos (que começam com ponto, como `.nojekyll`); com
  Source = GitHub Actions eles não fazem falta. O site em si é o mesmo da v27.

## Rádios novas todos os dias, por estilo — v27

Uma vez por dia o próprio GitHub procura rádios novas para as abas **R&B, Rock internacional, Esportes,
Internacionais e Web e outras cidades** e publica a lista junto com o site (arquivo `radios-extras.json`).
Não é preciso enviar nada: o passo **"Descobrir rádios novas (a cada 24 h)"** do `noticias.yml` roda sozinho.

- **De onde vêm:** do diretório público Radio Browser, buscando por estilo (R&B, soul, hip hop; rock, metal,
  alternativo, punk; esportes, deportes, futebol…) e pelas rádios do Brasil.
- **Só StreamTheWorld:** entram apenas rádios da StreamTheWorld, as únicas que tocam na rede da empresa (AVD).
- **Conferidas antes de entrar:** a StreamTheWorld precisa confirmar que a rádio existe e não está bloqueada, e o
  endereço precisa responder com áudio. Rádios que já estão no site (mesmo em outro formato), rádios
  religiosas e rádios sem país conhecido ficam de fora. Rádio que falhou só é tentada de novo depois de 14 dias.
- **Quantas:** até **5 novas por aba por dia**, no máximo **100 por aba**. As rádios do Brasil vão para "Web e
  outras cidades" (a aba Rock é a internacional). Os dials de São Paulo, Rio e BH e a aba "Fora da empresa" não mudam.
- **Sempre no ar:** a cada busca o GitHub confere de novo as rádios já descobertas; a que ficar sem áudio em 3
  buscas seguidas sai do site. O teste das rádios (a cada 6 h) também passa a incluir as descobertas.
- **No site:** as rádios descobertas aparecem no fim de cada aba, as mais novas primeiro, com o selo **NOVA** nos
  primeiros 3 dias, e uma nota com a data da última busca. Funcionam na busca, nas favoritas, no teste "Testar
  rádios neste aparelho" (marcadas como "descoberta") e a ANDRA-18 anuncia cada uma com a mesma voz.
- **Resumo:** em Actions → execução do dia → **Rádios novas**, a lista das que entraram e das que saíram.
- **Ajustes opcionais** (Settings → Secrets and variables → Actions → Variables):
  `RADIOS_NOVAS_POR_DIA` (padrão 5; 0 = só confere as que já entraram), `RADIOS_NOVAS_MAXIMO` (padrão 100) e
  `RADIOS_NOVAS_A_CADA_HORAS` (padrão 24).
- A lista fica guardada no cache do GitHub; se o cache for apagado, o passo recupera a lista publicada no site.
- Obs.: os servidores do GitHub ficam nos EUA. Uma rádio liberada lá pode, em casos raros, ser bloqueada para o
  país da AVD (código 453); o teste "Testar rádios neste aparelho" mostra isso e permite ocultar a rádio.

## Todas as abas tocando na rede da empresa (AVD) — v26

O teste "Testar rádios neste aparelho" feito na AVD em 19/11/2026 mostrou a regra da rede da empresa:
**85 de 85 rádios da StreamTheWorld tocaram e 0 de 28 rádios de outros servidores tocaram** (brasilstream,
Zeno.fm, Shoutcast, iHeart, Amperwave, laut.fm, streams.radiobob.de, 181fm.com, exclusive.radio etc.). Ou seja,
não é defeito das rádios nem do site: na AVD só a StreamTheWorld passa.

- **Nova aba "Fora da empresa"** (29 rádios): as que usam outros servidores saíram das abas principais e
  ficaram juntas nela — Energia 97, Metropolitana e Jovem Pan; Alternativa Educadora (Baixio-CE); os 5 canais
  da RADIO BOB!; as 12 rádios de R&B de servidor próprio; Itatiaia, Tupi, Grenal, Guaíba, Continental,
  talkSPORT, ESPN Radio e Fox Sports Radio. Elas tocam no celular e em casa. Favoritas continuam salvas (mesmos ids).
- **Abas principais só com StreamTheWorld**, com rádios novas no lugar das que saíram (pontos de montagem
  conferidos nas páginas "Listen online" do netplayer.net, em radiostationsusa.com, tingfm.com e no diretório
  Radio Browser em 16–19/11/2026; quase todas de grupos cujas rádios já tocaram na AVD):
  - **R&B (+10):** HOT 97 Nova York, Hot 107.9 Atlanta, Majic 102.1 Houston, Majic 94.5 Dallas, 97.9 The Beat
    Dallas, 92Q Jams Baltimore, Magic 95.9 Baltimore, 93.1 WZAK Cleveland, Power 98 Charlotte e Hip-Hop House
    (iHeartRadio México).
  - **Rock (+5, no lugar da RADIO BOB!):** 98 KUPD Phoenix e 94.3 KILO (metal e hard rock atuais: Korn, Avatar,
    Five Finger Death Punch, Motionless in White, Falling in Reverse), 94.9 The Rock Oshawa, 95.9 The Rat e New Century
    (iHeartRadio México, rock dos anos 2000).
  - **Esportes (+2):** ADN Radio Chile e Caracol Radio Bogotá (grupo Prisa, como Futuro e Radioacktiva).
  - **São Paulo (+1):** Band FM 96.1. **Web (+1):** Mundo Livre FM (Curitiba).
- **Radio Continental:** saiu da StreamTheWorld; o endereço foi atualizado para o novo servidor
  (radiohdvivo.com) e ela foi para a aba "Fora da empresa".
- **Mix FM Porto Alegre:** está na StreamTheWorld e no ar segundo o diretório Radio Browser (16/11/2026), mas não
  tocou na AVD em 19/11. Continua na aba Web; o teste agora mostra o motivo.
- **Teste com o motivo da StreamTheWorld:** quando uma rádio da StreamTheWorld não toca, o teste pergunta à Triton
  por quê e escreve no resultado: **404** = o ponto não existe mais; **453** = a rádio bloqueou o país/rede deste
  aparelho. O resumo separa "Abas principais" e "Aba Fora da empresa". O teste automático do GitHub também
  mostra esse código no resumo da aba Actions.
- Pronúncia da ANDRA-18: HOT 97, Power 98, 92Q Jams, The Beat, Magic, The Rock, The Rat, New Century, iHeart,
  KUPD, WZAK, Hip-Hop House e Band FM.

## Abas R&B e Rock na rede da empresa (AVD) — v25

Na AVD só tocava a primeira rádio da aba R&B (.977 Jamz) e nenhuma RADIO BOB! da aba Rock. A .977 Jamz
está na **StreamTheWorld (Triton)**, a plataforma da maioria das rádios do site; as outras rádios de R&B e a
RADIO BOB! usam servidores próprios (181fm.com, shoutcast.com, wdr.de, laut.fm, exclusive.radio… e
streams.radiobob.de → regiocast.streamabc.net), que a rede da empresa não deixa tocar.

- **R&B:** a aba começa agora por 8 rádios na StreamTheWorld: a .977 Jamz, a Foxy 99 (que estava no fim da
  lista) e 6 novas — 100.3 WRNB Filadélfia, Majic 102.3 Washington, Majic 107.5 Atlanta, WKYS 93.9 Washington,
  97.9 The Box Houston e LOS40 Urban (pontos de montagem conferidos na lista pública da Triton em 18/11/2026).
  As rádios com servidor próprio continuam na aba, depois delas: tocam fora da rede da empresa.
- **RADIO BOB!:** os endereços são os oficiais (lista de streams.radiobob.de, conferida em 18/11/2026);
  o site já tenta o MP3 de 192 kbps, depois o de 128 kbps e por fim o diretório Radio Browser. Fora da rede da
  empresa elas tocam; na AVD, use o teste abaixo e oculte as que não tocarem.
- **Testar rádios neste aparelho** ganhou **Copiar resultado**: o texto traz cada rádio com o servidor que
  respondeu e o resumo "Servidores que tocaram / que falharam" — cole na conversa de suporte. O teste agora
  também pergunta à StreamTheWorld pelas rádios sem endereço fixo (Nativa, Energia 97, Metropolitana),
  como o player faz.
- Os relatórios copiados (rádios e músicas) mostram a versão do site (ex.: "Cyberwave Radio v25").
- Pronúncia da ANDRA-18: Majic, The Box, Foxy, Jamz, LOS40 Urban e RADIO BOB!.

## Chave da YouTube Data API (opcional) — v24

Serve para **procurar** no YouTube as músicas que não estão no índice (busca oficial; cerca de 100 buscas por
dia no plano gratuito, somando todos os visitantes). Não muda o que o player do YouTube aceita tocar: se o
YouTube recusa o player numa rede (erro 150/153), a chave não resolve.

A chave vai para `musica.json` e fica **visível para quem abre o site** (é assim com toda chave usada no
navegador). Por isso ela precisa de duas restrições no Google Cloud Console:

1. **Restrições do aplicativo → Sites:** `nattesummerss.github.io/*`.
2. **Restrições de API → Restringir chave:** só **YouTube Data API v3**.

Depois: GitHub → **Settings → Secrets and variables → Actions → New repository secret**, nome
`YOUTUBE_API_KEY`. O workflow grava a chave em `musica.json` e o resumo do Actions mostra
"YouTube Data API | configurada" (a chave nunca aparece nos logs).

Na v24 o site passou a informar o endereço do site nas chamadas da API (`referrerPolicy:
no-referrer-when-downgrade` só nelas; o resto da página continua com `same-origin`). Até a v23 uma chave
restrita a sites era recusada sempre. O diagnóstico explica em português os erros da chave (cota do dia,
site não liberado, chave inválida, API desativada, restrição de APIs).

## Rede que recusa qualquer vídeo dentro de sites — v23

O diagnóstico da AVD (17/11) mostrou erro 150 até no clipe oficial de "Numb". Erro 150 pode ser a gravadora
**ou** a rede: em redes de empresa o YouTube costuma pedir "Faça login para confirmar que você não é um robô"
e recusa o player dentro de sites com o mesmo código. Para separar os dois casos:

- **Vídeo de teste sem música** (`M7lc1UVf-VE`, o exemplo da documentação do player do YouTube; reserva
  `jNQXAC9IVRw`). O diagnóstico testa esse vídeo antes das músicas. Se nem ele toca, a recusa é da rede ou do
  navegador, e o diagnóstico não testa as músicas (o quadro do YouTube fica na tela para ler a mensagem).
- **No player**: quando uma música é recusada, o site testa esse vídeo escondido, uma vez.
  - Se ele também é recusado, o site para de tentar o player dentro do site nesse navegador por 6 h
    (`localStorage musica.yt-embed`): cada música vai direto para a prévia com **"Ouvir no YouTube"** em destaque,
    e aparece **"Tentar tocar aqui de novo"** (por exemplo depois de entrar na conta em youtube.com).
  - Se ele toca, a mensagem diz que é a gravadora daquela música; as outras continuam tocando no site.
- **Procurar no YouTube**: música sem vídeo conhecido abre a busca dela no YouTube.
- O erro 150 deixou de ser descrito como "a gravadora" de saída; o texto vem do resultado do vídeo de teste.

## Quando o YouTube recusa o player — v22

Na v21 algumas redes/navegadores caíam sempre na prévia de 30 s. Motivos possíveis, todos tratados agora:

| O que acontece | Código | O que o site faz (v22) |
|---|---|---|
| A gravadora não deixa o **áudio do YouTube Music** tocar em outros sites | 101 / 150 | Cada música do índice passou a ter **2 vídeos**: 1º o áudio oficial do YouTube Music, 2º o **clipe/vídeo oficial** do artista. Se o 1º for recusado, toca o 2º. Depois de 2 recusas (ou se o diagnóstico confirmar), o navegador **começa direto pelo clipe**. |
| O endereço do site não chega ao YouTube (extensão, configuração do navegador ou proxy da empresa) | 152 / 153 | Explica o motivo e destaca o botão **"Ouvir no YouTube"**. O player já manda `origin` e `widget_referrer`. |
| O player abre, mas o vídeo não começa (servidor de vídeo bloqueado, login pedido) | — | O diagnóstico mostra o caso; "Ouvir no YouTube" continua disponível. |

- **Ouvir no YouTube** (no player): abre a música no próprio site do YouTube, numa aba nova, com as próximas
  da lista em sequência (`watch_videos?video_ids=…`, até 50). Não precisa de conta. Cada clique abre outra aba
  (o YouTube não deixa outro site reaproveitar a aba dele).
- **Diagnóstico → Teste de reprodução**: toca alguns segundos sem som do clipe oficial e do áudio do índice
  ("Numb") e diz se tocou de verdade ou qual erro o YouTube deu. Quando falha, o quadro do YouTube fica na tela.
- **Montador do índice** (`src/tools/indice-musicas.ts`): procura sempre no YouTube Music **e** no YouTube comum;
  as músicas que já estavam no índice são conferidas aos poucos (metade do tempo de cada execução) para ganhar
  o clipe como 2ª opção. O resumo do Actions mostra a linha **"Clipe oficial como 2ª opção (músicas antigas)"**.
  Nova variável opcional: `MUSICAS_YT_INTERVALO_MS` (intervalo entre buscas no YouTube, padrão 100 ms).
- **iTunes não toca música inteira**: a Apple só libera prévias de 30 s; a música completa da Apple exige o
  Apple Music (MusicKit), conta de desenvolvedor paga e a assinatura de cada ouvinte.

## Músicas completas sem Vercel — índice do site (v21)

O **Diagnóstico das fontes** rodado no computador da empresa (AVD) mostrou que, nessa rede, só abrem o próprio
site (github.io), o **iTunes** e o **YouTube**. Deezer, Last.fm (pelo proxy), Wikidata, Invidious, Internet
Archive, LRCLib e a **Vercel** são cortados pela rede (falham em 50–170 ms, conexão encerrada). Por isso a v21
não depende dessas fontes para tocar a música completa:

- O passo **"Montar o índice de músicas completas"** do GitHub Actions procura, nos servidores do GitHub, o vídeo
  certo de cada música popular (YouTube Music → YouTube → Last.fm, com a mesma nota de título/artista/duração do
  site), confere no oEmbed se o vídeo pode tocar em sites e publica `musicas/indice.json` junto com o site.
- Ao tocar uma música do **Catálogo**, o site consulta primeiro esse arquivo (que vem do próprio github.io) e
  toca no player do YouTube na hora. Músicas que já estão no índice aparecem com **"completa"** na lista.
- O índice começa pelas paradas do Apple Music (Brasil e EUA) e do Deezer (Top Brasil e Top Mundo), as 10 mais
  ouvidas de ~330 artistas das abas da rádio (rock, alt metal, metalcore, R&B, Brasil, synthwave, pop) e os
  artistas mais ouvidos de 17 gêneros do Deezer (lista em `src/tools/sementes.ts`). Cada execução trabalha
  4 minutos e continua de onde parou; em algumas horas o índice passa de milhares de músicas.
- **Pedidos:** edite `musicas/pedidos.txt` no GitHub, uma música por linha:
  `Artista - Música`, `Artista - Música | link do YouTube` (fixa o vídeo) ou um link do Deezer
  (faixa, álbum, playlist ou artista). Ao atualizar o site no futuro, **não substitua** esse arquivo.
- Variáveis opcionais (Settings → Secrets and variables → Actions → Variables): `MUSICAS_MINUTOS`
  (minutos por execução, padrão 4; `0` desliga a busca) e `MUSICAS_POR_ARTISTA` (padrão 10).
- O player tenta `youtube.com` e, se não abrir em 8 s, `youtube-nocookie.com` (e lembra o que funcionou).
- O resumo de cada execução (aba **Actions**) mostra quantas músicas estão prontas, quantas faltam e se o
  YouTube/Last.fm responderam aos servidores do GitHub. O diagnóstico do site ganhou as linhas
  **Player do YouTube**, **Índice do site** e um **Resumo** em linguagem simples.

Limites: se o YouTube bloquear os servidores do GitHub numa execução, o resumo avisa e o site continua com o
índice que já tinha. Música fora do índice usa as camadas abaixo (na rede da AVD elas são bloqueadas e toca a
prévia) — inclua-a em `musicas/pedidos.txt`. Letras (LRCLib), Deezer e Internet Archive não funcionam na rede
da AVD; fora dela, funcionam normalmente.

## Músicas sob demanda (lógica do Spotube) — v20

A seção "Músicas sob demanda" tem quatro fontes: **Catálogo (Spotube)** (padrão), **YouTube**,
**Internet Archive** e **Do aparelho (offline)**.

Como no [Spotube](https://github.com/team-spotube/spotube), metadados e áudio são separados:

1. **Busca** no catálogo do **iTunes/Apple** (principal) e do **Deezer** (complemento), sem chave.
   Aceita colar link do **Spotify**, do **Deezer** (faixa, álbum, playlist) ou do **Apple Music**.
2. **Música completa**: ao tocar, o site acha a mesma gravação no YouTube (título, artista, canal oficial,
   **duração**; descarta ao vivo, cover, karaokê, remix, slowed…) e toca no **player oficial do YouTube**.
   Se o vídeo não puder tocar fora do YouTube (erro 101/150), o site passa sozinho para a próxima opção.
3. A escolha fica salva no navegador. **Trocar fonte de áudio** e **Procurar de novo** ficam no player.
4. **Letra sincronizada** pelo LRCLib.
5. A prévia de 30 s só toca quando nenhuma fonte acha a música naquele momento (o aviso diz isso).

### O que estava errado até a v19 (corrigido)

- O `index.html` usa `<meta name="referrer" content="same-origin">`. Com isso o navegador não manda a
  identificação do site para o YouTube e **todo** vídeo embutido falha com o **erro 153**. Agora o player do
  YouTube tem `referrerpolicy="strict-origin-when-cross-origin"` (recomendação do próprio YouTube).
- O site não completava o "aperto de mão" do player (`listening` + `addEventListener`), então não recebia os
  avisos de erro e de fim de música. Agora segue o protocolo do IFrame API.
- A busca sem configuração dependia de proxies públicos lendo a página do YouTube (mais de 1 MB e com tela de
  consentimento na Europa) e do Piped/Invidious, que o YouTube derrubou em 2025–2026. Foi substituída.
- Internet Archive: a ordenação usava `sort=` em vez de `sort[]=` e caracteres como `/ : ( )` quebravam a busca.

### De onde vem o vídeo de cada música (em camadas, tudo em paralelo)

| Camada | Precisa configurar? | Cobertura |
|---|---|---|
| **Índice do site** (`musicas/indice.json`, montado pelo GitHub Actions — v21) | não | músicas mais ouvidas + `musicas/pedidos.txt`; funciona até na AVD |
| **Buscador próprio** (Vercel ou Cloudflare): YouTube Music + YouTube via InnerTube — o método dos extratores do Spotube | sim, uma vez (opcional) | praticamente tudo, fora da AVD |
| YouTube Data API (`YOUTUBE_API_KEY`) | sim | tudo, mas ~100 buscas/dia |
| Vídeo que o **Last.fm** indica na página da faixa (lido por um proxy público gratuito) | não | músicas conhecidas |
| Clipe registrado no **Wikidata** (propriedade P1651) | não | sucessos/clipes oficiais |
| Instâncias públicas do **Invidious** (4 listadas em docs.invidious.io) | não | instável |

Cada vídeo indicado é conferido no **oEmbed** do YouTube (existe e pode ser incorporado) antes de tocar.

### (Opcional) Buscador próprio na Vercel — para músicas fora do índice

A rede da AVD bloqueia vercel.com (erro `ERR_CONNECTION_CLOSED`): faça os passos 1–3 **pelo celular** ou por um
computador fora da AVD; os passos 4–5 (GitHub) podem ser feitos na AVD. Dentro da AVD o site provavelmente
também não alcança o buscador na Vercel — lá vale o índice do site.


1. Entre em <https://vercel.com/signup> e escolha **Continue with GitHub**.
2. **Add New… → Project → Import** o repositório **Cyberwave-Radio** → **Deploy** (não precisa mudar nada).
3. Quando terminar, copie o domínio que a Vercel mostrar (ex.: `https://cyberwave-radio.vercel.app`).
   Teste no navegador: `https://SEU-DOMINIO.vercel.app/api/musica?op=saude` deve mostrar `{"ok":true,...}`.
4. No GitHub: **Settings → Secrets and variables → Actions → aba Variables → New repository variable**
   - Nome: `MUSICA_PROXY_URL`
   - Valor: `https://SEU-DOMINIO.vercel.app/api/musica`
5. **Actions → "Cyberwave Radio - site e notícias" → Run workflow.** O resumo da execução mostra
   "Buscador próprio: responde" e quantos vídeos ele achou num teste.

A Vercel publica de novo sozinha a cada `git push`, então as atualizações do buscador chegam sem passos extras.
O buscador só aceita pedidos do seu site (`*.github.io`, `*.vercel.app`; para limitar mais, crie a variável de
ambiente `ORIGENS` na Vercel, ex.: `https://nattesummerss.github.io`).

### Alternativa: Cloudflare Workers

- **Pelo GitHub Actions:** crie os segredos `CLOUDFLARE_API_TOKEN` (modelo "Edit Cloudflare Workers") e
  `CLOUDFLARE_ACCOUNT_ID`. Na primeira vez, entre em **Workers & Pages** no painel da Cloudflare para criar o
  subdomínio `workers.dev`, senão a publicação falha.
- **À mão:** Workers & Pages → Create → Worker → cole o conteúdo de `worker/musica-worker.js` → Deploy, e
  coloque o endereço `https://...workers.dev` na variável `MUSICA_PROXY_URL`.
- Observação: o plano grátis da Cloudflare limita o processamento por pedido; por isso a Vercel é a recomendada.

### Diagnóstico no próprio site

Em **Músicas sob demanda → Diagnóstico das fontes**, o site testa cada fonte **no aparelho de quem está
usando** (iTunes, Deezer, verificação do YouTube, buscador próprio, chave, Last.fm, Wikidata, Invidious,
Internet Archive, letras) e mostra ✓/✗ com o motivo. **Copiar relatório** gera um texto para enviar ao suporte.

### Do aparelho (offline)

Como a biblioteca local do Spotube: **Adicionar músicas do aparelho** guarda arquivos de áudio
(MP3, M4A, OGG, OPUS, WAV, FLAC) no próprio navegador (IndexedDB). Título, artista, álbum e capa vêm das
etiquetas ID3 do MP3 ou do nome do arquivo ("Artista - Música.mp3"). As músicas tocam sem internet, com
controles na tela de bloqueio, e ficam só naquele aparelho/navegador — nada é enviado para servidor.

### Fontes pesquisadas e não integradas (e por quê)

- **JioSaavn** (plugin oficial do Spotube): fora da Índia a busca não traz músicas internacionais, e a instância
  pública mais usada (saavn.dev) saiu do ar por notificação de direitos autorais (DMCA) em out/2025.
- **DAB Music, Monochrome, hifi-api, flacdownloader** (plugins da comunidade): distribuem cópias de serviços
  pagos (Qobuz/Tidal) sem licença — expõem o site a remoção por direitos autorais.
- **Odesli/song.link**: a API pública foi desligada em 31/07/2026.
- **Piped**: praticamente fora do ar desde 2025.
- **Audius, Jamendo, Apple Music**: removidos a pedido na v19.

### Limites

- O som do Catálogo/YouTube toca no player do YouTube: no celular pode parar com a tela bloqueada, e alguns
  celulares (principalmente iPhone) pedem um toque no vídeo para começar. Para ouvir com a tela bloqueada,
  use **Do aparelho**.
- Extensões de privacidade que removem o "referer" causam o erro 153; o site avisa e toca a prévia.
- O YouTube muda o sistema de tempos em tempos; o código do buscador fica em `src/worker/` e `src/lib/yt-parse.ts`.
