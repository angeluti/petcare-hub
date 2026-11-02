/**
 * Configuração do site. Tudo que muda sem mexer no layout fica aqui ou em src/data/.
 */

// TODO(posicionamento): V1 fala só de banho e tosa. Ampliar para "gestão do pet shop" quando a
// Administração for lançada. Ver docs/site-evolucao.md.
export const SITE = {
  nome: 'PetCare Hub',
  url: 'https://www.petcarehub.com.br',
  appUrl: 'https://app.petcarehub.com.br',
  empresa: 'Harpia Tech Studio',
  descricao:
    'Agendamento de banho e tosa pelo WhatsApp, agenda única e lembrete na véspera para pet shops. Atende seus clientes enquanto você cuida dos pets.',
} as const;

/**
 * WhatsApp comercial da Harpia (NÃO é o número do bot de nenhum pet shop).
 * Formato: só dígitos, com DDI e DDD. Ex.: 5519999999999
 * TODO: trocar pelo número real antes do deploy de produção.
 */
export const WHATSAPP_COMERCIAL = '551194943102';

export const WHATSAPP_COMERCIAL_OK = /^55\d{10,11}$/.test(WHATSAPP_COMERCIAL);

// Trava de segurança: o build de produção no Cloudflare Pages falha se o número
// ainda for o placeholder. Prévias (outras branches) e o ambiente local continuam.
const envBuild = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env ?? {};

if (
  !WHATSAPP_COMERCIAL_OK &&
  envBuild.CF_PAGES === '1' &&
  envBuild.CF_PAGES_BRANCH === 'main'
) {
  throw new Error(
    'WHATSAPP_COMERCIAL ainda é placeholder em src/config.ts. Defina o número antes de publicar em produção.'
  );
}

/** Mensagem que já chega preenchida no WhatsApp comercial. `origem` ajuda a saber qual botão converteu. */
export function linkDemonstracao(origem: string): string {
  const texto = `Olá! Quero agendar uma demonstração do PetCare Hub para o meu pet shop. (site: ${origem})`;
  if (!WHATSAPP_COMERCIAL_OK) return '#demonstracao';
  return `https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(texto)}`;
}

/** Número formatado para exibir como texto, ex.: (19) 99999-9999 */
export function whatsappFormatado(): string {
  if (!WHATSAPP_COMERCIAL_OK) return '(número a definir)';
  const n = WHATSAPP_COMERCIAL.slice(2);
  const ddd = n.slice(0, 2);
  const resto = n.slice(2);
  return resto.length === 9
    ? `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`
    : `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
}
