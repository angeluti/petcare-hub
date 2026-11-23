// Apoio das telas de Compras: datas curtas, totais e invalidação de consultas.
import type { QueryClient } from '@tanstack/react-query';
import type { ItemPedido, Pedido } from '../../lib/compras';
import { diaDe } from '../../lib/tempo';

/** 'yyyy-MM-dd' → 'dd/MM/yyyy' */
export function dataCurta(dia: string | null | undefined): string {
  if (!dia) return '—';
  const [a, m, d] = dia.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** instante ISO → 'dd/MM/yyyy' no fuso do pet shop */
export function dataDe(iso: string | null | undefined, fuso: string): string {
  return iso ? dataCurta(diaDe(iso, fuso)) : '—';
}

export function valorItem(qtd: number, custo: number): number {
  return Math.round(qtd * custo * 100) / 100;
}

export function totalPrevisto(p: Pedido): number {
  return p.pedido_compra_itens.reduce((s, i) => s + valorItem(Number(i.qtd_pedida), Number(i.custo_previsto)), 0);
}

export function pendente(i: ItemPedido): number {
  return Math.round((Number(i.qtd_pedida) - Number(i.qtd_recebida)) * 10000) / 10000;
}

export function percentualRecebido(p: Pedido): number {
  const ped = p.pedido_compra_itens.reduce((s, i) => s + Number(i.qtd_pedida) * Number(i.fator), 0);
  const rec = p.pedido_compra_itens.reduce((s, i) => s + Number(i.qtd_recebida) * Number(i.fator), 0);
  return ped > 0 ? Math.round((rec / ped) * 100) : 0;
}

/** Depois de receber: pedidos, recebimentos, saldo e custo mudam. */
export async function atualizarCompras(qc: QueryClient, petshopId: string) {
  await Promise.all(
    ['pedidos_compra', 'recebimentos', 'produtos', 'produto_custos'].map((k) => qc.invalidateQueries({ queryKey: [petshopId, k] })),
  );
}
