// Administração · Contas a pagar (FN-03), a receber (FN-02) e categorias (FN-06).
// Só dono e gerente (RLS "financeiro"). Toda mudança de situação é RPC.
// A receber em aberto = fiados do check-out (calculados) + lançamentos manuais.
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase, dado } from './supabase';
import type { Json } from './database.types';
import type { Parcela } from './compras';

export type TipoConta = 'pagar' | 'receber';

export const FORMAS: Record<string, string> = {
  pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', boleto: 'Boleto', transferencia: 'Transferência', outro: 'Outro',
};
/** Pagamento de atendimento: as mesmas formas do check-out. */
export const FORMAS_ATENDIMENTO = ['pix', 'dinheiro', 'debito', 'credito', 'outro'];

export interface Categoria { id: string; tipo: 'despesa' | 'receita'; nome: string; codigo: string | null; ativo: boolean }

interface ContaBase {
  id: string;
  grupo_id: string;
  parcela: number;
  parcelas: number;
  descricao: string;
  categoria_id: string;
  documento: string | null;
  vencimento: string;
  valor: number;
  forma_pagamento: string | null;
  observacao: string | null;
  motivo: string | null;
  financeiro_categorias: { nome: string } | null;
}

export interface ContaPagar extends ContaBase {
  status: 'aberta' | 'paga' | 'cancelada';
  fornecedor_id: string | null;
  recebimento_id: string | null;
  pago_em: string | null;
  valor_pago: number | null;
  fornecedores: { nome: string } | null;
}

export interface ContaReceber extends ContaBase {
  status: 'aberta' | 'recebida' | 'cancelada';
  tutor_id: string | null;
  recebido_em: string | null;
  valor_recebido: number | null;
  tutor_petshop: { nome: string } | null;
}

/** Linha de contas_receber_abertas: fiado de atendimento ou lançamento manual. */
export interface ReceberAberta {
  origem: 'agendamento' | 'manual';
  id: string;
  descricao: string;
  tutor_id: string | null;
  tutor: string | null;
  vencimento: string;
  valor: number;
  recebido: number;
  saldo: number;
  dias_atraso: number;
  situacao: string;
}

// ------------------------------------------------------------------ Leituras
export function useCategorias(petshopId: string) {
  return useQuery({
    queryKey: [petshopId, 'financeiro_categorias'],
    queryFn: async () =>
      dado<Categoria[]>(await supabase.from('financeiro_categorias').select('id, tipo, nome, codigo, ativo')
        .eq('petshop_id', petshopId).order('tipo').order('nome')),
  });
}

const CAMPOS = 'id, grupo_id, parcela, parcelas, descricao, categoria_id, documento, vencimento, valor, status, forma_pagamento, observacao, motivo, financeiro_categorias ( nome )';

export function useContasPagar(petshopId: string, habilitado: boolean) {
  return useQuery({
    queryKey: [petshopId, 'contas_pagar'],
    enabled: habilitado,
    queryFn: async () =>
      dado<ContaPagar[]>(await supabase.from('contas_pagar')
        .select(`${CAMPOS}, fornecedor_id, recebimento_id, pago_em, valor_pago, fornecedores ( nome )`)
        .eq('petshop_id', petshopId).order('vencimento').limit(1000)),
  });
}

export function useContasReceberManuais(petshopId: string, habilitado: boolean) {
  return useQuery({
    queryKey: [petshopId, 'contas_receber'],
    enabled: habilitado,
    queryFn: async () =>
      dado<ContaReceber[]>(await supabase.from('contas_receber')
        .select(`${CAMPOS}, tutor_id, recebido_em, valor_recebido, tutor_petshop ( nome )`)
        .eq('petshop_id', petshopId).order('vencimento').limit(1000)),
  });
}

export function useReceberAbertas(petshopId: string, habilitado: boolean) {
  return useQuery({
    queryKey: [petshopId, 'contas_receber_abertas'],
    enabled: habilitado,
    queryFn: async () => dado<ReceberAberta[]>(await supabase.rpc('contas_receber_abertas', { p_petshop: petshopId })),
  });
}

export async function atualizarContas(qc: QueryClient, petshopId: string) {
  await Promise.all(['contas_pagar', 'contas_receber', 'contas_receber_abertas', 'financeiro_categorias', 'agendamentos']
    .map((k) => qc.invalidateQueries({ queryKey: [petshopId, k] })));
}

// ------------------------------------------------------------------ Ações
export async function lancarConta(args: {
  petshopId: string; tipo: TipoConta; descricao: string; categoriaId: string; parcelas: Parcela[];
  fornecedorId?: string | null; tutorId?: string | null; documento?: string; observacao?: string;
}) {
  return dado<string>(await supabase.rpc('conta_lancar', {
    p_petshop: args.petshopId, p_tipo: args.tipo, p_descricao: args.descricao, p_categoria: args.categoriaId,
    p_parcelas: args.parcelas as unknown as Json,
    p_fornecedor: args.fornecedorId || undefined, p_tutor: args.tutorId || undefined,
    p_documento: args.documento?.trim() || undefined, p_observacao: args.observacao?.trim() || undefined,
  }));
}

export async function editarConta(tipo: TipoConta, id: string, patch: {
  vencimento?: string; valor?: number; descricao?: string; categoria?: string; observacao?: string;
}) {
  dado(await supabase.rpc('conta_editar', {
    p_tipo: tipo, p_conta: id, p_vencimento: patch.vencimento, p_valor: patch.valor,
    p_descricao: patch.descricao, p_categoria: patch.categoria, p_observacao: patch.observacao,
  }));
}

export async function baixarConta(tipo: TipoConta, id: string, forma: string, data: string, valor: number) {
  dado(await supabase.rpc('conta_baixar', { p_tipo: tipo, p_conta: id, p_forma: forma, p_data: data, p_valor: valor }));
}

export async function cancelarConta(tipo: TipoConta, id: string, motivo: string) {
  dado(await supabase.rpc('conta_cancelar', { p_tipo: tipo, p_conta: id, p_motivo: motivo }));
}

export async function reabrirConta(tipo: TipoConta, id: string) {
  dado(await supabase.rpc('conta_reabrir', { p_tipo: tipo, p_conta: id }));
}

/** Fiado, parcial ou pendente de um atendimento entregue. */
export async function receberAtendimento(agendamentoId: string, forma: string, valor: number) {
  dado(await supabase.rpc('receber_agendamento', { p_agendamento: agendamentoId, p_forma: forma, p_valor: valor }));
}

// ------------------------------------------------------------------ Categorias (tabela; as de sistema são protegidas)
export async function salvarCategoria(petshopId: string, c: { tipo: 'despesa' | 'receita'; nome: string; ativo: boolean }, id?: string) {
  if (id) dado(await supabase.from('financeiro_categorias').update({ nome: c.nome.trim(), ativo: c.ativo }).eq('id', id));
  else dado(await supabase.from('financeiro_categorias').insert({ petshop_id: petshopId, tipo: c.tipo, nome: c.nome.trim() }));
}
