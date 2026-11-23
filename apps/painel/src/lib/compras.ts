// Administração · Compras (arquivos 22 e 23): pedido de compra manual,
// recebimento (com ou sem pedido) e parcelas que viram contas a pagar.
// Só dono, gerente e estoquista leem e gravam (RLS "estoque").
import { useQuery } from '@tanstack/react-query';
import { supabase, dado } from './supabase';
import type { Produto } from './administracao';
import type { Json } from './database.types';

// ------------------------------------------------------------------ Tipos
export type StatusPedido = 'rascunho' | 'enviado' | 'recebido_parcial' | 'recebido' | 'encerrado' | 'cancelado';

export const STATUS_PEDIDO: Record<StatusPedido, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  recebido_parcial: 'Recebido em parte',
  recebido: 'Recebido',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
};

export const PEDIDO_ABERTO: StatusPedido[] = ['rascunho', 'enviado', 'recebido_parcial'];

export interface ItemPedido {
  id: string;
  produto_id: string;
  produto_unidade_id: string;
  unidade_rotulo: string;
  fator: number;
  qtd_pedida: number;
  custo_previsto: number;
  qtd_recebida: number;
}

export interface Pedido {
  id: string;
  numero: number;
  fornecedor_id: string;
  status: StatusPedido;
  data_prevista: string | null;
  observacao: string | null;
  motivo: string | null;
  criado_em: string;
  enviado_em: string | null;
  finalizado_em: string | null;
  fornecedores: { nome: string } | null;
  pedido_compra_itens: ItemPedido[];
}

export interface ItemRecebimento {
  id: string;
  produto_id: string;
  unidade_rotulo: string;
  fator: number;
  quantidade: number;
  custo_unitario: number;
  valor_total: number;
}

export interface Recebimento {
  id: string;
  numero: number;
  pedido_id: string | null;
  recebido_em: string;
  nf_numero: string | null;
  valor_total: number;
  observacao: string | null;
  fornecedores: { nome: string } | null;
  pedidos_compra: { numero: number } | null;
  estoque_locais: { nome: string } | null;
  recebimento_itens: ItemRecebimento[];
}

// ------------------------------------------------------------------ Leituras
export function usePedidos(petshopId: string, habilitado: boolean) {
  return useQuery({
    queryKey: [petshopId, 'pedidos_compra'],
    enabled: habilitado,
    queryFn: async () =>
      dado<Pedido[]>(
        await supabase
          .from('pedidos_compra')
          .select(`id, numero, fornecedor_id, status, data_prevista, observacao, motivo, criado_em, enviado_em, finalizado_em,
                   fornecedores ( nome ),
                   pedido_compra_itens ( id, produto_id, produto_unidade_id, unidade_rotulo, fator, qtd_pedida, custo_previsto, qtd_recebida )`)
          .eq('petshop_id', petshopId)
          .order('numero', { ascending: false }),
      ),
  });
}

export function useRecebimentos(petshopId: string, habilitado: boolean) {
  return useQuery({
    queryKey: [petshopId, 'recebimentos'],
    enabled: habilitado,
    queryFn: async () =>
      dado<Recebimento[]>(
        await supabase
          .from('recebimentos')
          .select(`id, numero, pedido_id, recebido_em, nf_numero, valor_total, observacao,
                   fornecedores ( nome ), pedidos_compra ( numero ), estoque_locais ( nome ),
                   recebimento_itens ( id, produto_id, unidade_rotulo, fator, quantidade, custo_unitario, valor_total )`)
          .eq('petshop_id', petshopId)
          .order('numero', { ascending: false }),
      ),
  });
}

// ------------------------------------------------------------------ Pedido (rascunho por tabela; status por RPC)
export async function criarPedido(petshopId: string, fornecedorId: string, dataPrevista: string | null, observacao: string): Promise<string> {
  const novo = dado<{ id: string }>(
    await supabase
      .from('pedidos_compra')
      .insert({ petshop_id: petshopId, fornecedor_id: fornecedorId, data_prevista: dataPrevista, observacao: observacao.trim() || null })
      .select('id')
      .single(),
  );
  return novo.id;
}

export async function alterarPedido(id: string, patch: { fornecedor_id?: string; data_prevista?: string | null; observacao?: string | null }) {
  dado(await supabase.from('pedidos_compra').update(patch).eq('id', id));
}

export async function apagarRascunho(id: string) {
  dado(await supabase.from('pedidos_compra').delete().eq('id', id));
}

/** O banco preenche produto, rótulo e fator a partir da embalagem. */
export async function incluirItemPedido(petshopId: string, pedidoId: string, produtoUnidadeId: string, qtd: number, custo: number) {
  dado(
    await supabase.from('pedido_compra_itens').insert({
      petshop_id: petshopId, pedido_id: pedidoId, produto_unidade_id: produtoUnidadeId,
      produto_id: '00000000-0000-0000-0000-000000000000', unidade_rotulo: '', fator: 1,   // preenchidos pela trigger
      qtd_pedida: qtd, custo_previsto: custo,
    }),
  );
}

export async function alterarItemPedido(id: string, patch: { qtd_pedida?: number; custo_previsto?: number }) {
  dado(await supabase.from('pedido_compra_itens').update(patch).eq('id', id));
}

export async function removerItemPedido(id: string) {
  dado(await supabase.from('pedido_compra_itens').delete().eq('id', id));
}

export async function enviarPedido(id: string) {
  dado(await supabase.rpc('pedido_compra_enviar', { p_pedido: id }));
}
export async function cancelarPedido(id: string, motivo: string) {
  dado(await supabase.rpc('pedido_compra_cancelar', { p_pedido: id, p_motivo: motivo }));
}
export async function encerrarPedido(id: string, motivo: string) {
  dado(await supabase.rpc('pedido_compra_encerrar', { p_pedido: id, p_motivo: motivo }));
}

// ------------------------------------------------------------------ Recebimento
export interface Parcela { vencimento: string; valor: number }

export interface ItemRecebendo {
  pedido_item_id?: string;
  produto_unidade_id?: string;
  quantidade: number;
  custo_unitario: number;
}

export interface ResultadoRecebimento {
  recebimento_id: string;
  numero: number;
  valor_total: number;
  pedido_status: StatusPedido | null;
}

export async function receberCompra(args: {
  petshopId: string;
  itens: ItemRecebendo[];
  pedidoId?: string | null;
  fornecedorId?: string | null;
  localId?: string | null;
  nf?: string;
  recebidoEm: string;            // ISO
  parcelas: Parcela[];
  observacao?: string;
}): Promise<ResultadoRecebimento> {
  return dado<ResultadoRecebimento>(
    await supabase.rpc('compra_receber', {
      p_petshop: args.petshopId,
      p_itens: args.itens as unknown as Json,
      p_pedido: args.pedidoId ?? undefined,
      p_fornecedor: args.fornecedorId ?? undefined,
      p_local: args.localId ?? undefined,
      p_nf: args.nf?.trim() || undefined,
      p_recebido_em: args.recebidoEm,
      p_parcelas: args.parcelas.length ? (args.parcelas as unknown as Json) : undefined,
      p_observacao: args.observacao?.trim() || undefined,
    }),
  );
}

// ------------------------------------------------------------------ Contas e regras de quantidade
export function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Divide o total em n parcelas com intervalo de dias; a diferença de centavos fica na primeira. */
export function dividirParcelas(total: number, n: number, primeiroVencimento: string, intervaloDias: number,
                                somarDias: (dia: string, k: number) => string): Parcela[] {
  const t = Math.round(total * 100);
  const base = Math.floor(t / n);
  return Array.from({ length: n }, (_, i) => ({
    vencimento: somarDias(primeiroVencimento, i * intervaloDias),
    valor: (i === 0 ? base + (t - base * n) : base) / 100,
  }));
}

/** Confere a quantidade de embalagem pela regra do arquivo 23. Devolve a mensagem de erro ou null. */
export function quantidadeInvalida(qtd: number | null, fator: number, produto: Pick<Produto, 'unidade_base' | 'nome'>): string | null {
  if (qtd === null || !(qtd > 0)) return `Informe a quantidade de "${produto.nome}".`;
  if (produto.unidade_base === 'un' && !Number.isInteger(qtd)) return `"${produto.nome}" é controlado por unidade: use quantidade inteira.`;
  const base = Math.round(qtd * fator * 10000) / 10000;
  if (!Number.isInteger(base)) return `A quantidade de "${produto.nome}" não fecha em ${produto.unidade_base} inteiros.`;
  return null;
}
