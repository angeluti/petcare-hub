# apps/site — www.petcarehub.com.br

Site de venda do PetCare Hub (M18, SI-01 a SI-05). Astro, saída 100% estática, publicado no
Cloudflare Pages (projeto `petcare-hub-site`).

## Rodar local (Windows, cmd)

```
cd apps\site
npm install
npm run dev        :: http://localhost:4321
npm run check      :: checagem de tipos (opcional, antes do commit)
npm run build      :: gera dist\
npm run preview    :: serve o dist\ para conferir
```

Depois do primeiro `npm install`, **commitar o `package-lock.json`**: o Cloudflare usa ele
para instalar as mesmas versões.

## Onde mexer

| O quê | Arquivo |
|---|---|
| Número do WhatsApp comercial | `src/config.ts` → `WHATSAPP_COMERCIAL` (o build de produção falha enquanto for placeholder) |
| Preços, planos, módulos, jornada, FAQ | `src/data/conteudo.ts` |
| Vídeo do bot | `public/video/` + `VIDEO_DEMO` em `src/data/conteudo.ts` |
| Depoimentos | `DEPOIMENTOS` em `src/data/conteudo.ts` (lista vazia = seção escondida) |
| Termos e privacidade | `src/pages/termos.md`, `src/pages/privacidade.md` (`rascunho: true` mostra o aviso) |
| Cores e fontes | `packages/brand/tokens.css` (compartilhado com o painel) |
| Cabeçalhos HTTP, cache, noindex do pages.dev | `public/_headers` |
| Imagem de compartilhamento | `public/og.png` (1200×630) |

## Cloudflare Pages

- Root directory: `apps/site` · Build: `npm run build` · Output: `dist`
- Variável: `NODE_VERSION=22`
- Build watch paths (include): `apps/site/*`, `packages/brand/*`
- Custom domain: `www.petcarehub.com.br` (CNAME no Registro.br para `petcare-hub-site.pages.dev`)

Passo a passo completo, com DNS e redirecionamento do domínio raiz: guia "Site PetCare Hub — deploy".
