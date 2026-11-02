// Descobre a quais pet shops o usuário pertence, qual está selecionado,
// o papel dele ali e as funcionalidades ligadas (minhas_funcionalidades).
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, dado } from '../lib/supabase';
import { mensagemDeErro } from '../lib/erros';
import type { Papel, Petshop } from '../lib/tipos';
import { useSessao } from './Sessao';

const CAMPOS_PETSHOP =
  'id, nome, fuso, plano_codigo, modo_capacidade, intervalo_slot_min, antecedencia_min_minutos, antecedencia_max_dias, cancelamento_min_horas, endereco';

interface Vinculo { petshop: Petshop; papel: Papel }

interface PetshopCtx {
  petshop: Petshop;
  papel: Papel;
  vinculos: Vinculo[];
  funcionalidades: Set<string>;
  tem: (codigo: string) => boolean;
  podeConfigurar: boolean;
  trocar: (id: string) => void;
}

const Ctx = createContext<PetshopCtx | null>(null);
const CHAVE = 'petcarehub.petshop';

function lerPreferido(): string | null {
  try { return localStorage.getItem(CHAVE); } catch { return null; }
}
function gravarPreferido(id: string) {
  try { localStorage.setItem(CHAVE, id); } catch { /* navegação privada: tudo bem */ }
}

async function carregarVinculos(userId: string): Promise<Vinculo[]> {
  // Super admin Harpia enxerga todos os pet shops (a RLS libera).
  const harpia = dado<{ papel: string }[]>(
    await supabase.from('harpia_equipe').select('papel').eq('user_id', userId).eq('ativo', true),
  );
  if (harpia.some((h) => h.papel === 'super_admin')) {
    const todos = dado<Petshop[]>(await supabase.from('petshops').select(CAMPOS_PETSHOP).order('nome'));
    return todos.map((p) => ({ petshop: p, papel: 'super_admin' as Papel }));
  }
  const membros = dado<{ papel: Papel; petshops: Petshop | null }[]>(
    await supabase
      .from('petshop_membros')
      .select(`papel, petshops ( ${CAMPOS_PETSHOP} )`)
      .eq('user_id', userId)
      .eq('ativo', true),
  );
  return membros
    .filter((m) => m.petshops)
    .map((m) => ({ petshop: m.petshops as Petshop, papel: m.papel }))
    .sort((a, b) => a.petshop.nome.localeCompare(b.petshop.nome));
}

export function PetshopProvider({ children }: { children: ReactNode }) {
  const { sessao } = useSessao();
  const userId = sessao?.user.id ?? '';
  const qc = useQueryClient();
  const [selecionado, setSelecionado] = useState<string | null>(lerPreferido());

  const vinculosQ = useQuery({
    queryKey: ['vinculos', userId],
    enabled: !!userId,
    queryFn: () => carregarVinculos(userId),
  });

  const vinculos = vinculosQ.data ?? [];
  const atual = vinculos.find((v) => v.petshop.id === selecionado) ?? vinculos[0];

  useEffect(() => {
    if (atual && atual.petshop.id !== selecionado) setSelecionado(atual.petshop.id);
  }, [atual, selecionado]);

  const funcsQ = useQuery({
    queryKey: [atual?.petshop.id, 'funcionalidades'],
    enabled: !!atual,
    queryFn: async () =>
      dado<string[]>(await supabase.rpc('minhas_funcionalidades', { p_petshop: atual!.petshop.id })),
  });

  const valor = useMemo<PetshopCtx | null>(() => {
    if (!atual || !funcsQ.data) return null;
    const funcionalidades = new Set(funcsQ.data);
    return {
      petshop: atual.petshop,
      papel: atual.papel,
      vinculos,
      funcionalidades,
      tem: (c) => funcionalidades.has(c),
      podeConfigurar: ['dono', 'gerente', 'super_admin'].includes(atual.papel),
      trocar: (id) => {
        gravarPreferido(id);
        setSelecionado(id);
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'vinculos' });
      },
    };
  }, [atual, funcsQ.data, vinculos, qc]);

  if (vinculosQ.isLoading || (atual && funcsQ.isLoading)) {
    return <div className="tela-centro"><div className="carregando">Carregando pet shop…</div></div>;
  }
  if (vinculosQ.error || funcsQ.error) {
    return (
      <div className="tela-centro">
        <div className="cartao estreito">
          <h2>Não foi possível carregar seu pet shop</h2>
          <p className="mudo">{mensagemDeErro(vinculosQ.error ?? funcsQ.error)}</p>
          <SairBotao />
        </div>
      </div>
    );
  }
  if (!valor) {
    return (
      <div className="tela-centro">
        <div className="cartao estreito">
          <h2>Seu usuário ainda não está ligado a um pet shop</h2>
          <p className="mudo">Fale com a equipe PetCare Hub para liberar o acesso.</p>
          <SairBotao />
        </div>
      </div>
    );
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

function SairBotao() {
  const { sair } = useSessao();
  return <button className="btn" onClick={sair}>Sair</button>;
}

export function usePetshop() {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePetshop fora do PetshopProvider');
  return c;
}
