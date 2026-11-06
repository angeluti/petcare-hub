// Leituras do painel (TanStack Query). Toda chave começa pelo pet shop:
// trocar de pet shop nunca reaproveita cache de outro.
import { useQuery } from '@tanstack/react-query';
import { supabase, dado } from './supabase';
import { faixaDoDia, type Dia } from './tempo';
import type {
  AgendamentoLista, Bloqueio, Membro, BotConfig, HorarioDisponivel, HorarioFuncionamento, PetVinculo, Recurso, Servico, TutorVinculo,
} from './tipos';

export const SELECT_AGENDAMENTO = `
  id, inicio, fim, status, origem, encaixe, valor_total, pagamento_status, observacoes, motivo_cancelamento,
  recurso_id, pet_id, tutor_id,
  recursos ( nome, cor ),
  pet_petshop ( temperamento, pets ( nome, porte, raca, especie ) ),
  tutor_petshop ( nome, tutores ( telefone ) ),
  agendamento_itens ( id, tipo, servico_id, descricao, valor_total, duracao_min )
`;

export function useAgendamentos(petshopId: string, fuso: string, dia: Dia, dias: number) {
  return useQuery({
    queryKey: [petshopId, 'agendamentos', dia, dias],
    queryFn: async () => {
      const { de, ate } = faixaDoDia(dia, fuso, dias);
      return dado<AgendamentoLista[]>(
        await supabase
          .from('agendamentos')
          .select(SELECT_AGENDAMENTO)
          .eq('petshop_id', petshopId) // a RLS já isola; o filtro evita misturar pet shops de quem tem vários
          .gte('inicio', de)
          .lt('inicio', ate)
          .order('inicio'),
      );
    },
    refetchInterval: 60_000, // o bot também agenda: atualiza a cada minuto
  });
}

export function useRecursos(petshopId: string) {
  return useQuery({
    queryKey: [petshopId, 'recursos'],
    queryFn: async () =>
      dado<Recurso[]>(
        await supabase
          .from('recursos')
          .select('id, nome, tipo, capacidade, intervalo_entrada_min, cor, ordem, ativo, recurso_servicos ( servico_id )')
          .eq('petshop_id', petshopId)
          .order('ordem')
          .order('nome'),
      ),
  });
}

export function useServicos(petshopId: string) {
  return useQuery({
    queryKey: [petshopId, 'servicos'],
    queryFn: async () =>
      dado<Servico[]>(
        await supabase
          .from('servicos')
          .select('id, nome, tipo, adicional, descricao, disponivel_bot, ordem, ativo, servico_precos ( porte, preco, duracao_min )')
          .eq('petshop_id', petshopId)
          .order('adicional')
          .order('ordem')
          .order('nome'),
      ),
  });
}

export function useHorariosFuncionamento(petshopId: string) {
  return useQuery({
    queryKey: [petshopId, 'horarios_funcionamento'],
    queryFn: async () =>
      dado<HorarioFuncionamento[]>(
        await supabase
          .from('horarios_funcionamento')
          .select('id, dia_semana, abre, fecha')
          .eq('petshop_id', petshopId)
          .order('dia_semana')
          .order('abre'),
      ),
  });
}

export function useTutores(petshopId: string) {
  return useQuery({
    queryKey: [petshopId, 'tutores'],
    queryFn: async () =>
      dado<TutorVinculo[]>(
        await supabase
          .from('tutor_petshop')
          .select('id, tutor_id, nome, email, endereco, observacoes, aceita_mensagens, origem, tutores ( telefone )')
          .eq('petshop_id', petshopId)
          .eq('ativo', true)
          .order('nome'),
      ),
  });
}

export function usePets(petshopId: string) {
  return useQuery({
    queryKey: [petshopId, 'pets'],
    queryFn: async () =>
      dado<PetVinculo[]>(
        await supabase
          .from('pet_petshop')
          .select('id, pet_id, temperamento, preferencias, observacoes, pets ( id, tutor_id, nome, especie, raca, porte, nascimento, alergias )')
          .eq('petshop_id', petshopId)
          .eq('ativo', true),
      ),
  });
}

export function useBotConfig(petshopId: string, ligado: boolean) {
  return useQuery({
    queryKey: [petshopId, 'bot_config'],
    enabled: ligado,
    queryFn: async () =>
      dado<BotConfig | null>(
        await supabase
          .from('bot_config')
          .select('petshop_id, nome_bot, saudacao, pausa_humana_horas, ativo, canal, conexao_status')
          .eq('petshop_id', petshopId)
          .maybeSingle(),
      ),
  });
}

/** Motor de disponibilidade do banco (o mesmo que o bot usa). */
export function useHorariosDisponiveis(params: {
  petshopId: string;
  servicos: string[];
  porte: string | null;
  dia: Dia;
  recurso?: string | null;
  habilitado: boolean;
}) {
  const { petshopId, servicos, porte, dia, recurso, habilitado } = params;
  return useQuery({
    queryKey: [petshopId, 'disponiveis', servicos.join(','), porte, dia, recurso ?? 'qualquer'],
    enabled: habilitado && servicos.length > 0 && !!porte,
    staleTime: 0,
    queryFn: async () =>
      dado<HorarioDisponivel[]>(
        await supabase.rpc('horarios_disponiveis', {
          p_petshop: petshopId,
          p_servicos: servicos,
          p_porte: porte as string,
          p_data: dia,
          ...(recurso ? { p_recurso: recurso } : {}),
          p_aplicar_antecedencia: false, // painel: o dono pode marcar em cima da hora
        }),
      ),
  });
}

const SELECT_BLOQUEIO = 'id, recurso_id, tipo, inicio, fim, motivo, recursos ( nome )';

/** Bloqueios que tocam o intervalo [dia, dia + dias) no fuso do pet shop (agenda dia/semana). */
export function useBloqueios(petshopId: string, fuso: string, dia: Dia, dias: number) {
  return useQuery({
    queryKey: [petshopId, 'bloqueios', dia, dias],
    queryFn: async () => {
      const { de, ate } = faixaDoDia(dia, fuso, dias);
      return dado<Bloqueio[]>(
        await supabase
          .from('bloqueios')
          .select(SELECT_BLOQUEIO)
          .eq('petshop_id', petshopId)
          .lt('inicio', ate)
          .gt('fim', de)
          .order('inicio'),
      );
    },
  });
}

/** Bloqueios que ainda não terminaram (lista da Configuração). */
export function useBloqueiosFuturos(petshopId: string) {
  return useQuery({
    queryKey: [petshopId, 'bloqueios', 'futuros'],
    queryFn: async () =>
      dado<Bloqueio[]>(
        await supabase
          .from('bloqueios')
          .select(SELECT_BLOQUEIO)
          .eq('petshop_id', petshopId)
          .gt('fim', new Date().toISOString())
          .order('inicio')
          .limit(200),
      ),
  });
}

/** Agendamentos ativos que caem dentro de um bloqueio (para avisar o dono). */
export async function agendamentosNoPeriodo(petshopId: string, inicio: string, fim: string, recursoId: string | null) {
  let q = supabase
    .from('agendamentos')
    .select(SELECT_AGENDAMENTO)
    .eq('petshop_id', petshopId)
    .not('status', 'in', '(cancelado,no_show,entregue)')
    .lt('inicio', fim)
    .gt('fim', inicio)
    .order('inicio');
  if (recursoId) q = q.eq('recurso_id', recursoId);
  return dado<AgendamentoLista[]>(await q);
}

export function useMembros(petshopId: string, habilitado: boolean) {
  return useQuery({
    queryKey: [petshopId, 'membros'],
    enabled: habilitado,
    queryFn: async () =>
      dado<Membro[]>(
        await supabase
          .from('petshop_membros')
          .select('id, user_id, nome, papel, ativo, criado_em')
          .eq('petshop_id', petshopId)
          .order('criado_em'),
      ),
  });
}
