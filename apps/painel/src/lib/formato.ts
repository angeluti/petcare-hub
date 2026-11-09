const moedaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function moeda(v: number | null | undefined): string {
  return moedaFmt.format(Number(v ?? 0));
}

/** +5519991234567 → (19) 99123-4567 */
export function telefone(e164: string | null | undefined): string {
  if (!e164) return '';
  const d = e164.replace(/\D/g, '');
  const local = d.startsWith('55') ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return e164;
}

/** Mesma regra de private.normalizar_telefone: DDD + número vira +55… */
export function normalizarTelefone(txt: string): string | null {
  let d = txt.replace(/\D/g, '');
  if (!d) return null;
  // Com "+" na frente, o número já vem com o país: não acrescenta o 55.
  if (!txt.trim().startsWith('+') && (d.length === 10 || d.length === 11)) d = '55' + d;
  return '+' + d;
}

// Celular que recebe WhatsApp (mesma regra do arquivo 18):
// Brasil +55 DDD 9XXXXXXXX; outros países 10 a 15 dígitos.
export function celularValido(e164: string | null): boolean {
  if (!e164) return false;
  if (e164.startsWith('+55')) return /^\+55[1-9]{2}9\d{8}$/.test(e164);
  return /^\+[1-9]\d{9,14}$/.test(e164);
}

export function linkWhatsApp(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, '')}`;
}

export const PORTES = ['P', 'M', 'G', 'GG'] as const;
export type Porte = (typeof PORTES)[number];

export const ESPECIES: Record<string, string> = { cao: 'Cão', gato: 'Gato', outro: 'Outro' };

export function normalizar(txt: string): string {
  return txt.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
