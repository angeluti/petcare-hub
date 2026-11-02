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
  origem: string;
  tutores: { telefone: string } | null;
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
}
