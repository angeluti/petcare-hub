// Campo de quantidade na unidade de controle do produto (arquivo 23).
// Unitário: número inteiro, com o nome da unidade ao lado.
// Fracionado: digita em L, kg ou m (ou ml, g, cm); devolve na unidade guardada.
// Sempre devolve o valor na unidade de controle; quem chama confere se é inteiro.
import { useState } from 'react';
import { MEDIDAS, escreverNumero, lerNumero, nomeUnidade, type Produto } from '../../lib/administracao';

type UnidadeProduto = Pick<Produto, 'unidade_base' | 'unidade_rotulo'>;

export function QtdInput(props: {
  produto: UnidadeProduto;
  valor: number | null;
  aoMudar: (base: number | null) => void;
  rotulo: string;
  vazioPermitido?: boolean;
}) {
  const ub = props.produto.unidade_base;
  const medida = ub === 'un' ? null : MEDIDAS[ub];
  // Fracionado começa na unidade grande (L, kg, m), salvo valor que não fecha nela.
  const [escala, setEscala] = useState<number>(() =>
    medida && !(props.valor !== null && props.valor % medida.fator !== 0) ? medida.fator : 1);
  const [texto, setTexto] = useState(() => (props.valor === null ? '' : escreverNumero(props.valor / escala)));

  function emitir(t: string, e: number) {
    const n = lerNumero(t);
    props.aoMudar(n === null ? null : Math.round(n * e * 10000) / 10000);
  }

  const base = lerNumero(texto);
  const quebrado = base !== null && !Number.isInteger(Math.round(base * escala * 10000) / 10000);

  return (
    <div className="adm-qtd-bloco">
      <div className="adm-qtd">
        <input
          inputMode={medida ? 'decimal' : 'numeric'}
          value={texto}
          aria-label={props.rotulo}
          aria-invalid={quebrado}
          placeholder={props.vazioPermitido ? 'sem mínimo' : '0'}
          onChange={(e) => { setTexto(e.target.value); emitir(e.target.value, escala); }}
        />
        {medida ? (
          <select aria-label="Medida" value={escala} onChange={(e) => { const x = Number(e.target.value); setEscala(x); emitir(texto, x); }}>
            <option value={medida.fator}>{medida.sigla}</option>
            <option value={1}>{ub}</option>
          </select>
        ) : (
          <span className="adm-qtd-unidade">{nomeUnidade(props.produto)}</span>
        )}
      </div>
      {quebrado && (
        <span className="campo-dica adm-alerta">
          {medida ? `Não fecha em ${ub} inteiros.` : 'Use número inteiro.'}
        </span>
      )}
    </div>
  );
}
