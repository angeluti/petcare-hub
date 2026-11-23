// Administração · movimentos do estoque (arquivos 22 e 23): requisição do salão,
// devolução, transferência entre locais, inventário e avisos de reposição.
// Toda mudança de estoque é RPC: o banco confere papel, saldo e quantidade.
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase, dado } from './supabase';
import type { Json } from './database.types';

// ------------------------------------------------------------------ Tipos
export type StatusRequisicao =
  | 'pendente' | 'atendida' | 'atendida_parcial'                // consumo
  | 'solicitada' | 'aprovada' | 'recebida'                       // devolução
  | 'recusada' | 'cancelada';

export const STATUS_REQUISICAO: Record<StatusRequisicao, string> = {
  pendente: 'Aguardando envio',
  atendida: 'Enviada',
  atendida_parcial: 'Enviada em parte',
  solicitada: 'Aguardando aprovação',
  aprovada: 'Aprovada, aguardando recebimento',
  recebida: 'Recebida',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
};

export const REQ_ABERTA: StatusRequisicao[] = ['pendente', 'solicitada', 'aprovada'];

export interface ItemRequisicao {
  id: string;
  produto_id: string;
  produto_unidade_id: string;
  unidade_rotulo: string;
  fator: number;
  qtd_solicitada: number;
  qtd_atendida: number | null;
  item_origem_id: string | null;
}

export interface Requisicao {
  id: string;
  numero: number;
  tipo: 'consumo' | 'devolucao';
  status: StatusRequisicao;
  local_id: string;
  requisicao_origem_id: string | null;
  recurso_id: string | null;
  observacao: string | null;
  motivo: string | null;
  solicitado_por: string | null;
  solicitada_em: string;
  decidida_em: string | null;
  concluida_em: string | null;
  estoque_locais: { nome: string } | null;
  recursos: { nome: string } | null;
  requisicao_itens: ItemRequisicao[];
}

export type StatusTransferencia = 'solicitada' | 'aprovada' | 'concluida' | 'recusada' | 'cancelada';

export const STATUS_TRANSFERENCIA: Record<StatusTransferencia, string> = {
  solicitada: 'Aguardando aprovação',
  aprovada: 'Aprovada, aguardando movimentação',
  concluida: 'Concluída',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
};

export interface ItemTransferencia {
  id: string;
  produto_id: string;
  produto_unidade_id: string;
  unidade_rotulo: string;
  fator: number;
  qtd_solicitada: number;
  qtd_movida: number | null;
}

export interface Transferencia {
  id: string;
  numero: number;
  origem_id: string;
  destino_id: string;
  status: StatusTransferencia;
  observacao: string | null;
  motivo: string | null;
  solicitado_por: string | null;
  solicitada_em: string;
  concluida_em: string | null;
  transferencia_itens: ItemTransferencia[];
}

export interface Inventario {
  id: string;
  numero: number;
  local_id: string;
  status: 'aberto' | 'fechado' | 'cancelado';
  observacao: string | null;
  aberto_em: string;
  fechado_em: string | null;
  estoque_locais: { nome: string } | null;
  inventario_itens: ItemInventario[];
}

export interface ItemInventario {
  id: string;
  produto_id: string;
  saldo_sistema: number | null;
  qtd_contada: number | null;
  ajuste: number | null;
  contado_em: string | null;
}

export interface Aviso {
  tipo: 'abaixo_minimo' | 'falta_requisicao';
  produto_id: string;
  produto: string;
  unidade_base: string;
  local_id: string;
  local: string;
  saldo: number;
  minimo: number | null;
  faltante: number;
  cobertura: { local_id: string; local: string; disponivel: number }[];
  referencia: string | null;
  ocorrido_em: string;
}

// ------------------------------------------------------------------ Leituras
export function useRequisicoes(petshopId: string) {
  return useQuery({
    queryKey: [petshopId, 'requisicoes'],
    refetchInterval: 60_000,
    queryFn: async () =>
      dado<Requisicao[]>(
        await supabase
          .from('requisicoes')
          .select(`id, numero, tipo, status, local_id, requisicao_origem_id, recurso_id, observacao, motivo,
                   solicitado_por, solicitada_em, decidida_em, concluida_em,
                   estoque_locais ( nome ), recursos ( nome ),
                   requisicao_itens ( id, produto_id, produto_unidade_id, unidade_rotulo, fator, qtd_solicitada, qtd_atendida, item_origem_id )`)
          .eq('petshop_id', petshopId)
          .order('numero', { ascending: false })
          .limit(300),
      ),
  });
}

export function useTransferencias(petshopId: string) {
  return useQuery({
    queryKey: [petshopId, 'transferencias'],
    queryFn: async () =>
      dado<Transferencia[]>(
        await supabase
          .from('transferencias')
          .select(`id, numero, origem_id, destino_id, status, observacao, motivo, solicitado_por, solicitada_em, concluida_em,
                   transferencia_itens ( id, produto_id, produto_unidade_id, unidade_rotulo, fator, qtd_solicitada, qtd_movida )`)
          .eq('petshop_id', petshopId)
          .order('numero', { ascending: false })
          .limit(200),
      ),
  });
}

export function useInventarios(petshopId: string, habilitado: boolean) {
  return useQuery({
    queryKey: [petshopId, 'inventarios'],
    enabled: habilitado,
    queryFn: async () =>
      dado<Inventario[]>(
        await supabase
          .from('inventarios')
          .select(`id, numero, local_id, status, observacao, aberto_em, fechado_em, estoque_locais ( nome ),
                   inventario_itens ( id, produto_id, saldo_sistema, qtd_contada, ajuste, contado_em )`)
          .eq('petshop_id', petshopId)
          .order('numero', { ascending: false })
          .limit(50),
      ),
  });
}

export function useAvisosEstoque(petshopId: string) {
  return useQuery({
    queryKey: [petshopId, 'estoque_avisos'],
    refetchInterval: 120_000,
    queryFn: async () => dado<Aviso[]>(await supabase.rpc('estoque_avisos', { p_petshop: petshopId })),
  });
}

/** Depois de qualquer movimento: saldos, documentos e avisos mudam. */
export async function atualizarMovimentos(qc: QueryClient, petshopId: string) {
  await Promise.all(
    ['requisicoes', 'transferencias', 'inventarios', 'estoque_avisos', 'produtos', 'produto_custos']
      .map((k) => qc.invalidateQueries({ queryKey: [petshopId, k] })),
  );
}

// ------------------------------------------------------------------ Requisição e devolução
export interface ItemPedidoEstoque { produto_unidade_id: string; quantidade: number }
export interface ItemQuantidade { item_id: string; quantidade: number }

export interface ResultadoEnvio {
  status: StatusRequisicao;
  precisa_comprar: boolean;
  itens: { item_id: string; solicitada: number; atendida: number; faltante: number }[];
}

export async function criarRequisicao(petshopId: string, itens: ItemPedidoEstoque[], localId: string | null, recursoId: string | null, observacao: string) {
  return dado<string>(await supabase.rpc('requisicao_criar', {
    p_petshop: petshopId, p_itens: itens as unknown as Json,
    p_local: localId ?? undefined, p_recurso: recursoId ?? undefined, p_observacao: observacao.trim() || undefined,
  }));
}

export async function atenderRequisicao(id: string, itens: ItemQuantidade[]) {
  return dado<ResultadoEnvio>(await supabase.rpc('requisicao_atender', { p_requisicao: id, p_itens: itens as unknown as Json }));
}

export async function recusarRequisicao(id: string, motivo: string) {
  dado(await supabase.rpc('requisicao_recusar', { p_requisicao: id, p_motivo: motivo }));
}

export async function cancelarRequisicao(id: string, motivo: string) {
  dado(await supabase.rpc('requisicao_cancelar', { p_requisicao: id, p_motivo: motivo.trim() || undefined }));
}

export async function criarDevolucao(origemId: string, itens: { item_origem_id: string; quantidade: number }[], observacao: string) {
  return dado<string>(await supabase.rpc('devolucao_criar', {
    p_requisicao_origem: origemId, p_itens: itens as unknown as Json, p_observacao: observacao.trim() || undefined,
  }));
}

export async function aprovarDevolucao(id: string) {
  dado(await supabase.rpc('devolucao_aprovar', { p_requisicao: id }));
}

export async function receberDevolucao(id: string, itens: ItemQuantidade[]) {
  dado(await supabase.rpc('devolucao_receber', { p_requisicao: id, p_itens: itens as unknown as Json }));
}

// ------------------------------------------------------------------ Transferência
export async function criarTransferencia(petshopId: string, origem: string, destino: string, itens: ItemPedidoEstoque[], observacao: string) {
  return dado<string>(await supabase.rpc('transferencia_criar', {
    p_petshop: petshopId, p_origem: origem, p_destino: destino, p_itens: itens as unknown as Json,
    p_observacao: observacao.trim() || undefined,
  }));
}

export async function decidirTransferencia(id: string, aprovar: boolean, motivo?: string) {
  dado(await supabase.rpc('transferencia_decidir', { p_transferencia: id, p_aprovar: aprovar, p_motivo: motivo?.trim() || undefined }));
}

export async function cancelarTransferencia(id: string, motivo: string) {
  dado(await supabase.rpc('transferencia_cancelar', { p_transferencia: id, p_motivo: motivo.trim() || undefined }));
}

export async function confirmarTransferencia(id: string, itens: ItemQuantidade[]) {
  return dado<{ parcial: boolean }>(await supabase.rpc('transferencia_confirmar', { p_transferencia: id, p_itens: itens as unknown as Json }));
}

// ------------------------------------------------------------------ Inventário
export async function abrirInventario(petshopId: string, localId: string, produtos: string[] | null, observacao: string) {
  return dado<string>(await supabase.rpc('inventario_abrir', {
    p_petshop: petshopId, p_local: localId, p_produtos: produtos ?? undefined, p_observacao: observacao.trim() || undefined,
  }));
}

/** Contagem na unidade de controle (embalagem base, fator 1). */
export async function contarInventario(id: string, itens: ItemPedidoEstoque[]) {
  dado(await supabase.rpc('inventario_contar', { p_inventario: id, p_itens: itens as unknown as Json }));
}

export async function fecharInventario(id: string) {
  return dado<{ itens_ajustados: number; valor_ajuste: number }>(await supabase.rpc('inventario_fechar', { p_inventario: id }));
}

export async function cancelarInventario(id: string) {
  dado(await supabase.rpc('inventario_cancelar', { p_inventario: id }));
}
