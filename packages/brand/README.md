# packages/brand

Tokens visuais do PetCare Hub (cores, tipografia, raio, sombra), em CSS puro.

- `tokens.css`: variáveis `--pc-*`, com tema claro e escuro (segue `prefers-color-scheme`
  e aceita `data-theme="light|dark"` no `<html>` para o painel ter um seletor manual).
- O site (`apps/site`) já usa. O painel (`apps/painel`) pode importar o mesmo arquivo no
  `main.tsx` e trocar as cores próprias pelas variáveis `--pc-*`.

## Cloudflare Pages

Como o arquivo fica fora da pasta de cada app, inclua `packages/brand/*` nos
**Build watch paths** de cada projeto Pages que o usa (`petcare-hub-site` e, quando
importar, `petcare-hub-painel`). Sem isso, mudar uma cor não dispara o deploy.
