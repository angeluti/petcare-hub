import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { SessaoProvider } from './contexto/Sessao';
import { AvisosProvider } from './componentes/ui';
// Fontes locais da marca (sem Google Fonts: LGPD e sem depender de outro domínio)
import '@fontsource/young-serif/400.css';
import '@fontsource-variable/figtree/index.css';
// Tokens de marca compartilhados com o site (petcare-hub/packages/brand)
import '../../../packages/brand/tokens.css';
import './estilo.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessaoProvider>
          <AvisosProvider>
            <App />
          </AvisosProvider>
        </SessaoProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
