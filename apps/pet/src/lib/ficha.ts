// Regras puras da página da ficha. Testadas em test/ficha.test.ts.

export type Estado = 'indisponivel' | 'desligada' | 'basica' | 'completa';

export interface Ficha {
  estado: Estado;
  codigo?: string;
  contato?: { whatsapp: string } | null;
  pet?: {
    nome?: string;
    especie?: string;
    raca?: string;
    porte?: string;
    alergias?: string;
    condicoes?: string;
    tutor?: string;
  };
}

const ALFABETO = /^[0-9A-HJKMNP-TV-Z]{6}$/;

/** Código da URL (/K7M3QX, /k7m3qx, /K7M-3QX ou ?c=K7M3QX). Mesmas trocas do banco: O→0, I e L→1. */
export function codigoDaUrl(pathname: string, search = ''): string | null {
  const q = new URLSearchParams(search).get('c');
  const bruto = (q ?? pathname.replace(/^\/+|\/+$/g, '').split('/')[0] ?? '').trim();
  if (!bruto) return null;
  const c = decodeURIComponent(bruto).toUpperCase().replace(/[\s-]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');
  return ALFABETO.test(c) ? c : 'INVALIDO';
}

const ESPECIES: Record<string, string> = { cao: 'Cão', gato: 'Gato', outro: 'Pet' };
const PORTES: Record<string, string> = { P: 'Porte pequeno', M: 'Porte médio', G: 'Porte grande', GG: 'Porte gigante' };

/** Etiquetas curtas da ficha: espécie, raça e porte, na ordem em que aparecem. */
export function etiquetas(pet: Ficha['pet']): string[] {
  if (!pet) return [];
  return [
    pet.especie ? ESPECIES[pet.especie] ?? pet.especie : null,
    pet.raca?.trim() || null,
    pet.porte ? PORTES[pet.porte] ?? null : null,
  ].filter((x): x is string => !!x);
}

/** Link do WhatsApp do número central com o texto já escrito. */
export function linkWhatsApp(numero: string, texto: string): string {
  return `https://wa.me/${numero.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
}

/** Mensagem de quem achou. O bot lê "ACHEI <código>" e tudo depois de "Recado:". */
export function textoAchei(codigo: string, recado: string): string {
  const r = recado.trim().replace(/\s+\n/g, '\n').slice(0, 400);
  return `ACHEI ${codigo}\nRecado: ${r}`;
}

export function textoFicha(codigo: string): string {
  return `FICHA ${codigo}`;
}

/** Garante a forma da resposta: qualquer coisa estranha vira "indisponível". */
export function lerResposta(j: unknown): Ficha {
  if (!j || typeof j !== 'object') return { estado: 'indisponivel' };
  const f = j as Ficha;
  if (!['indisponivel', 'desligada', 'basica', 'completa'].includes(f.estado)) return { estado: 'indisponivel' };
  return f;
}
