import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Raiz do monorepo: o painel importa packages/brand/tokens.css, que fica fora de apps/painel.
const raizRepo = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: [raizRepo] },
  },
});
