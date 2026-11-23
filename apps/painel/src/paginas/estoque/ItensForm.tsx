// Lista de itens para requisição e transferência: produto, embalagem e quantidade,
// mostrando quanto há no local de origem. A regra do arquivo 23 é conferida aqui
// também, para o aviso aparecer antes de ir ao banco.
import { useState } from 'react';
import { lerNumero, quantidade, type Embalagem, type Produto } from '../../lib/administracao';
import { quantidadeInvalida } from '../../lib/compras';
import { Campo } from '../../componentes/ui';

export interface LinhaItem { chave: string; produto: Produto; embalagem: Embalagem; quantidade: number }

export function ItensForm(props: {
  produtos: Produto[];
  /** quais embalagens podem ser usadas */
  embalagemValida: (e: Embalagem) => boolean;
  /** saldo do produto no local de origem (unidade de controle) */
  saldo: (produtoId: string) => number;
  linhas: LinhaItem[];
  aoMudar: (linhas: LinhaItem[]) => void;
}) {
  const [produtoId, setProdutoId] = useState('');
  const [embalagemId, setEmbalagemId] = useState('');
  const [qtdTxt, setQtdTxt] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const produto = props.produtos.find((p) => p.id === produtoId) ?? null;
  const embalagens = produto ? produto.produto_unidades.filter((u) => u.ativo && props.embalagemValida(u)).sort((a, b) => a.fator - b.fator) : [];

  function escolher(id: string) {
    setProdutoId(id);
    const pr = props.produtos.find((p) => p.id === id);
    setEmbalagemId(pr?.produto_unidades.filter((u) => u.ativo && props.embalagemValida(u)).sort((a, b) => a.fator - b.fator)[0]?.id ?? '');
  }

  function incluir() {
    setErro(null);
    const emb = embalagens.find((e) => e.id === embalagemId);
    if (!produto || !emb) return setErro('Escolha o produto e a embalagem.');
    const qtd = lerNumero(qtdTxt);
    const e = quantidadeInvalida(qtd, Number(emb.fator), produto);
    if (e) return setErro(e);
    const existente = props.linhas.find((l) => l.embalagem.id === emb.id);
    props.aoMudar(existente
      ? props.linhas.map((l) => (l === existente ? { ...l, quantidade: l.quantidade + qtd! } : l))
      : [...props.linhas, { chave: `${emb.id}`, produto, embalagem: emb, quantidade: qtd! }]);
    setProdutoId(''); setEmbalagemId(''); setQtdTxt('');
  }

  return (
    <div>
      {props.linhas.length > 0 && (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Produto</th><th className="num">Quantidade</th><th className="num">No local</th><th></th></tr></thead>
            <tbody>
              {props.linhas.map((l) => {
                const precisa = l.quantidade * Number(l.embalagem.fator);
                const tem = props.saldo(l.produto.id);
                return (
                  <tr key={l.chave}>
                    <td>{l.produto.nome}</td>
                    <td className="num">{String(l.quantidade).replace('.', ',')} {l.embalagem.rotulo}</td>
                    <td className="num">
                      {tem < precisa && <span className="adm-alerta" title="O local não tem tudo agora">⚠ </span>}
                      {quantidade(tem, l.produto)}
                    </td>
                    <td className="acoes-celula">
                      <button className="btn-link" onClick={() => props.aoMudar(props.linhas.filter((x) => x !== l))}>remover</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="subform">
        <div className="linha-campos">
          <Campo rotulo="Produto">
            <select value={produtoId} onChange={(e) => escolher(e.target.value)}>
              <option value="">—</option>
              {props.produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Embalagem">
            <select value={embalagemId} disabled={!produto} onChange={(e) => setEmbalagemId(e.target.value)}>
              {embalagens.map((u) => <option key={u.id} value={u.id}>{u.rotulo}{u.eh_base ? '' : ` (${quantidade(u.fator, produto!)})`}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Quantidade" dica={produto ? `No local: ${quantidade(props.saldo(produto.id), produto)}` : undefined}>
            <input inputMode={produto?.unidade_base === 'un' ? 'numeric' : 'decimal'} value={qtdTxt} onChange={(e) => setQtdTxt(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') incluir(); }} />
          </Campo>
        </div>
        <div className="acoes-linha"><button className="btn" type="button" onClick={incluir}>Incluir</button></div>
        {props.produtos.length === 0 && <p className="nota">Nenhum produto disponível para este uso.</p>}
        {erro && <p className="erro-texto">{erro}</p>}
      </div>
    </div>
  );
}
