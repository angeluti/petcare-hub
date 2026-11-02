// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';

// Raiz do monorepo: permite importar packages/brand/tokens.css no modo dev.
const raizRepo = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  site: 'https://www.petcarehub.com.br',
  // Arquivos estáticos em dist/, sem adaptador: o Cloudflare Pages só serve os arquivos.
  output: 'static',
  trailingSlash: 'never',
  build: {
    // /termos -> dist/termos.html (URL sem barra final, igual ao canonical)
    format: 'file',
  },
  integrations: [
    sitemap({
      filter: (pagina) => !pagina.includes('/404'),
    }),
  ],
  vite: {
    server: {
      fs: { allow: [raizRepo] },
    },
  },
});
