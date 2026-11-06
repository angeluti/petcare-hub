// Tradução dos erros do banco para mensagens do painel.
//
// ATENÇÃO: o documento-mestre diz que o conflito de horário vira HTTP 409.
// Testado no PostgREST 12.2 e 14.0: o 23P01 sai como HTTP 400 com
// body.code = '23P01'. Por isso o painel (e o bot) devem olhar o CÓDIGO,
// nunca o status HTTP.

export interface ErroBanco {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

export function ehConflitoDeHorario(e: unknown): boolean {
  return (e as ErroBanco | null)?.code === '23P01';
}

export function mensagemDeErro(e: unknown): string {
  const err = (e ?? {}) as ErroBanco;
  switch (err.code) {
    case '23P01':
      return 'Esse horário acabou de ser ocupado. Escolha outro horário.';
    case '42501':
      return 'Você não tem permissão para isso neste pet shop.';
    case '23505':
      return 'Já existe um registro com esses dados (nome repetido?).';
    case '23503':
      return 'Registro ligado a outro dado que não existe ou não é deste pet shop.';
    case '23514':
      return 'Valor fora das regras: ' + (err.message ?? '');
    // Supabase Auth
    case 'over_email_send_rate_limit':
      return 'Muitos e-mails enviados em pouco tempo. Espere alguns minutos e tente de novo.';
    case 'otp_expired':
      return 'O link expirou ou já foi usado.';
    case 'same_password':
      return 'A nova senha precisa ser diferente da atual.';
    case 'weak_password':
      return 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.';
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos.';
    case 'PGRST301':
    case 'PGRST303':
      return 'Sua sessão expirou. Entre de novo.';
    case '22023':
    case 'P0001':
    case 'P0002':
      return err.message ?? 'Dados inválidos.';
    default:
      if (err.message?.includes('Failed to fetch')) return 'Sem conexão com o servidor. Verifique a internet.';
      if (err.message?.toLowerCase().includes('rate limit')) return 'Muitos pedidos em pouco tempo. Espere alguns minutos e tente de novo.';
      return err.message ?? 'Erro inesperado.';
  }
}
