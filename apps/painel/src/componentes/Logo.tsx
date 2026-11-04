// Logo do PetCare Hub (arquivos do pacote de marca em /public/logo).
// O painel segue o tema do sistema (prefers-color-scheme), então o <picture>
// troca para a versão -escuro sozinho. Não use a versão -cor sobre fundo escuro:
// o contorno da orelha e os olhos usam a cor do fundo previsto.

export function Logo(props: { tipo?: 'horizontal' | 'simbolo'; altura: number; className?: string }) {
  const tipo = props.tipo ?? 'horizontal';
  const arquivo = tipo === 'horizontal' ? 'logo-horizontal' : 'simbolo';
  // viewBox: horizontal 403×100, símbolo 100×100
  const largura = Math.round(tipo === 'horizontal' ? props.altura * 4.03 : props.altura);
  return (
    <picture className={props.className}>
      <source srcSet={`/logo/${arquivo}-escuro.svg`} media="(prefers-color-scheme: dark)" />
      <img src={`/logo/${arquivo}-cor.svg`} alt="PetCare Hub" width={largura} height={props.altura} />
    </picture>
  );
}
