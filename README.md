# Radio Ao vivo AVD

Site de rádios ao vivo (brasileiras e internacionais) que toca as transmissões públicas
das emissoras direto no navegador. Não precisa de login nem de licença: basta o link.

## Publicar no GitHub Pages

Os arquivos prontos para publicar estão no pacote **radio-ao-vivo-avd-site.zip**
(ou na pasta `dist`, depois de gerar o site).

1. Crie um repositório **público** no GitHub.
2. Na página do repositório: **Add file → Upload files**, arraste todos os arquivos
   do pacote do site (incluindo a pasta `assets`) e clique em **Commit changes**.
3. Vá em **Settings → Pages**, em *Source* escolha **Deploy from a branch**,
   branch **main**, pasta **/ (root)**, e clique em **Save**.
4. Em alguns minutos o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Alterar o site (para quem programa)

Requer Node.js 20 ou mais novo.

```
npm install
npm run dev      # abre uma versão local para testar
npm run build    # gera a pasta dist com o site pronto
```

Depois de gerar, envie o conteúdo de `dist` para o repositório, substituindo os arquivos antigos.

- Lista de rádios: `src/data/stations.ts`
- Tela principal: `src/pages/home.tsx`
- "Tocando agora" (música e banda): `src/lib/now-playing.ts`

As rádios adicionadas em "Minhas rádios" e as favoritas ficam salvas no navegador de cada pessoa.
As transmissões e marcas pertencem às respectivas emissoras.
