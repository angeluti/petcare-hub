// Escritas do painel. Vínculo de tutor e pet SÓ por RPC (cadastrar_tutor /
// cadastrar_pet): a RLS não libera INSERT direto nessas tabelas.
import { supabase, dado } from './supabase';
import type { AgendamentoLista, StatusAgendamento } from './tipos';

export async function cadastrarTutor(petshopId: string, telefone: string, nome: string): Promise<string> {
  return dado<string>(
    await supabase.rpc('cadastrar_tutor', { p_petshop: petshopId, p_telefone: telefone, p_nome: nome, p_origem: 'manual' }),
  );
}

export interface NovoPet { nome: string; porte: string; especie: string; raca?: string; nascimento?: string }

export async function cadastrarPet(petshopId: string, tutorId: string, p: NovoPet): Promise<string> {
  return dado<string>(
    await supabase.rpc('cadastrar_pet', {
      p_petshop: petshopId,
      p_tutor: tutorId,
      p_nome: p.nome.trim(),
      p_porte: p.porte,
      p_especie: p.especie,
      ...(p.raca?.trim() ? { p_raca: p.raca.trim() } : {}),
      ...(p.nascimento ? { p_nascimento: p.nascimento } : {}),
    }),
  );
}

export interface Reserva {
  petshopId: string;
  petId: string;
  tutorId: string;
  servicos: string[];
  inicio: string;           // ISO UTC
  recurso?: string | null;  // vazio = o banco escolhe o profissional com mais vagas
  observacoes?: string;
  encaixe?: boolean;
  status?: 'pendente' | 'confirmado';
}

/** Conflito de horário volta como erro com code '23P01' (ver lib/erros.ts). */
export async function reservar(r: Reserva) {
  return dado<{ id: string }>(
    await supabase.rpc('reservar_agendamento', {
      p_petshop: r.petshopId,
      p_pet: r.petId,
      p_tutor: r.tutorId,
      p_servicos: r.servicos,
      p_inicio: r.inicio,
      ...(r.recurso ? { p_recurso: r.recurso } : {}),
      p_origem: 'manual',
      ...(r.observacoes?.trim() ? { p_observacoes: r.observacoes.trim() } : {}),
      p_encaixe: !!r.encaixe,
      p_status: r.status ?? 'confirmado',
    }),
  );
}

export async function mudarStatus(
  ag: AgendamentoLista, status: StatusAgendamento, motivo?: string, canceladoPor?: 'tutor' | 'petshop',
) {
  const patch: { status: StatusAgendamento; motivo_cancelamento?: string | null; cancelado_por?: 'tutor' | 'petshop' } = { status };
  if (status === 'cancelado') {
    patch.motivo_cancelamento = motivo?.trim() || null;
    if (canceladoPor) patch.cancelado_por = canceladoPor; // sem escolha, o banco marca 'petshop'
  }
  dado(await supabase.from('agendamentos').update(patch).eq('id', ag.id));
}

export async function remarcar(ag: AgendamentoLista, inicio: string, fim: string, recursoId: string, encaixe: boolean) {
  dado(
    await supabase
      .from('agendamentos')
      .update({ inicio, fim, recurso_id: recursoId, encaixe })
      .eq('id', ag.id),
  );
}

export async function salvarObservacoes(ag: AgendamentoLista, observacoes: string) {
  dado(await supabase.from('agendamentos').update({ observacoes: observacoes.trim() || null }).eq('id', ag.id));
}

export async function checkin(ag: AgendamentoLista) {
  dado(await supabase.rpc('fazer_checkin', { p_agendamento: ag.id }));
}

export async function checkout(ag: AgendamentoLista, pagamentos: { forma: string; valor: number }[], fiado: boolean) {
  dado(await supabase.rpc('fazer_checkout', { p_agendamento: ag.id, p_pagamentos: pagamentos, p_fiado: fiado }));
}

// ------------------------------------------------------------ Rodada D

/** BT-09 · pausa o bot para um telefone (agora + pausa_humana_horas). */
export async function pausarBot(petshopId: string, telefone: string) {
  dado(await supabase.rpc('pausar_bot_tutor', { p_petshop: petshopId, p_telefone: telefone }));
}

/** BT-09 · devolve a conversa ao bot (estado idle). */
export async function devolverBot(conversaId: string) {
  dado(await supabase.rpc('bot_devolver', { p_conversa: conversaId }));
}

/** TP-12 · liga/desliga mensagens automáticas a pedido do tutor no balcão.
 *  O banco registra quem e quando (trigger do arquivo 17). */
export async function definirMensagens(vinculoId: string, aceita: boolean) {
  dado(await supabase.from('tutor_petshop').update({ aceita_mensagens: aceita }).eq('id', vinculoId));
}
