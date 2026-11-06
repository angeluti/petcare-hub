import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type ModoSenha = 'recuperacao' | 'convite';

interface SessaoCtx {
  sessao: Session | null;
  carregando: boolean;
  /**
   * Usuário precisa definir a senha antes de entrar no painel:
   * 'recuperacao' = link de "esqueci a senha"; 'convite' = primeiro acesso.
   * Vem do evento PASSWORD_RECOVERY, da rota /auth/confirmar ou do metadado
   * precisa_definir_senha que a Edge Function convidar-membro grava.
   */
  definindoSenha: ModoSenha | null;
  iniciarDefinicaoSenha: (modo: ModoSenha) => void;
  /** chamado depois de salvar a nova senha */
  concluirRecuperacao: () => void;
  sair: () => Promise<void>;
}

const Ctx = createContext<SessaoCtx | null>(null);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState<ModoSenha | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSessao(s);
      if (evento === 'PASSWORD_RECOVERY') setModo('recuperacao');
      if (evento === 'SIGNED_OUT') setModo(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const concluirRecuperacao = () => setModo(null);
  const iniciarDefinicaoSenha = (m: ModoSenha) => setModo(m);
  const pendenteConvite = sessao?.user.user_metadata?.precisa_definir_senha === true;
  const definindoSenha: ModoSenha | null = modo ?? (pendenteConvite ? 'convite' : null);

  // Sair recarrega a página na raiz: zera a URL (inclusive /redefinir-senha)
  // e o cache do React Query, para o próximo usuário não ver dados do anterior.
  const sair = async () => {
    await supabase.auth.signOut();
    window.location.replace('/');
  };

  return (
    <Ctx.Provider value={{ sessao, carregando, definindoSenha, iniciarDefinicaoSenha, concluirRecuperacao, sair }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSessao() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSessao fora do SessaoProvider');
  return c;
}
