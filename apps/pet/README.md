# apps/pet · ficha pública do pet

`pet.petcarehub.com.br/{codigo}`: a página que abre quando alguém lê o QR da plaquinha.

- Uma página só (`src/pages/index.astro`). O build não gera `404.html`, então o Cloudflare Pages serve o `index.html` para qualquer caminho e o script lê o código da URL.
- Chama `ficha_publica(p_ref)` no Supabase com a **Publishable key**. O `anon` só executa essa função (arquivo 21); tudo o mais é barrado no banco.
- Três estados vindos do banco: `desligada` (só o botão Achei), `basica` (nome, espécie, raça, porte) e `completa` (+ alergias, condições, primeiro nome do tutor). Código inexistente, desativado ou inválido: "Plaquinha não encontrada", sem dizer qual dos três.
- **Achei este pet:** monta um link `wa.me` para o **número central** (vem do banco, não do QR) com `ACHEI {codigo}` e o recado. Quem toca envia pelo próprio WhatsApp; o bot repassa ao tutor.
- **É o tutor?:** link `wa.me` com `FICHA {codigo}`; o bot confere o telefone e oferece os níveis.
- Sem indexação (`noindex`, `robots.txt`, `X-Robots-Tag`), sem referer e fontes locais (LGPD).

## Rodar local

```cmd
cd apps\pet
copy .env.example .env      :: preencha a URL e a Publishable key
npm install
npm run dev
```

No modo dev, abra `http://localhost:4321/?c=CODIGO` (o servidor do Astro não faz o fallback de caminho do Pages).

Teste da lógica pura: `node --experimental-strip-types apps/pet/test/ficha.test.ts`.

## Marca

- **Logo:** importada no build direto de `packages/brand/logo/` (`logo-horizontal-cor.svg` no tema claro e a versão horizontal escura no tema escuro). Não copie as logos para `public/`. Se o build disser que não achou a logo, a mensagem lista os arquivos da pasta.
- **Favicons:** copie `favicon.svg` e `favicon.ico` de `apps/site/public/` para `apps/pet/public/` (os mesmos arquivos do site, com o símbolo simplificado).
- Paleta e fontes: `packages/brand/tokens.css` e as fontes locais do site (Young Serif, Figtree, JetBrains Mono).
- Sem o selo "by Harpia Tech Studio": a ficha é vista por tutores e por quem acha o pet, não é material B2B (seção 2 do documento-mestre).

## Cloudflare Pages (projeto novo)

| Campo | Valor |
|---|---|
| Nome do projeto | `petcare-hub-pet` |
| Repositório | `angeluti/petcare-hub` |
| Root directory | `apps/pet` |
| Build command | `npm run build` |
| Output | `dist` |
| Build watch paths | `apps/pet/*` e `packages/brand/*` |
| Variáveis | `NODE_VERSION=22`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

Depois do primeiro deploy: **Custom domains → `pet.petcarehub.com.br`**.

## DNS (Registro.br, modo avançado)

O `pet.` ainda aponta para o Railway legado. Troque o registro:

```
pet   CNAME   petcare-hub-pet.pages.dev.
```

Espere o Pages mostrar o domínio como ativo e com SSL antes de gravar QR com esse endereço.
