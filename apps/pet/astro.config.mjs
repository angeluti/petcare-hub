// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

// Raiz do monorepo: permite importar packages/brand/tokens.css no modo dev.
const raizRepo = fileURLToPath(new URL('../../', import.meta.url));

// Uma página só (index.html). Sem 404.html no build, o Cloudflare Pages serve
// o index.html para qualquer caminho (/K7M3QX), e o script lê o código da URL.
export default defineConfig({
  site: 'https://pet.petcarehub.com.br',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  vite: {
    server: { fs: { allow: [raizRepo] } },
  },
});
