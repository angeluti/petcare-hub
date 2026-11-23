// ES-04 · Recebimento de compra, com pedido ou sem pedido (entrada avulsa).
// O banco dá entrada no estoque, recalcula o custo médio e gera as contas a
// pagar pelas parcelas (a soma tem de bater com o total).
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import {
  erroAdm, escreverNumero, lerNumero, quantidade, useFornecedores, useLocais, useProdutos, type Produto,
} from '../../lib/administracao';
import {
  dividirParcelas, quantidadeInvalida, receberCompra, type ItemRecebendo, type Parcela, type Pedido,
} from '../../lib/compras';
import { moeda } from '../../lib/formato';
import { hoje, instante, somarDias } from '../../lib/tempo';
import { Campo, Modal, useAvisos } from '../../componentes/ui';
import { atualizarCompras, pendente, valorItem } from './comum';

interface Linha {
  chave: string;
  pedido_item_id?: string;
  produto_id: string;
  produto_unidade_id: string;
  rotulo: string;
  fator: number;
  maximo?: number;         // pendente do pedido
  qtdTxt: string;
  custoTxt: string;
}

export function RecebimentoModal({ pedido, aoFechar }: { pedido: Pedido | null; aoFechar: () => void }) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const produtosQ = useProdutos(petshop.id);
  const locaisQ = useLocais(petshop.id);
  const fornecedoresQ = useFornecedores(petshop.id, !pedido);
  const porId = useMemo(() => new Map((produtosQ.data ?? []).map((p) => [p.id, p])), [produtosQ.data]);
  const locais = (locaisQ.data ?? []).filter((l) => l.ativo);
  const dia0 = hoje(petshop.fuso);

  const [linhas, setLinhas] = useState<Linha[]>(() =>
    (pedido?.pedido_compra_itens ?? []).filter((i) => pendente(i) > 0).map((i) => ({
      chave: i.id, pedido_item_id: i.id, produto_id: i.produto_id, produto_unidade_id: i.produto_unidade_id,
      rotulo: i.unidade_rotulo, fator: Number(i.fator), maximo: pendente(i),
      qtdTxt: escreverNumero(pendente(i)), custoTxt: escreverNumero(Number(i.custo_previsto)),
    })));
  const [fornecedor, setFornecedor] = useState('');
  const [localId, setLocalId] = useState('');
  const [dia, setDia] = useState(dia0);
  const [nf, setNf] = useState('');
  const [obs, setObs] = useState('');
  const [nParcelas, setNParcelas] = useState(1);
  const [primeiroVenc, setPrimeiroVenc] = useState(dia0);
  const [intervalo, setIntervalo] = useState(30);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!localId && locais.length) setLocalId((locais.find((l) => l.padrao_entrada) ?? locais[0]).id);
  }, [locais, localId]);

  const total = linhas.reduce((s, l) => s + valorItem(lerNumero(l.qtdTxt) ?? 0, lerNumero(l.custoTxt) ?? 0), 0);
  const totalCent = Math.round(total * 100);

  // Parcelas se refazem quando muda o total ou a regra de divisão.
  useEffect(() => {
    setParcelas(totalCent > 0 ? dividirParcelas(totalCent / 100, nParcelas, primeiroVenc, intervalo, somarDias) : []);
  }, [totalCent, nParcelas, primeiroVenc, intervalo]);

  const somaParcelas = Math.round(parcelas.reduce((s, p) => s + p.valor, 0) * 100);

  function mudaLinha(chave: string, patch: Partial<Linha>) {
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...patch } : l)));
  }

  async function registrar() {
    setErro(null);
    const itens: ItemRecebendo[] = [];
    for (const l of linhas) {
      const qtd = lerNumero(l.qtdTxt);
      if (pedido && (qtd === null || qtd === 0)) continue;    // item do pedido que não chegou agora
      const pr = porId.get(l.produto_id);
      const e = pr ? quantidadeInvalida(qtd, l.fator, pr) : null;
      if (e) return setErro(e);
      if (l.maximo !== undefined && qtd! > l.maximo) return setErro(`"${pr?.nome}": chegou mais do que falta no pedido (${escreverNumero(l.maximo)}). Registre a sobra como entrada sem pedido.`);
      const custo = lerNumero(l.custoTxt);
      if (custo === null || custo < 0) return setErro(`Informe o custo de "${pr?.nome}".`);
      itens.push(l.pedido_item_id
        ? { pedido_item_id: l.pedido_item_id, quantidade: qtd!, custo_unitario: custo }
        : { produto_unidade_id: l.produto_unidade_id, quantidade: qtd!, custo_unitario: custo });
    }
    if (itens.length === 0) return setErro('Informe o que chegou.');
    if (!localId) return setErro('Escolha o local de entrada.');
    if (totalCent > 0 && somaParcelas !== totalCent) return setErro(`As parcelas somam ${moeda(somaParcelas / 100)} e o recebimento soma ${moeda(totalCent / 100)}.`);
    if (parcelas.some((p) => !p.vencimento || !(p.valor > 0))) return setErro('Cada parcela precisa de vencimento e valor.');

    setSalvando(true);
    try {
      const r = await receberCompra({
        petshopId: petshop.id,
        itens,
        pedidoId: pedido?.id,
        fornecedorId: pedido ? undefined : fornecedor || undefined,
        localId,
        nf,
        recebidoEm: dia === dia0 ? new Date().toISOString() : instante(dia, '12:00', petshop.fuso),
        parcelas,
        observacao: obs,
      });
      await atualizarCompras(qc, petshop.id);
      avisar(`Recebimento nº ${r.numero} registrado: ${moeda(Number(r.valor_total))}.${r.pedido_status === 'recebido_parcial' ? ' O pedido segue aguardando o restante.' : ''}`);
      aoFechar();
    } catch (e) {
      setErro(erroAdm(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={pedido ? `Recebimento do pedido nº ${pedido.numero}` : 'Entrada sem pedido'}
      aberto
      largo
      aoFechar={aoFechar}
      rodape={
        <>
          <span className="rodape-resumo">Total: <b>{moeda(totalCent / 100)}</b></span>
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn primario" disabled={salvando} onClick={registrar}>{salvando ? 'Registrando…' : 'Registrar entrada'}</button>
        </>
      }
    >
      <div className="adm-secoes">
        <section>
          <div className="linha-campos">
            {pedido ? (
              <Campo rotulo="Fornecedor"><input value={pedido.fornecedores?.nome ?? ''} disabled /></Campo>
            ) : (
              <Campo rotulo="Fornecedor (opcional)">
                <select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
                  <option value="">—</option>
                  {(fornecedoresQ.data ?? []).filter((f) => f.ativo).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </Campo>
            )}
            <Campo rotulo="Data do recebimento">
              <input type="date" value={dia} max={dia0} onChange={(e) => { setDia(e.target.value); setPrimeiroVenc(e.target.value); }} />
            </Campo>
            <Campo rotulo="Nota fiscal (opcional)"><input value={nf} onChange={(e) => setNf(e.target.value)} /></Campo>
            {locais.length > 1 && (
              <Campo rotulo="Entra no local">
                <select value={localId} onChange={(e) => setLocalId(e.target.value)}>
                  {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </Campo>
            )}
          </div>
        </section>

        <section>
          <h3 className="adm-subtitulo">{pedido ? 'O que chegou' : 'Itens'}</h3>
          {pedido && <p className="nota">Deixe em zero o que não chegou agora: o pedido continua aguardando.</p>}
          {linhas.length > 0 && (
            <div className="tabela-wrap">
              <table className="tabela">
                <thead>
                  <tr><th>Produto</th><th>Embalagem</th>{pedido && <th className="num">Falta</th>}<th className="num">Chegou</th><th className="num">Custo por embalagem</th><th className="num">Valor</th>{!pedido && <th></th>}</tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const pr = porId.get(l.produto_id);
                    return (
                      <tr key={l.chave}>
                        <td>{pr?.nome ?? 'Produto'}</td>
                        <td>{l.rotulo}{pr && l.fator > 1 && <span className="mudo adm-pequeno"> ({quantidade(l.fator, pr)})</span>}</td>
                        {pedido && <td className="num">{escreverNumero(l.maximo ?? 0)}</td>}
                        <td className="num"><input className="adm-num" inputMode="decimal" value={l.qtdTxt} aria-label={`Quantidade de ${pr?.nome}`}
                                                   onChange={(e) => mudaLinha(l.chave, { qtdTxt: e.target.value })} /></td>
                        <td className="num"><input className="adm-num" inputMode="decimal" value={l.custoTxt} aria-label={`Custo de ${pr?.nome}`}
                                                   onChange={(e) => mudaLinha(l.chave, { custoTxt: e.target.value })} /></td>
                        <td className="num">{moeda(valorItem(lerNumero(l.qtdTxt) ?? 0, lerNumero(l.custoTxt) ?? 0))}</td>
                        {!pedido && (
                          <td className="acoes-celula">
                            <button className="btn-link" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}>remover</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!pedido && <NovaLinha produtos={produtosQ.data ?? []} aoIncluir={(l) => setLinhas((ls) => [...ls, l])} />}
        </section>

        {totalCent > 0 && (
          <section>
            <h3 className="adm-subtitulo">Pagamento ao fornecedor</h3>
            <p className="nota">Cada parcela vira uma conta a pagar.</p>
            <div className="linha-campos">
              <Campo rotulo="Parcelas">
                <select value={nParcelas} onChange={(e) => setNParcelas(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'À vista (1)' : `${n} parcelas`}</option>)}
                </select>
              </Campo>
              <Campo rotulo={nParcelas === 1 ? 'Vencimento' : '1º vencimento'}>
                <input type="date" value={primeiroVenc} onChange={(e) => setPrimeiroVenc(e.target.value)} />
              </Campo>
              {nParcelas > 1 && (
                <Campo rotulo="Intervalo (dias)">
                  <input inputMode="numeric" value={intervalo} onChange={(e) => setIntervalo(Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1))} />
                </Campo>
              )}
            </div>
            {nParcelas > 1 && (
              <div className="tabela-wrap">
                <table className="tabela">
                  <thead><tr><th className="num">Parcela</th><th>Vencimento</th><th className="num">Valor</th></tr></thead>
                  <tbody>
                    {parcelas.map((p, k) => (
                      <tr key={k}>
                        <td className="num">{k + 1}/{parcelas.length}</td>
                        <td><input type="date" value={p.vencimento}
                                   onChange={(e) => setParcelas((ps) => ps.map((x, j) => (j === k ? { ...x, vencimento: e.target.value } : x)))} /></td>
                        <td className="num"><ValorParcela valor={p.valor}
                                   aoMudar={(v) => setParcelas((ps) => ps.map((x, j) => (j === k ? { ...x, valor: v } : x)))} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {somaParcelas !== totalCent && (
              <p className="erro-texto">As parcelas somam {moeda(somaParcelas / 100)}; o total é {moeda(totalCent / 100)}.</p>
            )}
          </section>
        )}

        <Campo rotulo="Observação (opcional)" largo>
          <textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>
        {erro && <p className="erro-texto">{erro}</p>}
      </div>
    </Modal>
  );
}

function ValorParcela({ valor, aoMudar }: { valor: number; aoMudar: (v: number) => void }) {
  const [txt, setTxt] = useState(escreverNumero(valor));
  useEffect(() => setTxt(escreverNumero(valor)), [valor]);
  return (
    <input className="adm-num" inputMode="decimal" value={txt} aria-label="Valor da parcela"
           onChange={(e) => setTxt(e.target.value)}
           onBlur={() => { const v = lerNumero(txt); if (v !== null && v >= 0) aoMudar(Math.round(v * 100) / 100); else setTxt(escreverNumero(valor)); }} />
  );
}

// Entrada sem pedido: escolher produto e embalagem
function NovaLinha({ produtos, aoIncluir }: { produtos: Produto[]; aoIncluir: (l: Linha) => void }) {
  const [produtoId, setProdutoId] = useState('');
  const [embalagemId, setEmbalagemId] = useState('');
  const ativos = produtos.filter((p) => p.ativo);
  const produto = ativos.find((p) => p.id === produtoId);
  const embalagens = produto ? produto.produto_unidades.filter((u) => u.ativo).sort((a, b) => b.fator - a.fator) : [];

  function incluir() {
    const emb = embalagens.find((e) => e.id === embalagemId);
    if (!produto || !emb) return;
    aoIncluir({
      chave: `${emb.id}-${Date.now()}`, produto_id: produto.id, produto_unidade_id: emb.id, rotulo: emb.rotulo,
      fator: Number(emb.fator), qtdTxt: '', custoTxt: '',
    });
    setProdutoId(''); setEmbalagemId('');
  }

  return (
    <div className="subform">
      <div className="linha-campos">
        <Campo rotulo="Produto">
          <select value={produtoId} onChange={(e) => {
            setProdutoId(e.target.value);
            const pr = ativos.find((p) => p.id === e.target.value);
            const emb = pr?.produto_unidades.filter((u) => u.ativo && u.usa_compra).sort((a, b) => b.fator - a.fator)[0]
                     ?? pr?.produto_unidades.find((u) => u.eh_base);
            setEmbalagemId(emb?.id ?? '');
          }}>
            <option value="">—</option>
            {ativos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Embalagem">
          <select value={embalagemId} disabled={!produto} onChange={(e) => setEmbalagemId(e.target.value)}>
            {embalagens.map((u) => <option key={u.id} value={u.id}>{u.rotulo}{u.eh_base ? '' : ` (${quantidade(u.fator, produto!)})`}</option>)}
          </select>
        </Campo>
      </div>
      <div className="acoes-linha"><button className="btn" disabled={!produto || !embalagemId} onClick={incluir}>Incluir item</button></div>
    </div>
  );
}
