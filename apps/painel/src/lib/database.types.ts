export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achados: {
        Row: {
          criado_em: string
          evidencia: Json
          id: string
          mensagem: string | null
          pet_id: string | null
          plaquinha_id: string | null
          resultado: string
          telefone_achador: string
        }
        Insert: {
          criado_em?: string
          evidencia?: Json
          id?: string
          mensagem?: string | null
          pet_id?: string | null
          plaquinha_id?: string | null
          resultado: string
          telefone_achador: string
        }
        Update: {
          criado_em?: string
          evidencia?: Json
          id?: string
          mensagem?: string | null
          pet_id?: string | null
          plaquinha_id?: string | null
          resultado?: string
          telefone_achador?: string
        }
        Relationships: [
          {
            foreignKeyName: "achados_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achados_plaquinha_id_fkey"
            columns: ["plaquinha_id"]
            isOneToOne: false
            referencedRelation: "plaquinhas"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamento_itens: {
        Row: {
          agendamento_id: string
          criado_em: string
          desconto: number
          descricao: string
          duracao_min: number
          id: string
          petshop_id: string
          preco_unitario: number
          quantidade: number
          servico_id: string | null
          tipo: string
          valor_total: number | null
        }
        Insert: {
          agendamento_id: string
          criado_em?: string
          desconto?: number
          descricao: string
          duracao_min?: number
          id?: string
          petshop_id: string
          preco_unitario: number
          quantidade?: number
          servico_id?: string | null
          tipo: string
          valor_total?: number | null
        }
        Update: {
          agendamento_id?: string
          criado_em?: string
          desconto?: number
          descricao?: string
          duracao_min?: number
          id?: string
          petshop_id?: string
          preco_unitario?: number
          quantidade?: number
          servico_id?: string | null
          tipo?: string
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamento_itens_agendamento_id_petshop_id_fkey"
            columns: ["agendamento_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "agendamento_itens_servico_id_petshop_id_fkey"
            columns: ["servico_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      agendamentos: {
        Row: {
          atualizado_em: string
          cancelado_em: string | null
          cancelado_por: string | null
          checkin_em: string | null
          checkout_em: string | null
          criado_em: string
          criado_por: string | null
          encaixe: boolean
          fim: string
          id: string
          inicio: string
          motivo_cancelamento: string | null
          observacoes: string | null
          origem: string
          pagamento_status: string
          periodo: unknown
          pet_id: string
          petshop_id: string
          pronto_em: string | null
          recurso_id: string
          status: string
          tutor_id: string
          valor_total: number
        }
        Insert: {
          atualizado_em?: string
          cancelado_em?: string | null
          cancelado_por?: string | null
          checkin_em?: string | null
          checkout_em?: string | null
          criado_em?: string
          criado_por?: string | null
          encaixe?: boolean
          fim: string
          id?: string
          inicio: string
          motivo_cancelamento?: string | null
          observacoes?: string | null
          origem?: string
          pagamento_status?: string
          periodo?: unknown
          pet_id: string
          petshop_id: string
          pronto_em?: string | null
          recurso_id: string
          status?: string
          tutor_id: string
          valor_total?: number
        }
        Update: {
          atualizado_em?: string
          cancelado_em?: string | null
          cancelado_por?: string | null
          checkin_em?: string | null
          checkout_em?: string | null
          criado_em?: string
          criado_por?: string | null
          encaixe?: boolean
          fim?: string
          id?: string
          inicio?: string
          motivo_cancelamento?: string | null
          observacoes?: string | null
          origem?: string
          pagamento_status?: string
          periodo?: unknown
          pet_id?: string
          petshop_id?: string
          pronto_em?: string | null
          recurso_id?: string
          status?: string
          tutor_id?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_pet_id_petshop_id_fkey"
            columns: ["pet_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "pet_petshop"
            referencedColumns: ["pet_id", "petshop_id"]
          },
          {
            foreignKeyName: "agendamentos_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_recurso_id_petshop_id_fkey"
            columns: ["recurso_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "recursos"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "agendamentos_tutor_id_petshop_id_fkey"
            columns: ["tutor_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "tutor_petshop"
            referencedColumns: ["tutor_id", "petshop_id"]
          },
        ]
      }
      bloqueios: {
        Row: {
          criado_em: string
          fim: string
          id: string
          inicio: string
          motivo: string | null
          petshop_id: string
          recurso_id: string | null
          tipo: string
        }
        Insert: {
          criado_em?: string
          fim: string
          id?: string
          inicio: string
          motivo?: string | null
          petshop_id: string
          recurso_id?: string | null
          tipo?: string
        }
        Update: {
          criado_em?: string
          fim?: string
          id?: string
          inicio?: string
          motivo?: string | null
          petshop_id?: string
          recurso_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "bloqueios_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueios_recurso_id_petshop_id_fkey"
            columns: ["recurso_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "recursos"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      bot_config: {
        Row: {
          ativo: boolean
          atualizado_em: string
          canal: string
          conexao_alertado_em: string | null
          conexao_status: string
          conexao_verificada_em: string | null
          instancia: string | null
          limite_msgs_auto_semana: number
          mensagens: Json
          meta_phone_number_id: string | null
          nome_bot: string
          pausa_humana_horas: number
          petshop_id: string
          saudacao: string
          telefone_avisos: string | null
          timeout_conversa_horas: number
          token_secret_id: string | null
          tom: string
          zapi_instance_id: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          canal?: string
          conexao_alertado_em?: string | null
          conexao_status?: string
          conexao_verificada_em?: string | null
          instancia?: string | null
          limite_msgs_auto_semana?: number
          mensagens?: Json
          meta_phone_number_id?: string | null
          nome_bot?: string
          pausa_humana_horas?: number
          petshop_id: string
          saudacao?: string
          telefone_avisos?: string | null
          timeout_conversa_horas?: number
          token_secret_id?: string | null
          tom?: string
          zapi_instance_id?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          canal?: string
          conexao_alertado_em?: string | null
          conexao_status?: string
          conexao_verificada_em?: string | null
          instancia?: string | null
          limite_msgs_auto_semana?: number
          mensagens?: Json
          meta_phone_number_id?: string | null
          nome_bot?: string
          pausa_humana_horas?: number
          petshop_id?: string
          saudacao?: string
          telefone_avisos?: string | null
          timeout_conversa_horas?: number
          token_secret_id?: string | null
          tom?: string
          zapi_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_config_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: true
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_conversas: {
        Row: {
          criado_em: string
          dados_temp: Json
          estado: string
          humano_ate: string | null
          humano_desde: string | null
          humano_por: string | null
          id: string
          petshop_id: string
          telefone: string
          tutor_id: string | null
          ultimo_contato: string
        }
        Insert: {
          criado_em?: string
          dados_temp?: Json
          estado?: string
          humano_ate?: string | null
          humano_desde?: string | null
          humano_por?: string | null
          id?: string
          petshop_id: string
          telefone: string
          tutor_id?: string | null
          ultimo_contato?: string
        }
        Update: {
          criado_em?: string
          dados_temp?: Json
          estado?: string
          humano_ate?: string | null
          humano_desde?: string | null
          humano_por?: string | null
          id?: string
          petshop_id?: string
          telefone?: string
          tutor_id?: string | null
          ultimo_contato?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_conversas_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_conversas_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutores"
            referencedColumns: ["id"]
          },
        ]
      }
      canais_plataforma: {
        Row: {
          ativo: boolean
          atualizado_em: string
          canal: string
          conexao_alertado_em: string | null
          conexao_status: string
          conexao_verificada_em: string | null
          funcao: string
          instancia: string | null
          telefone_wp: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          canal?: string
          conexao_alertado_em?: string | null
          conexao_status?: string
          conexao_verificada_em?: string | null
          funcao: string
          instancia?: string | null
          telefone_wp?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          canal?: string
          conexao_alertado_em?: string | null
          conexao_status?: string
          conexao_verificada_em?: string | null
          funcao?: string
          instancia?: string | null
          telefone_wp?: string | null
        }
        Relationships: []
      }
      central_conversas: {
        Row: {
          atualizado_em: string
          dados: Json
          estado: string
          telefone: string
        }
        Insert: {
          atualizado_em?: string
          dados?: Json
          estado?: string
          telefone: string
        }
        Update: {
          atualizado_em?: string
          dados?: Json
          estado?: string
          telefone?: string
        }
        Relationships: []
      }
      consentimentos: {
        Row: {
          canal: string
          concedido_em: string
          escopo: string
          evidencia: Json
          id: string
          petshop_origem_id: string | null
          revogado_em: string | null
          tutor_id: string
          versao_termo: string
        }
        Insert: {
          canal: string
          concedido_em?: string
          escopo: string
          evidencia?: Json
          id?: string
          petshop_origem_id?: string | null
          revogado_em?: string | null
          tutor_id: string
          versao_termo: string
        }
        Update: {
          canal?: string
          concedido_em?: string
          escopo?: string
          evidencia?: Json
          id?: string
          petshop_origem_id?: string | null
          revogado_em?: string | null
          tutor_id?: string
          versao_termo?: string
        }
        Relationships: [
          {
            foreignKeyName: "consentimentos_petshop_origem_id_fkey"
            columns: ["petshop_origem_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consentimentos_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutores"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar: {
        Row: {
          baixado_por: string | null
          categoria_id: string
          criado_em: string
          criado_por: string | null
          descricao: string
          documento: string | null
          forma_pagamento: string | null
          fornecedor_id: string | null
          grupo_id: string
          id: string
          motivo: string | null
          observacao: string | null
          pago_em: string | null
          parcela: number
          parcelas: number
          petshop_id: string
          recebimento_id: string | null
          status: string
          valor: number
          valor_pago: number | null
          vencimento: string
        }
        Insert: {
          baixado_por?: string | null
          categoria_id: string
          criado_em?: string
          criado_por?: string | null
          descricao: string
          documento?: string | null
          forma_pagamento?: string | null
          fornecedor_id?: string | null
          grupo_id: string
          id?: string
          motivo?: string | null
          observacao?: string | null
          pago_em?: string | null
          parcela?: number
          parcelas?: number
          petshop_id: string
          recebimento_id?: string | null
          status?: string
          valor: number
          valor_pago?: number | null
          vencimento: string
        }
        Update: {
          baixado_por?: string | null
          categoria_id?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string
          documento?: string | null
          forma_pagamento?: string | null
          fornecedor_id?: string | null
          grupo_id?: string
          id?: string
          motivo?: string | null
          observacao?: string | null
          pago_em?: string | null
          parcela?: number
          parcelas?: number
          petshop_id?: string
          recebimento_id?: string | null
          status?: string
          valor?: number
          valor_pago?: number | null
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_categoria_id_petshop_id_fkey"
            columns: ["categoria_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "financeiro_categorias"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "contas_pagar_fornecedor_id_petshop_id_fkey"
            columns: ["fornecedor_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "contas_pagar_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_recebimento_id_petshop_id_fkey"
            columns: ["recebimento_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "recebimentos"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      contas_receber: {
        Row: {
          baixado_por: string | null
          categoria_id: string
          criado_em: string
          criado_por: string | null
          descricao: string
          documento: string | null
          forma_pagamento: string | null
          grupo_id: string
          id: string
          motivo: string | null
          observacao: string | null
          parcela: number
          parcelas: number
          petshop_id: string
          recebido_em: string | null
          status: string
          tutor_id: string | null
          valor: number
          valor_recebido: number | null
          vencimento: string
        }
        Insert: {
          baixado_por?: string | null
          categoria_id: string
          criado_em?: string
          criado_por?: string | null
          descricao: string
          documento?: string | null
          forma_pagamento?: string | null
          grupo_id: string
          id?: string
          motivo?: string | null
          observacao?: string | null
          parcela?: number
          parcelas?: number
          petshop_id: string
          recebido_em?: string | null
          status?: string
          tutor_id?: string | null
          valor: number
          valor_recebido?: number | null
          vencimento: string
        }
        Update: {
          baixado_por?: string | null
          categoria_id?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string
          documento?: string | null
          forma_pagamento?: string | null
          grupo_id?: string
          id?: string
          motivo?: string | null
          observacao?: string | null
          parcela?: number
          parcelas?: number
          petshop_id?: string
          recebido_em?: string | null
          status?: string
          tutor_id?: string | null
          valor?: number
          valor_recebido?: number | null
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_receber_categoria_id_petshop_id_fkey"
            columns: ["categoria_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "financeiro_categorias"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "contas_receber_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_tutor_id_petshop_id_fkey"
            columns: ["tutor_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "tutor_petshop"
            referencedColumns: ["tutor_id", "petshop_id"]
          },
        ]
      }
      custos_mensais: {
        Row: {
          categoria: string
          competencia: string
          descricao: string
          id: string
          petshop_id: string
          valor: number
        }
        Insert: {
          categoria: string
          competencia: string
          descricao?: string
          id?: string
          petshop_id: string
          valor: number
        }
        Update: {
          categoria?: string
          competencia?: string
          descricao?: string
          id?: string
          petshop_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "custos_mensais_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_sequencias: {
        Row: {
          petshop_id: string
          tipo: string
          ultimo: number
        }
        Insert: {
          petshop_id: string
          tipo: string
          ultimo?: number
        }
        Update: {
          petshop_id?: string
          tipo?: string
          ultimo?: number
        }
        Relationships: [
          {
            foreignKeyName: "documento_sequencias_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_locais: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          nome: string
          padrao_entrada: boolean
          padrao_requisicao: boolean
          petshop_id: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome: string
          padrao_entrada?: boolean
          padrao_requisicao?: boolean
          petshop_id: string
          tipo?: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome?: string
          padrao_entrada?: boolean
          padrao_requisicao?: boolean
          petshop_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_locais_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_movimentos: {
        Row: {
          criado_por: string | null
          custo_unitario: number
          id: string
          inventario_id: string | null
          local_id: string
          ocorrido_em: string
          petshop_id: string
          produto_id: string
          quantidade: number
          recebimento_id: string | null
          requisicao_id: string | null
          saldo_apos: number
          tipo: string
          transferencia_id: string | null
        }
        Insert: {
          criado_por?: string | null
          custo_unitario: number
          id?: string
          inventario_id?: string | null
          local_id: string
          ocorrido_em?: string
          petshop_id: string
          produto_id: string
          quantidade: number
          recebimento_id?: string | null
          requisicao_id?: string | null
          saldo_apos: number
          tipo: string
          transferencia_id?: string | null
        }
        Update: {
          criado_por?: string | null
          custo_unitario?: number
          id?: string
          inventario_id?: string | null
          local_id?: string
          ocorrido_em?: string
          petshop_id?: string
          produto_id?: string
          quantidade?: number
          recebimento_id?: string | null
          requisicao_id?: string | null
          saldo_apos?: number
          tipo?: string
          transferencia_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentos_inventario_id_petshop_id_fkey"
            columns: ["inventario_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "inventarios"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "estoque_movimentos_local_id_petshop_id_fkey"
            columns: ["local_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "estoque_locais"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "estoque_movimentos_produto_id_petshop_id_fkey"
            columns: ["produto_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "estoque_movimentos_recebimento_id_petshop_id_fkey"
            columns: ["recebimento_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "recebimentos"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "estoque_movimentos_requisicao_id_petshop_id_fkey"
            columns: ["requisicao_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "requisicoes"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "estoque_movimentos_transferencia_id_petshop_id_fkey"
            columns: ["transferencia_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "transferencias"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      estoque_saldos: {
        Row: {
          atualizado_em: string
          local_id: string
          minimo: number | null
          petshop_id: string
          produto_id: string
          quantidade: number
        }
        Insert: {
          atualizado_em?: string
          local_id: string
          minimo?: number | null
          petshop_id: string
          produto_id: string
          quantidade?: number
        }
        Update: {
          atualizado_em?: string
          local_id?: string
          minimo?: number | null
          petshop_id?: string
          produto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "estoque_saldos_local_id_petshop_id_fkey"
            columns: ["local_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "estoque_locais"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "estoque_saldos_produto_id_petshop_id_fkey"
            columns: ["produto_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      financeiro_categorias: {
        Row: {
          ativo: boolean
          codigo: string | null
          id: string
          nome: string
          petshop_id: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          codigo?: string | null
          id?: string
          nome: string
          petshop_id: string
          tipo: string
        }
        Update: {
          ativo?: boolean
          codigo?: string | null
          id?: string
          nome?: string
          petshop_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_categorias_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_erros: {
        Row: {
          criado_em: string
          execucao_id: string | null
          id: string
          mensagem: string
          no: string | null
          petshop_id: string | null
          url_execucao: string | null
          workflow: string
        }
        Insert: {
          criado_em?: string
          execucao_id?: string | null
          id?: string
          mensagem: string
          no?: string | null
          petshop_id?: string | null
          url_execucao?: string | null
          workflow: string
        }
        Update: {
          criado_em?: string
          execucao_id?: string | null
          id?: string
          mensagem?: string
          no?: string | null
          petshop_id?: string | null
          url_execucao?: string | null
          workflow?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_erros_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          ativo: boolean
          contato: string | null
          criado_em: string
          documento: string | null
          email: string | null
          id: string
          nome: string
          observacao: string | null
          petshop_id: string
          prazo_entrega_dias: number | null
          telefone: string | null
        }
        Insert: {
          ativo?: boolean
          contato?: string | null
          criado_em?: string
          documento?: string | null
          email?: string | null
          id?: string
          nome: string
          observacao?: string | null
          petshop_id: string
          prazo_entrega_dias?: number | null
          telefone?: string | null
        }
        Update: {
          ativo?: boolean
          contato?: string | null
          criado_em?: string
          documento?: string | null
          email?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          petshop_id?: string
          prazo_entrega_dias?: number | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionalidades: {
        Row: {
          codigo: string
          fase: string
          modulo_codigo: string
          nome: string
          vendavel_avulsa: boolean
        }
        Insert: {
          codigo: string
          fase: string
          modulo_codigo: string
          nome: string
          vendavel_avulsa?: boolean
        }
        Update: {
          codigo?: string
          fase?: string
          modulo_codigo?: string
          nome?: string
          vendavel_avulsa?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "funcionalidades_modulo_codigo_fkey"
            columns: ["modulo_codigo"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["codigo"]
          },
        ]
      }
      harpia_contratos: {
        Row: {
          atualizado_em: string
          desconto_motivo: string | null
          desconto_percentual: number
          inicio_cobranca: string | null
          observacoes: string | null
          petshop_id: string
          setup_pago_em: string | null
          setup_tipo: string
          setup_valor: number
        }
        Insert: {
          atualizado_em?: string
          desconto_motivo?: string | null
          desconto_percentual?: number
          inicio_cobranca?: string | null
          observacoes?: string | null
          petshop_id: string
          setup_pago_em?: string | null
          setup_tipo?: string
          setup_valor?: number
        }
        Update: {
          atualizado_em?: string
          desconto_motivo?: string | null
          desconto_percentual?: number
          inicio_cobranca?: string | null
          observacoes?: string | null
          petshop_id?: string
          setup_pago_em?: string | null
          setup_tipo?: string
          setup_valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "harpia_contratos_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: true
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      harpia_equipe: {
        Row: {
          ativo: boolean
          criado_em: string
          nome: string | null
          papel: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          nome?: string | null
          papel: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          nome?: string | null
          papel?: string
          user_id?: string
        }
        Relationships: []
      }
      harpia_servicos_avulsos: {
        Row: {
          contratado_em: string
          id: string
          observacoes: string | null
          petshop_id: string
          quantidade: number
          servico: string
          valor_total: number
        }
        Insert: {
          contratado_em?: string
          id?: string
          observacoes?: string | null
          petshop_id: string
          quantidade?: number
          servico: string
          valor_total: number
        }
        Update: {
          contratado_em?: string
          id?: string
          observacoes?: string | null
          petshop_id?: string
          quantidade?: number
          servico?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "harpia_servicos_avulsos_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      horarios_funcionamento: {
        Row: {
          abre: string
          dia_semana: number
          fecha: string
          id: string
          petshop_id: string
        }
        Insert: {
          abre: string
          dia_semana: number
          fecha: string
          id?: string
          petshop_id: string
        }
        Update: {
          abre?: string
          dia_semana?: number
          fecha?: string
          id?: string
          petshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "horarios_funcionamento_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_itens: {
        Row: {
          ajuste: number | null
          contado_em: string | null
          contado_por: string | null
          id: string
          inventario_id: string
          petshop_id: string
          produto_id: string
          qtd_contada: number | null
          saldo_sistema: number | null
        }
        Insert: {
          ajuste?: number | null
          contado_em?: string | null
          contado_por?: string | null
          id?: string
          inventario_id: string
          petshop_id: string
          produto_id: string
          qtd_contada?: number | null
          saldo_sistema?: number | null
        }
        Update: {
          ajuste?: number | null
          contado_em?: string | null
          contado_por?: string | null
          id?: string
          inventario_id?: string
          petshop_id?: string
          produto_id?: string
          qtd_contada?: number | null
          saldo_sistema?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_itens_inventario_id_petshop_id_fkey"
            columns: ["inventario_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "inventarios"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "inventario_itens_produto_id_petshop_id_fkey"
            columns: ["produto_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      inventarios: {
        Row: {
          aberto_em: string
          aberto_por: string | null
          fechado_em: string | null
          fechado_por: string | null
          id: string
          local_id: string
          numero: number
          observacao: string | null
          petshop_id: string
          status: string
        }
        Insert: {
          aberto_em?: string
          aberto_por?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          local_id: string
          numero: number
          observacao?: string | null
          petshop_id: string
          status?: string
        }
        Update: {
          aberto_em?: string
          aberto_por?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          local_id?: string
          numero?: number
          observacao?: string | null
          petshop_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventarios_local_id_petshop_id_fkey"
            columns: ["local_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "estoque_locais"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "inventarios_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      lembretes: {
        Row: {
          agendamento_id: string
          enviado_em: string
          id: string
          petshop_id: string
          respondido_em: string | null
          resposta: string | null
          tipo: string
        }
        Insert: {
          agendamento_id: string
          enviado_em?: string
          id?: string
          petshop_id: string
          respondido_em?: string | null
          resposta?: string | null
          tipo?: string
        }
        Update: {
          agendamento_id?: string
          enviado_em?: string
          id?: string
          petshop_id?: string
          respondido_em?: string | null
          resposta?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "lembretes_agendamento_id_petshop_id_fkey"
            columns: ["agendamento_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      mensagens_log: {
        Row: {
          agendamento_id: string | null
          canal: string | null
          categoria_cobranca: string | null
          criado_em: string
          direcao: string
          erro: string | null
          id: string
          id_externo: string | null
          petshop_id: string
          status: string
          telefone: string
          tipo: string
        }
        Insert: {
          agendamento_id?: string | null
          canal?: string | null
          categoria_cobranca?: string | null
          criado_em?: string
          direcao: string
          erro?: string | null
          id?: string
          id_externo?: string | null
          petshop_id: string
          status?: string
          telefone: string
          tipo: string
        }
        Update: {
          agendamento_id?: string | null
          canal?: string | null
          categoria_cobranca?: string | null
          criado_em?: string
          direcao?: string
          erro?: string | null
          id?: string
          id_externo?: string | null
          petshop_id?: string
          status?: string
          telefone?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_log_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_log_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      modulos: {
        Row: {
          codigo: string
          fase: string
          nome: string
        }
        Insert: {
          codigo: string
          fase: string
          nome: string
        }
        Update: {
          codigo?: string
          fase?: string
          nome?: string
        }
        Relationships: []
      }
      pagamentos: {
        Row: {
          agendamento_id: string
          forma: string
          id: string
          petshop_id: string
          recebido_em: string
          registrado_por: string | null
          taxa_percentual: number | null
          valor: number
        }
        Insert: {
          agendamento_id: string
          forma: string
          id?: string
          petshop_id: string
          recebido_em?: string
          registrado_por?: string | null
          taxa_percentual?: number | null
          valor: number
        }
        Update: {
          agendamento_id?: string
          forma?: string
          id?: string
          petshop_id?: string
          recebido_em?: string
          registrado_por?: string | null
          taxa_percentual?: number | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_agendamento_id_petshop_id_fkey"
            columns: ["agendamento_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      pedido_compra_itens: {
        Row: {
          custo_previsto: number
          fator: number
          id: string
          pedido_id: string
          petshop_id: string
          produto_id: string
          produto_unidade_id: string
          qtd_pedida: number
          qtd_recebida: number
          unidade_rotulo: string
        }
        Insert: {
          custo_previsto?: number
          fator: number
          id?: string
          pedido_id: string
          petshop_id: string
          produto_id: string
          produto_unidade_id: string
          qtd_pedida: number
          qtd_recebida?: number
          unidade_rotulo: string
        }
        Update: {
          custo_previsto?: number
          fator?: number
          id?: string
          pedido_id?: string
          petshop_id?: string
          produto_id?: string
          produto_unidade_id?: string
          qtd_pedida?: number
          qtd_recebida?: number
          unidade_rotulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_compra_itens_pedido_id_petshop_id_fkey"
            columns: ["pedido_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "pedido_compra_itens_produto_id_petshop_id_fkey"
            columns: ["produto_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "pedido_compra_itens_produto_unidade_id_petshop_id_fkey"
            columns: ["produto_unidade_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "produto_unidades"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      pedidos_compra: {
        Row: {
          criado_em: string
          criado_por: string | null
          data_prevista: string | null
          enviado_em: string | null
          finalizado_em: string | null
          fornecedor_id: string
          id: string
          motivo: string | null
          numero: number
          observacao: string | null
          petshop_id: string
          status: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          data_prevista?: string | null
          enviado_em?: string | null
          finalizado_em?: string | null
          fornecedor_id: string
          id?: string
          motivo?: string | null
          numero: number
          observacao?: string | null
          petshop_id: string
          status?: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          data_prevista?: string | null
          enviado_em?: string | null
          finalizado_em?: string | null
          fornecedor_id?: string
          id?: string
          motivo?: string | null
          numero?: number
          observacao?: string | null
          petshop_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_compra_fornecedor_id_petshop_id_fkey"
            columns: ["fornecedor_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "pedidos_compra_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_eventos: {
        Row: {
          agendamento_id: string | null
          categoria: string | null
          criado_em: string
          criado_por: string | null
          dados: Json
          id: string
          ocorrido_em: string
          pet_id: string
          petshop_id: string
          tipo: string
          titulo: string
          visibilidade: string
        }
        Insert: {
          agendamento_id?: string | null
          categoria?: string | null
          criado_em?: string
          criado_por?: string | null
          dados?: Json
          id?: string
          ocorrido_em?: string
          pet_id: string
          petshop_id: string
          tipo: string
          titulo: string
          visibilidade?: string
        }
        Update: {
          agendamento_id?: string | null
          categoria?: string | null
          criado_em?: string
          criado_por?: string | null
          dados?: Json
          id?: string
          ocorrido_em?: string
          pet_id?: string
          petshop_id?: string
          tipo?: string
          titulo?: string
          visibilidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_eventos_agendamento_fk"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_eventos_pet_id_petshop_id_fkey"
            columns: ["pet_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "pet_petshop"
            referencedColumns: ["pet_id", "petshop_id"]
          },
        ]
      }
      pet_petshop: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          observacoes: string | null
          origem: string
          pet_id: string
          petshop_id: string
          preferencias: string | null
          temperamento: string | null
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          observacoes?: string | null
          origem?: string
          pet_id: string
          petshop_id: string
          preferencias?: string | null
          temperamento?: string | null
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          observacoes?: string | null
          origem?: string
          pet_id?: string
          petshop_id?: string
          preferencias?: string | null
          temperamento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_petshop_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_petshop_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      pets: {
        Row: {
          alergias: string | null
          atualizado_em: string
          condicoes: string | null
          criado_em: string
          criado_por_petshop_id: string | null
          especie: string
          ficha_alterada_em: string | null
          ficha_alterada_origem: string | null
          ficha_alterada_por: string | null
          ficha_nivel: string
          foto_url: string | null
          id: string
          nascimento: string | null
          nome: string
          pelagem: string | null
          peso_kg: number | null
          porte: string | null
          raca: string | null
          sexo: string | null
          tutor_id: string
        }
        Insert: {
          alergias?: string | null
          atualizado_em?: string
          condicoes?: string | null
          criado_em?: string
          criado_por_petshop_id?: string | null
          especie?: string
          ficha_alterada_em?: string | null
          ficha_alterada_origem?: string | null
          ficha_alterada_por?: string | null
          ficha_nivel?: string
          foto_url?: string | null
          id?: string
          nascimento?: string | null
          nome: string
          pelagem?: string | null
          peso_kg?: number | null
          porte?: string | null
          raca?: string | null
          sexo?: string | null
          tutor_id: string
        }
        Update: {
          alergias?: string | null
          atualizado_em?: string
          condicoes?: string | null
          criado_em?: string
          criado_por_petshop_id?: string | null
          especie?: string
          ficha_alterada_em?: string | null
          ficha_alterada_origem?: string | null
          ficha_alterada_por?: string | null
          ficha_nivel?: string
          foto_url?: string | null
          id?: string
          nascimento?: string | null
          nome?: string
          pelagem?: string | null
          peso_kg?: number | null
          porte?: string | null
          raca?: string | null
          sexo?: string | null
          tutor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pets_criado_por_petshop_id_fkey"
            columns: ["criado_por_petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pets_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutores"
            referencedColumns: ["id"]
          },
        ]
      }
      petshop_custos_config: {
        Row: {
          aliquota_imposto: number
          atualizado_em: string
          peso_g: number
          peso_gg: number
          peso_m: number
          peso_p: number
          petshop_id: string
          rateio_utilidades: string
        }
        Insert: {
          aliquota_imposto?: number
          atualizado_em?: string
          peso_g?: number
          peso_gg?: number
          peso_m?: number
          peso_p?: number
          petshop_id: string
          rateio_utilidades?: string
        }
        Update: {
          aliquota_imposto?: number
          atualizado_em?: string
          peso_g?: number
          peso_gg?: number
          peso_m?: number
          peso_p?: number
          petshop_id?: string
          rateio_utilidades?: string
        }
        Relationships: [
          {
            foreignKeyName: "petshop_custos_config_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: true
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      petshop_funcionalidades: {
        Row: {
          ate: string | null
          ativo: boolean
          desde: string
          funcionalidade_codigo: string
          origem: string
          petshop_id: string
          valor_mensal: number | null
        }
        Insert: {
          ate?: string | null
          ativo?: boolean
          desde?: string
          funcionalidade_codigo: string
          origem: string
          petshop_id: string
          valor_mensal?: number | null
        }
        Update: {
          ate?: string | null
          ativo?: boolean
          desde?: string
          funcionalidade_codigo?: string
          origem?: string
          petshop_id?: string
          valor_mensal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "petshop_funcionalidades_funcionalidade_codigo_fkey"
            columns: ["funcionalidade_codigo"]
            isOneToOne: false
            referencedRelation: "funcionalidades"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "petshop_funcionalidades_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      petshop_membros: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          nome: string | null
          papeis_adicionais: string[]
          papel: string
          petshop_id: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome?: string | null
          papeis_adicionais?: string[]
          papel: string
          petshop_id: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          nome?: string | null
          papeis_adicionais?: string[]
          papel?: string
          petshop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "petshop_membros_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      petshops: {
        Row: {
          antecedencia_max_dias: number
          antecedencia_min_minutos: number
          ativo: boolean
          atualizado_em: string
          cancelamento_min_horas: number
          criado_em: string
          endereco: string | null
          fuso: string
          id: string
          intervalo_slot_min: number
          logo_url: string | null
          modo_capacidade: string
          nome: string
          plano_codigo: string
          slug: string | null
          telefone_contato: string | null
          telefone_wp: string | null
        }
        Insert: {
          antecedencia_max_dias?: number
          antecedencia_min_minutos?: number
          ativo?: boolean
          atualizado_em?: string
          cancelamento_min_horas?: number
          criado_em?: string
          endereco?: string | null
          fuso?: string
          id?: string
          intervalo_slot_min?: number
          logo_url?: string | null
          modo_capacidade?: string
          nome: string
          plano_codigo?: string
          slug?: string | null
          telefone_contato?: string | null
          telefone_wp?: string | null
        }
        Update: {
          antecedencia_max_dias?: number
          antecedencia_min_minutos?: number
          ativo?: boolean
          atualizado_em?: string
          cancelamento_min_horas?: number
          criado_em?: string
          endereco?: string | null
          fuso?: string
          id?: string
          intervalo_slot_min?: number
          logo_url?: string | null
          modo_capacidade?: string
          nome?: string
          plano_codigo?: string
          slug?: string | null
          telefone_contato?: string | null
          telefone_wp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "petshops_plano_codigo_fkey"
            columns: ["plano_codigo"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["codigo"]
          },
        ]
      }
      plano_funcionalidades: {
        Row: {
          funcionalidade_codigo: string
          plano_codigo: string
        }
        Insert: {
          funcionalidade_codigo: string
          plano_codigo: string
        }
        Update: {
          funcionalidade_codigo?: string
          plano_codigo?: string
        }
        Relationships: [
          {
            foreignKeyName: "plano_funcionalidades_funcionalidade_codigo_fkey"
            columns: ["funcionalidade_codigo"]
            isOneToOne: false
            referencedRelation: "funcionalidades"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "plano_funcionalidades_plano_codigo_fkey"
            columns: ["plano_codigo"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["codigo"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean
          codigo: string
          limite_agendamentos_mes: number | null
          limite_profissionais: number | null
          nome: string
          ordem: number
          plaquinhas_incluidas: number
          preco_mensal: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          limite_agendamentos_mes?: number | null
          limite_profissionais?: number | null
          nome: string
          ordem?: number
          plaquinhas_incluidas?: number
          preco_mensal: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          limite_agendamentos_mes?: number | null
          limite_profissionais?: number | null
          nome?: string
          ordem?: number
          plaquinhas_incluidas?: number
          preco_mensal?: number
        }
        Relationships: []
      }
      plaquinhas: {
        Row: {
          codigo: string
          criado_em: string
          entregue_em: string | null
          id: string
          kit: string
          leituras: number
          material: string | null
          pet_id: string | null
          petshop_id: string | null
          qr_ativo: boolean | null
          status: string
          status_alterado_em: string | null
          status_motivo: string | null
          status_origem: string | null
          status_por: string | null
          ultima_leitura_em: string | null
          valor: number | null
        }
        Insert: {
          codigo?: string
          criado_em?: string
          entregue_em?: string | null
          id?: string
          kit: string
          leituras?: number
          material?: string | null
          pet_id?: string | null
          petshop_id?: string | null
          qr_ativo?: boolean | null
          status?: string
          status_alterado_em?: string | null
          status_motivo?: string | null
          status_origem?: string | null
          status_por?: string | null
          ultima_leitura_em?: string | null
          valor?: number | null
        }
        Update: {
          codigo?: string
          criado_em?: string
          entregue_em?: string | null
          id?: string
          kit?: string
          leituras?: number
          material?: string | null
          pet_id?: string | null
          petshop_id?: string | null
          qr_ativo?: boolean | null
          status?: string
          status_alterado_em?: string | null
          status_motivo?: string | null
          status_origem?: string | null
          status_por?: string | null
          ultima_leitura_em?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plaquinhas_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaquinhas_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_custos: {
        Row: {
          atualizado_em: string
          custo_medio: number
          petshop_id: string
          produto_id: string
        }
        Insert: {
          atualizado_em?: string
          custo_medio?: number
          petshop_id: string
          produto_id: string
        }
        Update: {
          atualizado_em?: string
          custo_medio?: number
          petshop_id?: string
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_custos_produto_id_petshop_id_fkey"
            columns: ["produto_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      produto_unidades: {
        Row: {
          ativo: boolean
          eh_base: boolean
          fator: number
          id: string
          petshop_id: string
          produto_id: string
          rotulo: string
          usa_compra: boolean
          usa_requisicao: boolean
        }
        Insert: {
          ativo?: boolean
          eh_base?: boolean
          fator: number
          id?: string
          petshop_id: string
          produto_id: string
          rotulo: string
          usa_compra?: boolean
          usa_requisicao?: boolean
        }
        Update: {
          ativo?: boolean
          eh_base?: boolean
          fator?: number
          id?: string
          petshop_id?: string
          produto_id?: string
          rotulo?: string
          usa_compra?: boolean
          usa_requisicao?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "produto_unidades_produto_id_petshop_id_fkey"
            columns: ["produto_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          categoria: string | null
          codigo: string | null
          criado_em: string
          ean: string | null
          fornecedor_padrao_id: string | null
          id: string
          marca: string | null
          nome: string
          petshop_id: string
          preco_venda: number | null
          unidade_base: string
          usa_como_insumo: boolean
          usa_como_venda: boolean
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string | null
          codigo?: string | null
          criado_em?: string
          ean?: string | null
          fornecedor_padrao_id?: string | null
          id?: string
          marca?: string | null
          nome: string
          petshop_id: string
          preco_venda?: number | null
          unidade_base: string
          usa_como_insumo?: boolean
          usa_como_venda?: boolean
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string | null
          codigo?: string | null
          criado_em?: string
          ean?: string | null
          fornecedor_padrao_id?: string | null
          id?: string
          marca?: string | null
          nome?: string
          petshop_id?: string
          preco_venda?: number | null
          unidade_base?: string
          usa_como_insumo?: boolean
          usa_como_venda?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "produtos_fornecedor_padrao_id_petshop_id_fkey"
            columns: ["fornecedor_padrao_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "produtos_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      recebimento_itens: {
        Row: {
          custo_unitario: number
          fator: number
          id: string
          pedido_item_id: string | null
          petshop_id: string
          produto_id: string
          produto_unidade_id: string
          quantidade: number
          recebimento_id: string
          unidade_rotulo: string
          valor_total: number
        }
        Insert: {
          custo_unitario: number
          fator: number
          id?: string
          pedido_item_id?: string | null
          petshop_id: string
          produto_id: string
          produto_unidade_id: string
          quantidade: number
          recebimento_id: string
          unidade_rotulo: string
          valor_total: number
        }
        Update: {
          custo_unitario?: number
          fator?: number
          id?: string
          pedido_item_id?: string | null
          petshop_id?: string
          produto_id?: string
          produto_unidade_id?: string
          quantidade?: number
          recebimento_id?: string
          unidade_rotulo?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "recebimento_itens_pedido_item_id_petshop_id_fkey"
            columns: ["pedido_item_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "pedido_compra_itens"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "recebimento_itens_produto_id_petshop_id_fkey"
            columns: ["produto_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "recebimento_itens_produto_unidade_id_petshop_id_fkey"
            columns: ["produto_unidade_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "produto_unidades"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "recebimento_itens_recebimento_id_petshop_id_fkey"
            columns: ["recebimento_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "recebimentos"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      recebimentos: {
        Row: {
          fornecedor_id: string | null
          id: string
          local_id: string
          nf_numero: string | null
          numero: number
          observacao: string | null
          pedido_id: string | null
          petshop_id: string
          recebido_em: string
          recebido_por: string | null
          valor_total: number
        }
        Insert: {
          fornecedor_id?: string | null
          id?: string
          local_id: string
          nf_numero?: string | null
          numero: number
          observacao?: string | null
          pedido_id?: string | null
          petshop_id: string
          recebido_em?: string
          recebido_por?: string | null
          valor_total?: number
        }
        Update: {
          fornecedor_id?: string | null
          id?: string
          local_id?: string
          nf_numero?: string | null
          numero?: number
          observacao?: string | null
          pedido_id?: string | null
          petshop_id?: string
          recebido_em?: string
          recebido_por?: string | null
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "recebimentos_fornecedor_id_petshop_id_fkey"
            columns: ["fornecedor_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "recebimentos_local_id_petshop_id_fkey"
            columns: ["local_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "estoque_locais"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "recebimentos_pedido_id_petshop_id_fkey"
            columns: ["pedido_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "recebimentos_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      recurso_custos: {
        Row: {
          comissao_tipo: string
          comissao_valor: number
          encargos_percentual: number
          executado_pelo_dono: boolean
          horas_mes: number
          petshop_id: string
          pro_labore_hora: number | null
          recurso_id: string
          salario_mensal: number
        }
        Insert: {
          comissao_tipo?: string
          comissao_valor?: number
          encargos_percentual?: number
          executado_pelo_dono?: boolean
          horas_mes?: number
          petshop_id: string
          pro_labore_hora?: number | null
          recurso_id: string
          salario_mensal?: number
        }
        Update: {
          comissao_tipo?: string
          comissao_valor?: number
          encargos_percentual?: number
          executado_pelo_dono?: boolean
          horas_mes?: number
          petshop_id?: string
          pro_labore_hora?: number | null
          recurso_id?: string
          salario_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: "recurso_custos_recurso_id_petshop_id_fkey"
            columns: ["recurso_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "recursos"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      recurso_horarios: {
        Row: {
          dia_semana: number
          fim: string
          id: string
          inicio: string
          petshop_id: string
          recurso_id: string
        }
        Insert: {
          dia_semana: number
          fim: string
          id?: string
          inicio: string
          petshop_id: string
          recurso_id: string
        }
        Update: {
          dia_semana?: number
          fim?: string
          id?: string
          inicio?: string
          petshop_id?: string
          recurso_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurso_horarios_recurso_id_petshop_id_fkey"
            columns: ["recurso_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "recursos"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      recurso_servicos: {
        Row: {
          petshop_id: string
          recurso_id: string
          servico_id: string
        }
        Insert: {
          petshop_id: string
          recurso_id: string
          servico_id: string
        }
        Update: {
          petshop_id?: string
          recurso_id?: string
          servico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurso_servicos_recurso_id_petshop_id_fkey"
            columns: ["recurso_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "recursos"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "recurso_servicos_servico_id_petshop_id_fkey"
            columns: ["servico_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      recursos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          capacidade: number
          cor: string | null
          criado_em: string
          id: string
          intervalo_entrada_min: number
          nome: string
          ordem: number
          petshop_id: string
          tipo: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          capacidade?: number
          cor?: string | null
          criado_em?: string
          id?: string
          intervalo_entrada_min?: number
          nome: string
          ordem?: number
          petshop_id: string
          tipo?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          capacidade?: number
          cor?: string | null
          criado_em?: string
          id?: string
          intervalo_entrada_min?: number
          nome?: string
          ordem?: number
          petshop_id?: string
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recursos_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      requisicao_itens: {
        Row: {
          fator: number
          id: string
          item_origem_id: string | null
          petshop_id: string
          produto_id: string
          produto_unidade_id: string
          qtd_atendida: number | null
          qtd_solicitada: number
          requisicao_id: string
          unidade_rotulo: string
        }
        Insert: {
          fator: number
          id?: string
          item_origem_id?: string | null
          petshop_id: string
          produto_id: string
          produto_unidade_id: string
          qtd_atendida?: number | null
          qtd_solicitada: number
          requisicao_id: string
          unidade_rotulo: string
        }
        Update: {
          fator?: number
          id?: string
          item_origem_id?: string | null
          petshop_id?: string
          produto_id?: string
          produto_unidade_id?: string
          qtd_atendida?: number | null
          qtd_solicitada?: number
          requisicao_id?: string
          unidade_rotulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisicao_itens_item_origem_id_petshop_id_fkey"
            columns: ["item_origem_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "requisicao_itens"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "requisicao_itens_produto_id_petshop_id_fkey"
            columns: ["produto_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "requisicao_itens_produto_unidade_id_petshop_id_fkey"
            columns: ["produto_unidade_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "produto_unidades"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "requisicao_itens_requisicao_id_petshop_id_fkey"
            columns: ["requisicao_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "requisicoes"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      requisicoes: {
        Row: {
          concluida_em: string | null
          concluido_por: string | null
          decidida_em: string | null
          decidido_por: string | null
          id: string
          local_id: string
          motivo: string | null
          numero: number
          observacao: string | null
          petshop_id: string
          recurso_id: string | null
          requisicao_origem_id: string | null
          solicitada_em: string
          solicitado_por: string | null
          status: string
          tipo: string
        }
        Insert: {
          concluida_em?: string | null
          concluido_por?: string | null
          decidida_em?: string | null
          decidido_por?: string | null
          id?: string
          local_id: string
          motivo?: string | null
          numero: number
          observacao?: string | null
          petshop_id: string
          recurso_id?: string | null
          requisicao_origem_id?: string | null
          solicitada_em?: string
          solicitado_por?: string | null
          status: string
          tipo: string
        }
        Update: {
          concluida_em?: string | null
          concluido_por?: string | null
          decidida_em?: string | null
          decidido_por?: string | null
          id?: string
          local_id?: string
          motivo?: string | null
          numero?: number
          observacao?: string | null
          petshop_id?: string
          recurso_id?: string | null
          requisicao_origem_id?: string | null
          solicitada_em?: string
          solicitado_por?: string | null
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisicoes_local_id_petshop_id_fkey"
            columns: ["local_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "estoque_locais"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "requisicoes_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisicoes_recurso_id_petshop_id_fkey"
            columns: ["recurso_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "recursos"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "requisicoes_requisicao_origem_id_petshop_id_fkey"
            columns: ["requisicao_origem_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "requisicoes"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      servico_precos: {
        Row: {
          duracao_min: number
          petshop_id: string
          porte: string
          preco: number
          servico_id: string
        }
        Insert: {
          duracao_min: number
          petshop_id: string
          porte: string
          preco: number
          servico_id: string
        }
        Update: {
          duracao_min?: number
          petshop_id?: string
          porte?: string
          preco?: number
          servico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "servico_precos_servico_id_petshop_id_fkey"
            columns: ["servico_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      servicos: {
        Row: {
          adicional: boolean
          ativo: boolean
          atualizado_em: string
          criado_em: string
          descricao: string | null
          disponivel_bot: boolean
          id: string
          nome: string
          ordem: number
          petshop_id: string
          recurso_tipo: string
          tipo: string
        }
        Insert: {
          adicional?: boolean
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          disponivel_bot?: boolean
          id?: string
          nome: string
          ordem?: number
          petshop_id: string
          recurso_tipo?: string
          tipo?: string
        }
        Update: {
          adicional?: boolean
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          disponivel_bot?: boolean
          id?: string
          nome?: string
          ordem?: number
          petshop_id?: string
          recurso_tipo?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicos_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      taxas_pagamento: {
        Row: {
          forma: string
          percentual: number
          petshop_id: string
          valor_fixo: number
        }
        Insert: {
          forma: string
          percentual?: number
          petshop_id: string
          valor_fixo?: number
        }
        Update: {
          forma?: string
          percentual?: number
          petshop_id?: string
          valor_fixo?: number
        }
        Relationships: [
          {
            foreignKeyName: "taxas_pagamento_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      termos_consentimento: {
        Row: {
          canal: string
          criado_em: string
          escopo: string
          texto: string
          versao: string
          vigente: boolean
        }
        Insert: {
          canal?: string
          criado_em?: string
          escopo: string
          texto: string
          versao: string
          vigente?: boolean
        }
        Update: {
          canal?: string
          criado_em?: string
          escopo?: string
          texto?: string
          versao?: string
          vigente?: boolean
        }
        Relationships: []
      }
      transferencia_itens: {
        Row: {
          fator: number
          id: string
          petshop_id: string
          produto_id: string
          produto_unidade_id: string
          qtd_movida: number | null
          qtd_solicitada: number
          transferencia_id: string
          unidade_rotulo: string
        }
        Insert: {
          fator: number
          id?: string
          petshop_id: string
          produto_id: string
          produto_unidade_id: string
          qtd_movida?: number | null
          qtd_solicitada: number
          transferencia_id: string
          unidade_rotulo: string
        }
        Update: {
          fator?: number
          id?: string
          petshop_id?: string
          produto_id?: string
          produto_unidade_id?: string
          qtd_movida?: number | null
          qtd_solicitada?: number
          transferencia_id?: string
          unidade_rotulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencia_itens_produto_id_petshop_id_fkey"
            columns: ["produto_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "transferencia_itens_produto_unidade_id_petshop_id_fkey"
            columns: ["produto_unidade_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "produto_unidades"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "transferencia_itens_transferencia_id_petshop_id_fkey"
            columns: ["transferencia_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "transferencias"
            referencedColumns: ["id", "petshop_id"]
          },
        ]
      }
      transferencias: {
        Row: {
          concluida_em: string | null
          concluido_por: string | null
          decidida_em: string | null
          decidido_por: string | null
          destino_id: string
          id: string
          motivo: string | null
          numero: number
          observacao: string | null
          origem_id: string
          petshop_id: string
          solicitada_em: string
          solicitado_por: string | null
          status: string
        }
        Insert: {
          concluida_em?: string | null
          concluido_por?: string | null
          decidida_em?: string | null
          decidido_por?: string | null
          destino_id: string
          id?: string
          motivo?: string | null
          numero: number
          observacao?: string | null
          origem_id: string
          petshop_id: string
          solicitada_em?: string
          solicitado_por?: string | null
          status: string
        }
        Update: {
          concluida_em?: string | null
          concluido_por?: string | null
          decidida_em?: string | null
          decidido_por?: string | null
          destino_id?: string
          id?: string
          motivo?: string | null
          numero?: number
          observacao?: string | null
          origem_id?: string
          petshop_id?: string
          solicitada_em?: string
          solicitado_por?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_destino_id_petshop_id_fkey"
            columns: ["destino_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "estoque_locais"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "transferencias_origem_id_petshop_id_fkey"
            columns: ["origem_id", "petshop_id"]
            isOneToOne: false
            referencedRelation: "estoque_locais"
            referencedColumns: ["id", "petshop_id"]
          },
          {
            foreignKeyName: "transferencias_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
        ]
      }
      tutor_petshop: {
        Row: {
          aceita_mensagens: boolean
          ativo: boolean
          atualizado_em: string
          consentimento_perguntado_em: string | null
          criado_em: string
          email: string | null
          endereco: string | null
          id: string
          mensagens_alterado_em: string | null
          mensagens_alterado_origem: string | null
          mensagens_alterado_por: string | null
          nome: string
          observacoes: string | null
          opt_out_em: string | null
          origem: string
          petshop_id: string
          tutor_id: string
        }
        Insert: {
          aceita_mensagens?: boolean
          ativo?: boolean
          atualizado_em?: string
          consentimento_perguntado_em?: string | null
          criado_em?: string
          email?: string | null
          endereco?: string | null
          id?: string
          mensagens_alterado_em?: string | null
          mensagens_alterado_origem?: string | null
          mensagens_alterado_por?: string | null
          nome: string
          observacoes?: string | null
          opt_out_em?: string | null
          origem?: string
          petshop_id: string
          tutor_id: string
        }
        Update: {
          aceita_mensagens?: boolean
          ativo?: boolean
          atualizado_em?: string
          consentimento_perguntado_em?: string | null
          criado_em?: string
          email?: string | null
          endereco?: string | null
          id?: string
          mensagens_alterado_em?: string | null
          mensagens_alterado_origem?: string | null
          mensagens_alterado_por?: string | null
          nome?: string
          observacoes?: string | null
          opt_out_em?: string | null
          origem?: string
          petshop_id?: string
          tutor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutor_petshop_petshop_id_fkey"
            columns: ["petshop_id"]
            isOneToOne: false
            referencedRelation: "petshops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_petshop_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutores"
            referencedColumns: ["id"]
          },
        ]
      }
      tutores: {
        Row: {
          criado_em: string
          id: string
          telefone: string
        }
        Insert: {
          criado_em?: string
          id?: string
          telefone: string
        }
        Update: {
          criado_em?: string
          id?: string
          telefone?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_gerar_plaquinha: {
        Args: {
          p_kit: string
          p_material?: string
          p_pet: string
          p_petshop: string
          p_valor?: number
        }
        Returns: string
      }
      admin_lote_plaquinhas: {
        Args: { p_desde?: string }
        Returns: {
          codigo: string
          criado_em: string
          kit: string
          material: string
          pet: string
          petshop: string
        }[]
      }
      admin_vincular_membro: {
        Args: {
          p_email: string
          p_nome?: string
          p_papel?: string
          p_petshop: string
        }
        Returns: string
      }
      administracao_preparar: {
        Args: { p_petshop: string }
        Returns: undefined
      }
      bot_aberto_agora: { Args: { p_petshop: string }; Returns: Json }
      bot_achado_registrar: {
        Args: {
          p_codigo: string
          p_evidencia?: Json
          p_mensagem?: string
          p_telefone: string
        }
        Returns: Json
      }
      bot_agendamentos_em_bloqueio: {
        Args: { p_petshop?: string }
        Returns: {
          itens: Json
          petshop_id: string
          telefone_avisos: string
        }[]
      }
      bot_agendamentos_tutor: {
        Args: { p_petshop: string; p_tutor: string }
        Returns: Json
      }
      bot_cadastrar_tutor: {
        Args: { p_nome: string; p_petshop: string; p_telefone: string }
        Returns: string
      }
      bot_canal_plataforma: {
        Args: { p_canal: string; p_instancia: string }
        Returns: Json
      }
      bot_cancelar: {
        Args: { p_agendamento: string; p_petshop: string; p_tutor: string }
        Returns: boolean
      }
      bot_central_entrada: { Args: { p_telefone: string }; Returns: Json }
      bot_central_salvar: {
        Args: { p_dados?: Json; p_estado: string; p_telefone: string }
        Returns: undefined
      }
      bot_conexao_evento: {
        Args: { p_conectado: boolean; p_detalhe?: string; p_instance: string }
        Returns: Json
      }
      bot_consentimento_pendente: {
        Args: { p_petshop: string; p_tutor: string }
        Returns: Json
      }
      bot_definir_mensagens: {
        Args: { p_aceita: boolean; p_petshop: string; p_telefone: string }
        Returns: boolean
      }
      bot_devolver: { Args: { p_conversa: string }; Returns: undefined }
      bot_entrada: {
        Args: { p_petshop: string; p_telefone: string }
        Returns: Json
      }
      bot_envio: { Args: { p_petshop: string }; Returns: Json }
      bot_envio_plataforma: { Args: { p_funcao?: string }; Returns: Json }
      bot_ficha_consultar: {
        Args: { p_codigo: string; p_telefone: string }
        Returns: Json
      }
      bot_ficha_definir: {
        Args: {
          p_codigo: string
          p_escolha: string
          p_evidencia?: Json
          p_telefone: string
          p_versao: string
        }
        Returns: string
      }
      bot_instancias_monitoradas: {
        Args: never
        Returns: {
          ativo: boolean
          canal: string
          instancia: string
          petshop: string
          petshop_id: string
        }[]
      }
      bot_lembrete_desmarcar: {
        Args: { p_agendamento: string }
        Returns: undefined
      }
      bot_lembrete_marcar: { Args: { p_agendamento: string }; Returns: boolean }
      bot_nome_compartilhado: { Args: { p_tutor: string }; Returns: string }
      bot_pausar_por_humano: {
        Args: { p_petshop: string; p_telefone: string }
        Returns: undefined
      }
      bot_petshop_info: { Args: { p_petshop: string }; Returns: Json }
      bot_petshop_por_canal: {
        Args: { p_canal: string; p_instancia: string }
        Returns: string
      }
      bot_petshop_por_instancia: {
        Args: { p_meta_phone_id?: string; p_zapi_instance?: string }
        Returns: string
      }
      bot_petshop_teste: { Args: { p_slug: string }; Returns: string }
      bot_registrar_consentimento: {
        Args: {
          p_aceite: boolean
          p_evidencia?: Json
          p_petshop: string
          p_tutor: string
          p_versao: string
        }
        Returns: string
      }
      bot_registrar_erro: {
        Args: {
          p_execucao?: string
          p_mensagem: string
          p_no: string
          p_petshop?: string
          p_url?: string
          p_workflow: string
        }
        Returns: Json
      }
      bot_registrar_fromme: {
        Args: {
          p_from_api?: boolean
          p_message_id: string
          p_petshop: string
          p_telefone: string
        }
        Returns: string
      }
      bot_registrar_mensagem: {
        Args: {
          p_agendamento?: string
          p_direcao: string
          p_erro?: string
          p_id_externo?: string
          p_petshop: string
          p_status?: string
          p_telefone: string
          p_tipo: string
        }
        Returns: string
      }
      bot_responder_lembrete: {
        Args: { p_petshop: string; p_resposta: string; p_telefone: string }
        Returns: Json
      }
      bot_revogar_consentimento: { Args: { p_tutor: string }; Returns: boolean }
      bot_salvar_estado: {
        Args: { p_conversa: string; p_dados_temp?: Json; p_estado: string }
        Returns: undefined
      }
      bot_servicos: {
        Args: { p_petshop: string; p_porte: string }
        Returns: Json
      }
      bot_token: { Args: { p_petshop: string }; Returns: string }
      bot_vincular_pet_compartilhado: {
        Args: { p_pet: string; p_petshop: string; p_tutor: string }
        Returns: string
      }
      cadastrar_pet: {
        Args: {
          p_especie?: string
          p_nascimento?: string
          p_nome: string
          p_petshop: string
          p_porte: string
          p_raca?: string
          p_tutor: string
        }
        Returns: string
      }
      cadastrar_tutor: {
        Args: {
          p_nome: string
          p_origem?: string
          p_petshop: string
          p_telefone: string
        }
        Returns: string
      }
      compra_receber: {
        Args: {
          p_fornecedor?: string
          p_itens: Json
          p_local?: string
          p_nf?: string
          p_observacao?: string
          p_parcelas?: Json
          p_pedido?: string
          p_petshop: string
          p_recebido_em?: string
        }
        Returns: Json
      }
      conta_baixar: {
        Args: {
          p_conta: string
          p_data?: string
          p_forma: string
          p_tipo: string
          p_valor?: number
        }
        Returns: undefined
      }
      conta_cancelar: {
        Args: { p_conta: string; p_motivo: string; p_tipo: string }
        Returns: undefined
      }
      conta_editar: {
        Args: {
          p_categoria?: string
          p_conta: string
          p_descricao?: string
          p_observacao?: string
          p_tipo: string
          p_valor?: number
          p_vencimento?: string
        }
        Returns: undefined
      }
      conta_lancar: {
        Args: {
          p_categoria: string
          p_descricao: string
          p_documento?: string
          p_fornecedor?: string
          p_observacao?: string
          p_parcelas: Json
          p_petshop: string
          p_tipo: string
          p_tutor?: string
        }
        Returns: string
      }
      conta_reabrir: {
        Args: { p_conta: string; p_tipo: string }
        Returns: undefined
      }
      contas_receber_abertas: {
        Args: { p_petshop: string }
        Returns: {
          descricao: string
          dias_atraso: number
          id: string
          origem: string
          recebido: number
          saldo: number
          situacao: string
          tutor: string
          tutor_id: string
          valor: number
          vencimento: string
        }[]
      }
      conversas_pausadas: {
        Args: { p_petshop: string }
        Returns: {
          conversa_id: string
          estado: string
          humano_ate: string
          humano_desde: string
          pausado_por_painel: boolean
          telefone: string
          tutor_id: string
          tutor_nome: string
          vencida: boolean
        }[]
      }
      definir_papeis_adicionais: {
        Args: { p_membro: string; p_papeis: string[] }
        Returns: {
          ativo: boolean
          criado_em: string
          id: string
          nome: string | null
          papeis_adicionais: string[]
          papel: string
          petshop_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "petshop_membros"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      devolucao_aprovar: {
        Args: { p_requisicao: string }
        Returns: {
          concluida_em: string | null
          concluido_por: string | null
          decidida_em: string | null
          decidido_por: string | null
          id: string
          local_id: string
          motivo: string | null
          numero: number
          observacao: string | null
          petshop_id: string
          recurso_id: string | null
          requisicao_origem_id: string | null
          solicitada_em: string
          solicitado_por: string | null
          status: string
          tipo: string
        }
        SetofOptions: {
          from: "*"
          to: "requisicoes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      devolucao_criar: {
        Args: {
          p_itens: Json
          p_observacao?: string
          p_requisicao_origem: string
        }
        Returns: string
      }
      devolucao_receber: {
        Args: { p_itens?: Json; p_requisicao: string }
        Returns: {
          concluida_em: string | null
          concluido_por: string | null
          decidida_em: string | null
          decidido_por: string | null
          id: string
          local_id: string
          motivo: string | null
          numero: number
          observacao: string | null
          petshop_id: string
          recurso_id: string | null
          requisicao_origem_id: string | null
          solicitada_em: string
          solicitado_por: string | null
          status: string
          tipo: string
        }
        SetofOptions: {
          from: "*"
          to: "requisicoes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      estoque_avisos: {
        Args: { p_dias?: number; p_petshop: string }
        Returns: {
          cobertura: Json
          faltante: number
          local: string
          local_id: string
          minimo: number
          ocorrido_em: string
          produto: string
          produto_id: string
          referencia: string
          saldo: number
          tipo: string
          unidade_base: string
        }[]
      }
      estoque_definir_minimo: {
        Args: { p_local: string; p_minimo: number; p_produto: string }
        Returns: {
          atualizado_em: string
          local_id: string
          minimo: number | null
          petshop_id: string
          produto_id: string
          quantidade: number
        }
        SetofOptions: {
          from: "*"
          to: "estoque_saldos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fazer_checkin: {
        Args: { p_agendamento: string }
        Returns: {
          atualizado_em: string
          cancelado_em: string | null
          cancelado_por: string | null
          checkin_em: string | null
          checkout_em: string | null
          criado_em: string
          criado_por: string | null
          encaixe: boolean
          fim: string
          id: string
          inicio: string
          motivo_cancelamento: string | null
          observacoes: string | null
          origem: string
          pagamento_status: string
          periodo: unknown
          pet_id: string
          petshop_id: string
          pronto_em: string | null
          recurso_id: string
          status: string
          tutor_id: string
          valor_total: number
        }
        SetofOptions: {
          from: "*"
          to: "agendamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fazer_checkout: {
        Args: {
          p_agendamento: string
          p_fiado?: boolean
          p_observacao?: string
          p_pagamentos?: Json
        }
        Returns: {
          atualizado_em: string
          cancelado_em: string | null
          cancelado_por: string | null
          checkin_em: string | null
          checkout_em: string | null
          criado_em: string
          criado_por: string | null
          encaixe: boolean
          fim: string
          id: string
          inicio: string
          motivo_cancelamento: string | null
          observacoes: string | null
          origem: string
          pagamento_status: string
          periodo: unknown
          pet_id: string
          petshop_id: string
          pronto_em: string | null
          recurso_id: string
          status: string
          tutor_id: string
          valor_total: number
        }
        SetofOptions: {
          from: "*"
          to: "agendamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ficha_publica: { Args: { p_ref: string }; Returns: Json }
      horarios_disponiveis: {
        Args: {
          p_aplicar_antecedencia?: boolean
          p_data: string
          p_petshop: string
          p_porte: string
          p_recurso?: string
          p_servicos: string[]
        }
        Returns: {
          fim: string
          inicio: string
          recurso_id: string
          recurso_nome: string
          vagas: number
        }[]
      }
      horarios_livres_resumo: {
        Args: {
          p_data: string
          p_petshop: string
          p_porte: string
          p_servicos: string[]
        }
        Returns: {
          hora: string
          inicio: string
          vagas: number
        }[]
      }
      inventario_abrir: {
        Args: {
          p_local: string
          p_observacao?: string
          p_petshop: string
          p_produtos?: string[]
        }
        Returns: string
      }
      inventario_cancelar: {
        Args: { p_inventario: string }
        Returns: {
          aberto_em: string
          aberto_por: string | null
          fechado_em: string | null
          fechado_por: string | null
          id: string
          local_id: string
          numero: number
          observacao: string | null
          petshop_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "inventarios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      inventario_contar: {
        Args: { p_inventario: string; p_itens: Json }
        Returns: {
          ajuste: number | null
          contado_em: string | null
          contado_por: string | null
          id: string
          inventario_id: string
          petshop_id: string
          produto_id: string
          qtd_contada: number | null
          saldo_sistema: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "inventario_itens"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      inventario_fechar: { Args: { p_inventario: string }; Returns: Json }
      lembretes_pendentes: {
        Args: { p_petshop?: string }
        Returns: {
          agendamento_id: string
          data: string
          hora: string
          nome_bot: string
          nome_tutor: string
          pet: string
          petshop_id: string
          servicos: string
          telefone: string
        }[]
      }
      meus_papeis: { Args: { p_petshop: string }; Returns: string[] }
      minhas_funcionalidades: { Args: { p_petshop: string }; Returns: string[] }
      painel_ficha_desligar: {
        Args: { p_pet: string; p_petshop: string }
        Returns: undefined
      }
      painel_plaquinha_desativar: {
        Args: { p_motivo: string; p_petshop: string; p_plaquinha: string }
        Returns: undefined
      }
      painel_plaquinhas_pet: {
        Args: { p_pet: string; p_petshop: string }
        Returns: Json
      }
      pausar_bot_tutor: {
        Args: { p_petshop: string; p_telefone: string }
        Returns: {
          criado_em: string
          dados_temp: Json
          estado: string
          humano_ate: string | null
          humano_desde: string | null
          humano_por: string | null
          id: string
          petshop_id: string
          telefone: string
          tutor_id: string | null
          ultimo_contato: string
        }
        SetofOptions: {
          from: "*"
          to: "bot_conversas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pedido_compra_cancelar: {
        Args: { p_motivo: string; p_pedido: string }
        Returns: {
          criado_em: string
          criado_por: string | null
          data_prevista: string | null
          enviado_em: string | null
          finalizado_em: string | null
          fornecedor_id: string
          id: string
          motivo: string | null
          numero: number
          observacao: string | null
          petshop_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "pedidos_compra"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pedido_compra_encerrar: {
        Args: { p_motivo: string; p_pedido: string }
        Returns: {
          criado_em: string
          criado_por: string | null
          data_prevista: string | null
          enviado_em: string | null
          finalizado_em: string | null
          fornecedor_id: string
          id: string
          motivo: string | null
          numero: number
          observacao: string | null
          petshop_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "pedidos_compra"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pedido_compra_enviar: {
        Args: { p_pedido: string }
        Returns: {
          criado_em: string
          criado_por: string | null
          data_prevista: string | null
          enviado_em: string | null
          finalizado_em: string | null
          fornecedor_id: string
          id: string
          motivo: string | null
          numero: number
          observacao: string | null
          petshop_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "pedidos_compra"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      proximos_dias_com_vaga: {
        Args: {
          p_dias?: number
          p_petshop: string
          p_porte: string
          p_servicos: string[]
        }
        Returns: {
          dia: string
          dia_semana: string
          horarios: number
        }[]
      }
      receber_agendamento: {
        Args: { p_agendamento: string; p_forma: string; p_valor: number }
        Returns: {
          atualizado_em: string
          cancelado_em: string | null
          cancelado_por: string | null
          checkin_em: string | null
          checkout_em: string | null
          criado_em: string
          criado_por: string | null
          encaixe: boolean
          fim: string
          id: string
          inicio: string
          motivo_cancelamento: string | null
          observacoes: string | null
          origem: string
          pagamento_status: string
          periodo: unknown
          pet_id: string
          petshop_id: string
          pronto_em: string | null
          recurso_id: string
          status: string
          tutor_id: string
          valor_total: number
        }
        SetofOptions: {
          from: "*"
          to: "agendamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      relatorio_poc: {
        Args: { p_ate: string; p_de: string; p_petshop: string }
        Returns: Json
      }
      requisicao_atender: {
        Args: { p_itens?: Json; p_requisicao: string }
        Returns: Json
      }
      requisicao_cancelar: {
        Args: { p_motivo?: string; p_requisicao: string }
        Returns: {
          concluida_em: string | null
          concluido_por: string | null
          decidida_em: string | null
          decidido_por: string | null
          id: string
          local_id: string
          motivo: string | null
          numero: number
          observacao: string | null
          petshop_id: string
          recurso_id: string | null
          requisicao_origem_id: string | null
          solicitada_em: string
          solicitado_por: string | null
          status: string
          tipo: string
        }
        SetofOptions: {
          from: "*"
          to: "requisicoes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      requisicao_criar: {
        Args: {
          p_itens: Json
          p_local?: string
          p_observacao?: string
          p_petshop: string
          p_recurso?: string
        }
        Returns: string
      }
      requisicao_recusar: {
        Args: { p_motivo: string; p_requisicao: string }
        Returns: {
          concluida_em: string | null
          concluido_por: string | null
          decidida_em: string | null
          decidido_por: string | null
          id: string
          local_id: string
          motivo: string | null
          numero: number
          observacao: string | null
          petshop_id: string
          recurso_id: string | null
          requisicao_origem_id: string | null
          solicitada_em: string
          solicitado_por: string | null
          status: string
          tipo: string
        }
        SetofOptions: {
          from: "*"
          to: "requisicoes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reservar_agendamento: {
        Args: {
          p_encaixe?: boolean
          p_inicio: string
          p_observacoes?: string
          p_origem?: string
          p_pet: string
          p_petshop: string
          p_recurso?: string
          p_servicos: string[]
          p_status?: string
          p_tutor: string
        }
        Returns: {
          atualizado_em: string
          cancelado_em: string | null
          cancelado_por: string | null
          checkin_em: string | null
          checkout_em: string | null
          criado_em: string
          criado_por: string | null
          encaixe: boolean
          fim: string
          id: string
          inicio: string
          motivo_cancelamento: string | null
          observacoes: string | null
          origem: string
          pagamento_status: string
          periodo: unknown
          pet_id: string
          petshop_id: string
          pronto_em: string | null
          recurso_id: string
          status: string
          tutor_id: string
          valor_total: number
        }
        SetofOptions: {
          from: "*"
          to: "agendamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transferencia_cancelar: {
        Args: { p_motivo?: string; p_transferencia: string }
        Returns: {
          concluida_em: string | null
          concluido_por: string | null
          decidida_em: string | null
          decidido_por: string | null
          destino_id: string
          id: string
          motivo: string | null
          numero: number
          observacao: string | null
          origem_id: string
          petshop_id: string
          solicitada_em: string
          solicitado_por: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "transferencias"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transferencia_confirmar: {
        Args: { p_itens?: Json; p_transferencia: string }
        Returns: Json
      }
      transferencia_criar: {
        Args: {
          p_destino: string
          p_itens: Json
          p_observacao?: string
          p_origem: string
          p_petshop: string
        }
        Returns: string
      }
      transferencia_decidir: {
        Args: { p_aprovar: boolean; p_motivo?: string; p_transferencia: string }
        Returns: {
          concluida_em: string | null
          concluido_por: string | null
          decidida_em: string | null
          decidido_por: string | null
          destino_id: string
          id: string
          motivo: string | null
          numero: number
          observacao: string | null
          origem_id: string
          petshop_id: string
          solicitada_em: string
          solicitado_por: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "transferencias"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
