// Formatos que o painel usa (resultados de selects com embed e de RPCs).
// Os tipos gerados (database.types.ts) cobrem tabelas e funções; estes
// descrevem o recorte que cada tela pede, incluindo os embeds.
import type { Porte } from './formato';

export type Papel = 'dono' | 'gerente' | 'recepcao' | 'profissional' | 'veterinario' | 'hospedagem' | 'super_admin';

export interface Petshop {
  id: string;
  nome: string;
  fuso: string;
  plano_codigo: string;
  modo_capacidade: 'simples' | 'multiplo';
  intervalo_slot_min: number;
  antecedencia_min_minutos: number;
  antecedencia_max_dias: number;
  cancelamento_min_horas: number;
  endereco: string | null;
  telefone_contato: string | null;
  logo_url: string | null;
  // Só leitura para o dono (trigger private.proteger_petshop): só a Harpia altera
  slug: string | null;
  telefone_wp: string | null;
  ativo: boolean;
}

export type TipoBloqueio = 'feriado' | 'folga' | 'almoco' | 'manutencao' | 'outro';

export const TIPO_BLOQUEIO_ROTULO: Record<TipoBloqueio, string> = {
  feriado: 'Feriado',
  folga: 'Folga',
  almoco: 'Almoço',
  manutencao: 'Manutenção',
  outro: 'Compromisso',
};

/** recurso_id nulo = pet shop inteiro (feriado, dia fechado). */
export interface Bloqueio {
  id: string;
  recurso_id: string | null;
  tipo: TipoBloqueio;
  inicio: string;
  fim: string;
  motivo: string | null;
  recursos: { nome: string } | null;
}

export interface Membro {
  id: string;
  user_id: string;
  nome: string | null;
  papel: Papel;
  ativo: boolean;
  criado_em: string;
}

export type StatusAgendamento =
  | 'pendente' | 'confirmado' | 'em_atendimento' | 'pronto' | 'entregue' | 'cancelado' | 'no_show';

export const STATUS_ROTULO: Record<StatusAgendamento, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  em_atendimento: 'Em atendimento',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
  no_show: 'Não veio',
};

export interface AgendamentoLista {
  id: string;
  inicio: string;
  fim: string;
  status: StatusAgendamento;
  origem: 'bot' | 'manual' | 'site';
  encaixe: boolean;
  valor_total: number;
  pagamento_status: 'pendente' | 'parcial' | 'pago' | 'fiado';
  observacoes: string | null;
  motivo_cancelamento: string | null;
  cancelado_por: 'tutor' | 'petshop' | null;
  recurso_id: string;
  pet_id: string;
  tutor_id: string;
  recursos: { nome: string; cor: string | null } | null;
  pet_petshop: { temperamento: string | null; pets: { nome: string; porte: Porte | null; raca: string | null; especie: string } | null } | null;
  tutor_petshop: { nome: string; tutores: { telefone: string } | null } | null;
  agendamento_itens: { id: string; tipo: string; servico_id: string | null; descricao: string; valor_total: number; duracao_min: number }[];
}

export interface Recurso {
  id: string;
  nome: string;
  tipo: 'profissional' | 'sala' | 'baia';
  capacidade: number;
  intervalo_entrada_min: number;
  cor: string | null;
  ordem: number;
  ativo: boolean;
  recurso_servicos: { servico_id: string }[];
}

export interface ServicoPreco { porte: Porte; preco: number; duracao_min: number }

export interface Servico {
  id: string;
  nome: string;
  tipo: string;
  adicional: boolean;
  descricao: string | null;
  disponivel_bot: boolean;
  ordem: number;
  ativo: boolean;
  servico_precos: ServicoPreco[];
}

export interface HorarioFuncionamento { id: string; dia_semana: number; abre: string; fecha: string }

export interface TutorVinculo {
  id: string;            // tutor_petshop.id
  tutor_id: string;
  nome: string;
  email: string | null;
  endereco: string | null;
  observacoes: string | null;
  aceita_mensagens: boolean;
  opt_out_em: string | null;
  /** quem ligou/desligou as mensagens por último: 'bot' (tutor pelo WhatsApp) ou 'painel' (a pedido do tutor no balcão) */
  mensagens_alterado_em: string | null;
  mensagens_alterado_por: string | null;
  mensagens_alterado_origem: 'bot' | 'painel' | null;
  origem: string;
  tutores: { telefone: string } | null;
}

export interface Consentimento {
  id: string;
  escopo: 'compartilhar_dados_pet' | 'compartilhar_saude';
  versao_termo: string;
  canal: string;
  concedido_em: string;
  revogado_em: string | null;
}

export interface ConversaPausada {
  conversa_id: string;
  telefone: string;
  tutor_id: string | null;
  tutor_nome: string | null;
  estado: 'humano' | 'bloqueado';
  humano_desde: string | null;
  humano_ate: string | null;
  pausado_por_painel: boolean;
  vencida: boolean;
}

export interface ConversaBot {
  id: string;
  estado: string;
  humano_ate: string | null;
  humano_desde: string | null;
  ultimo_contato: string;
}

/** Linha do relatório (totais do período ou uma semana). */
export interface LinhaRelatorio {
  semana?: string;
  total: number;
  cancelados: number;
  cancel_tutor: number;
  cancel_tutor_bot: number;
  cancel_petshop: number;
  nao_cancelados: number;
  pelo_bot: number;
  entregues: number;
  no_show: number;
  sem_desfecho: number;
  pct_bot: number | null;
  pct_no_show: number | null;
  pct_cancelamento: number | null;
}

export interface RelatorioPoc {
  de: string;
  ate: string;
  fuso: string;
  bot_ativo: boolean;
  meta_pct_bot: number;
  totais: LinhaRelatorio;
  semanas: LinhaRelatorio[];
}

export interface PetVinculo {
  id: string;            // pet_petshop.id
  pet_id: string;
  temperamento: string | null;
  preferencias: string | null;
  observacoes: string | null;
  pets: {
    id: string; tutor_id: string; nome: string; especie: string; raca: string | null;
    porte: Porte | null; nascimento: string | null; alergias: string | null;
  } | null;
}

export interface HorarioDisponivel {
  inicio: string; fim: string; recurso_id: string; recurso_nome: string; vagas: number;
}

export interface BotConfig {
  petshop_id: string;
  nome_bot: string;
  saudacao: string;
  pausa_humana_horas: number;
  ativo: boolean;
  canal: string;
  conexao_status: string;
  telefone_avisos: string | null;
}
