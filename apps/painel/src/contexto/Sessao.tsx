import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface SessaoCtx {
  sessao: Session | null;
  carregando: boolean;
  /** true quando o usuário chegou pelo link de "esqueci a senha" */
  recuperandoSenha: boolean;
  sair: () => Promise<void>;
}

const Ctx = createContext<SessaoCtx | null>(null);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [recuperandoSenha, setRecuperandoSenha] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSessao(s);
      if (evento === 'PASSWORD_RECOVERY') setRecuperandoSenha(true);
      if (evento === 'USER_UPDATED' || evento === 'SIGNED_OUT') setRecuperandoSenha(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const sair = async () => {
    await supabase.auth.signOut();
  };

  return <Ctx.Provider value={{ sessao, carregando, recuperandoSenha, sair }}>{children}</Ctx.Provider>;
}

export function useSessao() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSessao fora do SessaoProvider');
  return c;
}
