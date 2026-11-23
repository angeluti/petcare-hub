// Pedido de compra: rascunho editável (cabeçalho e itens direto na tabela; o banco
// confere o rascunho e preenche embalagem e fator), depois só ações por RPC.
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import {
  erroAdm, escreverNumero, lerNumero, quantidade, useCustos, useFornecedores, useProdutos, type Produto,
} from '../../lib/administracao';
import {
  STATUS_PEDIDO, alterarItemPedido, alterarPedido, apagarRascunho, cancelarPedido, criarPedido, encerrarPedido, enviarPedido,
  incluirItemPedido, quantidadeInvalida, removerItemPedido, useRecebimentos, type ItemPedido, type Pedido,
} from '../../lib/compras';
import { moeda } from '../../lib/formato';
import { Campo, Modal, useAvisos } from '../../componentes/ui';
import { dataDe, pendente, totalPrevisto, valorItem } from './comum';

export function PedidoModal(props: {
  pedido: Pedido | null;
  aoCriar: (id: string) => void;
  aoReceber: (p: Pedido) => void;
  aoFechar: () => void;
}) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const fornecedoresQ = useFornecedores(petshop.id);
  const produtosQ = useProdutos(petshop.id);
  const recebimentosQ = useRecebimentos(petshop.id, !!props.pedido);
  const p = props.pedido;
  const rascunho = !p || p.status === 'rascunho';

  const [fornecedor, setFornecedor] = useState(p?.fornecedor_id ?? '');
  const [prevista, setPrevista] = useState(p?.data_prevista ?? '');
  const [obs, setObs] = useState(p?.observacao ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [acao, setAcao] = useState<'cancelar' | 'encerrar' | 'apagar' | null>(null);
  const [motivo, setMotivo] = useState('');

  const produtos = produtosQ.data ?? [];
  const porId = useMemo(() => new Map(produtos.map((x) => [x.id, x])), [produtos]);
  const fornecedores = (fornecedoresQ.data ?? []).filter((f) => f.ativo || f.id === fornecedor);
  const cabecalhoMudou = !!p && (fornecedor !== p.fornecedor_id || (prevista || null) !== p.data_prevista || (obs.trim() || null) !== p.observacao);

  async function executar(fn: () => Promise<unknown>, ok?: string) {
    setErro(null);
    setOcupado(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: [petshop.id, 'pedidos_compra'] });
      if (ok) avisar(ok);
      return true;
    } catch (e) {
      setErro(erroAdm(e));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function criar() {
    if (!fornecedor) return setErro('Escolha o fornecedor.');
    let id = '';
    const ok = await executar(async () => { id = await criarPedido(petshop.id, fornecedor, prevista || null, obs); });
    if (ok) props.aoCriar(id);
  }

  async function confirmarAcao() {
    if (!p) return;
    if (acao === 'apagar') {
      if (await executar(() => apagarRascunho(p.id), `Rascunho nº ${p.numero} apagado.`)) props.aoFechar();
      return;
    }
    if (!motivo.trim()) return setErro('Informe o motivo.');
    const fn = acao === 'cancelar' ? () => cancelarPedido(p.id, motivo) : () => encerrarPedido(p.id, motivo);
    if (await executar(fn, acao === 'cancelar' ? 'Pedido cancelado.' : 'Pedido encerrado.')) { setAcao(null); setMotivo(''); }
  }

  const recebimentos = (recebimentosQ.data ?? []).filter((r) => r.pedido_id === p?.id);
  const podeReceber = p && (p.status === 'enviado' || p.status === 'recebido_parcial');

  return (
    <Modal
      titulo={p ? `Pedido nº ${p.numero}` : 'Novo pedido de compra'}
      aberto
      largo
      aoFechar={props.aoFechar}
      rodape={
        acao ? (
          <>
            <button className="btn" disabled={ocupado} onClick={() => { setAcao(null); setMotivo(''); setErro(null); }}>Voltar</button>
            <button className="btn perigo" disabled={ocupado} onClick={confirmarAcao}>
              {acao === 'apagar' ? 'Apagar rascunho' : acao === 'cancelar' ? 'Cancelar pedido' : 'Encerrar pedido'}
            </button>
          </>
        ) : (
          <>
            {p && <span className="rodape-resumo">Total previsto: <b>{moeda(totalPrevisto(p))}</b></span>}
            {p?.status === 'rascunho' && <button className="btn" disabled={ocupado} onClick={() => setAcao('apagar')}>Apagar rascunho</button>}
            {p?.status === 'enviado' && <button className="btn" disabled={ocupado} onClick={() => setAcao('cancelar')}>Cancelar pedido</button>}
            {p?.status === 'recebido_parcial' && <button className="btn" disabled={ocupado} onClick={() => setAcao('encerrar')}>Encerrar com o que chegou</button>}
            <button className="btn" onClick={props.aoFechar}>Fechar</button>
            {!p && <button className="btn primario" disabled={ocupado} onClick={criar}>Criar rascunho</button>}
            {p?.status === 'rascunho' && (
              <button className="btn primario" disabled={ocupado || cabecalhoMudou || p.pedido_compra_itens.length === 0}
                      title={cabecalhoMudou ? 'Salve os dados antes de enviar' : undefined}
                      onClick={() => executar(() => enviarPedido(p.id), `Pedido nº ${p.numero} marcado como enviado.`)}>
                Marcar como enviado
              </button>
            )}
            {podeReceber && <button className="btn primario" onClick={() => props.aoReceber(p)}>Registrar recebimento</button>}
          </>
        )
      }
    >
      {acao ? (
        <div className="adm-confirmacao">
          {acao === 'apagar' ? (
            <p>Apagar o rascunho nº {p?.numero} e seus itens? Nada foi enviado nem recebido.</p>
          ) : (
            <>
              <p>{acao === 'cancelar'
                ? 'O pedido sai da lista de pendentes. Nada foi recebido, então o estoque não muda.'
                : 'O pedido fica com o que já chegou; o restante deixa de ser esperado. O estoque e as contas do que chegou continuam.'}</p>
              <Campo rotulo="Motivo" largo>
                <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
              </Campo>
            </>
          )}
          {erro && <p className="erro-texto">{erro}</p>}
        </div>
      ) : (
        <div className="adm-secoes">
          <section>
            {p && (
              <p className="adm-linha-status">
                <span className={`adm-status adm-st-${p.status}`}>{STATUS_PEDIDO[p.status]}</span>
                {p.enviado_em && <span className="mudo"> · enviado em {dataDe(p.enviado_em, petshop.fuso)}</span>}
                {p.motivo && <span className="mudo"> · {p.motivo}</span>}
              </p>
            )}
            <div className="linha-campos">
              <Campo rotulo="Fornecedor">
                <select value={fornecedor} disabled={!rascunho || ocupado} onChange={(e) => setFornecedor(e.target.value)}>
                  <option value="">—</option>
                  {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Entrega prevista (opcional)">
                <input type="date" value={prevista} disabled={!!p && !['rascunho', 'enviado', 'recebido_parcial'].includes(p.status)}
                       onChange={(e) => setPrevista(e.target.value)} />
              </Campo>
            </div>
            <Campo rotulo="Observação (opcional)" largo>
              <textarea rows={2} value={obs} disabled={!!p && ['recebido', 'encerrado', 'cancelado'].includes(p.status)} onChange={(e) => setObs(e.target.value)} />
            </Campo>
            {fornecedores.length === 0 && !p && <p className="nota">Cadastre o fornecedor em Estoque → Fornecedores.</p>}
            {p && cabecalhoMudou && (
              <div className="acoes-linha">
                <button className="btn" disabled={ocupado}
                        onClick={() => executar(() => alterarPedido(p.id, { fornecedor_id: rascunho ? fornecedor : undefined, data_prevista: prevista || null, observacao: obs.trim() || null }), 'Dados do pedido salvos.')}>
                  Salvar dados
                </button>
              </div>
            )}
            {erro && <p className="erro-texto">{erro}</p>}
          </section>

          {p && (
            <section>
              <h3 className="adm-subtitulo">Itens</h3>
              <ItensPedido pedido={p} porId={porId} produtos={produtos} rascunho={rascunho} executar={executar} ocupado={ocupado} />
            </section>
          )}

          {p && recebimentos.length > 0 && (
            <section>
              <h3 className="adm-subtitulo">Recebimentos deste pedido</h3>
              <ul className="adm-lista-simples">
                {recebimentos.map((r) => (
                  <li key={r.id}>Nº {r.numero} · {dataDe(r.recebido_em, petshop.fuso)}{r.nf_numero ? ` · NF ${r.nf_numero}` : ''} · {moeda(Number(r.valor_total))}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

// ================================================================ Itens
function ItensPedido(props: {
  pedido: Pedido;
  porId: Map<string, Produto>;
  produtos: Produto[];
  rascunho: boolean;
  ocupado: boolean;
  executar: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
}) {
  const { petshop } = usePetshop();
  const custosQ = useCustos(petshop.id, true);
  const [produtoId, setProdutoId] = useState('');
  const [embalagemId, setEmbalagemId] = useState('');
  const [qtdTxt, setQtdTxt] = useState('');
  const [custoTxt, setCustoTxt] = useState('');
  const [erroItem, setErroItem] = useState<string | null>(null);

  const compraveis = props.produtos.filter((x) => x.ativo && x.produto_unidades.some((u) => u.ativo && u.usa_compra));
  const produto = props.porId.get(produtoId) ?? null;
  const embalagens = produto ? produto.produto_unidades.filter((u) => u.ativo && u.usa_compra).sort((a, b) => b.fator - a.fator) : [];

  function escolherProduto(id: string) {
    setProdutoId(id);
    const pr = props.porId.get(id);
    const emb = pr?.produto_unidades.filter((u) => u.ativo && u.usa_compra).sort((a, b) => b.fator - a.fator)[0];
    setEmbalagemId(emb?.id ?? '');
    sugerirCusto(id, emb?.fator);
  }

  function sugerirCusto(id: string, fator?: number) {
    const cm = custosQ.data?.get(id);
    setCustoTxt(cm && fator ? escreverNumero(Math.round(cm * fator * 100) / 100) : '');
  }

  async function incluir() {
    setErroItem(null);
    if (!produto || !embalagemId) return setErroItem('Escolha o produto e a embalagem.');
    const emb = embalagens.find((e) => e.id === embalagemId)!;
    const qtd = lerNumero(qtdTxt);
    const erroQtd = quantidadeInvalida(qtd, Number(emb.fator), produto);
    if (erroQtd) return setErroItem(erroQtd);
    const custo = lerNumero(custoTxt) ?? 0;
    if (custo < 0) return setErroItem('Custo inválido.');
    if (props.pedido.pedido_compra_itens.some((i) => i.produto_unidade_id === embalagemId)) {
      return setErroItem('Esta embalagem já está no pedido: altere a quantidade na linha dela.');
    }
    const ok = await props.executar(() => incluirItemPedido(petshop.id, props.pedido.id, embalagemId, qtd!, custo));
    if (ok) { setProdutoId(''); setEmbalagemId(''); setQtdTxt(''); setCustoTxt(''); }
  }

  const itens = [...props.pedido.pedido_compra_itens].sort((a, b) =>
    (props.porId.get(a.produto_id)?.nome ?? '').localeCompare(props.porId.get(b.produto_id)?.nome ?? ''));

  return (
    <>
      {itens.length === 0 ? <p className="mudo">Nenhum item ainda.</p> : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Produto</th><th>Embalagem</th><th className="num">Quantidade</th><th className="num">Custo por embalagem</th><th className="num">Valor</th>
                {!props.rascunho && <th className="num">Recebido</th>}
                {props.rascunho && <th></th>}
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <LinhaItem key={i.id} item={i} produto={props.porId.get(i.produto_id)} rascunho={props.rascunho}
                           ocupado={props.ocupado} executar={props.executar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {props.rascunho && (
        <div className="subform">
          <div className="linha-campos">
            <Campo rotulo="Produto">
              <select value={produtoId} onChange={(e) => escolherProduto(e.target.value)}>
                <option value="">—</option>
                {compraveis.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Embalagem de compra">
              <select value={embalagemId} disabled={!produto}
                      onChange={(e) => { setEmbalagemId(e.target.value); sugerirCusto(produtoId, embalagens.find((x) => x.id === e.target.value)?.fator); }}>
                {embalagens.map((u) => <option key={u.id} value={u.id}>{u.rotulo}{u.eh_base ? '' : ` (${quantidade(u.fator, produto!)})`}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Quantidade">
              <input inputMode={produto?.unidade_base === 'un' ? 'numeric' : 'decimal'} value={qtdTxt} onChange={(e) => setQtdTxt(e.target.value)} />
            </Campo>
            <Campo rotulo="Custo por embalagem (opcional)" dica="Sugestão: custo médio atual">
              <input inputMode="decimal" value={custoTxt} onChange={(e) => setCustoTxt(e.target.value)} placeholder="0,00" />
            </Campo>
          </div>
          <div className="acoes-linha"><button className="btn" disabled={props.ocupado} onClick={incluir}>Incluir item</button></div>
          {compraveis.length === 0 && <p className="nota">Nenhum produto com embalagem de compra. Cadastre em Estoque → Produtos.</p>}
          {erroItem && <p className="erro-texto">{erroItem}</p>}
        </div>
      )}
    </>
  );
}

function LinhaItem(props: {
  item: ItemPedido;
  produto: Produto | undefined;
  rascunho: boolean;
  ocupado: boolean;
  executar: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
}) {
  const i = props.item;
  const [qtdTxt, setQtdTxt] = useState(escreverNumero(Number(i.qtd_pedida)));
  const [custoTxt, setCustoTxt] = useState(escreverNumero(Number(i.custo_previsto)));
  const [erro, setErro] = useState<string | null>(null);
  const nome = props.produto?.nome ?? 'Produto';

  async function salvar() {
    setErro(null);
    const qtd = lerNumero(qtdTxt);
    const custo = lerNumero(custoTxt) ?? 0;
    if (props.produto) {
      const e = quantidadeInvalida(qtd, Number(i.fator), props.produto);
      if (e) return setErro(e);
    }
    if (qtd === Number(i.qtd_pedida) && custo === Number(i.custo_previsto)) return;
    await props.executar(() => alterarItemPedido(i.id, { qtd_pedida: qtd!, custo_previsto: custo }));
  }

  return (
    <tr>
      <td>{nome}{erro && <div className="erro-texto adm-pequeno">{erro}</div>}</td>
      <td>{i.unidade_rotulo}</td>
      {props.rascunho ? (
        <>
          <td className="num"><input className="adm-num" inputMode="decimal" value={qtdTxt} aria-label={`Quantidade de ${nome}`}
                                     onChange={(e) => setQtdTxt(e.target.value)} onBlur={salvar} /></td>
          <td className="num"><input className="adm-num" inputMode="decimal" value={custoTxt} aria-label={`Custo de ${nome}`}
                                     onChange={(e) => setCustoTxt(e.target.value)} onBlur={salvar} /></td>
        </>
      ) : (
        <>
          <td className="num">{escreverNumero(Number(i.qtd_pedida))}</td>
          <td className="num">{moeda(Number(i.custo_previsto))}</td>
        </>
      )}
      <td className="num">{moeda(valorItem(Number(i.qtd_pedida), Number(i.custo_previsto)))}</td>
      {!props.rascunho && (
        <td className="num">
          {escreverNumero(Number(i.qtd_recebida))}
          {pendente(i) > 0 && <span className="mudo adm-pequeno"> (faltam {escreverNumero(pendente(i))})</span>}
        </td>
      )}
      {props.rascunho && (
        <td className="acoes-celula">
          <button className="btn-link" disabled={props.ocupado} onClick={() => props.executar(() => removerItemPedido(i.id))}>remover</button>
        </td>
      )}
    </tr>
  );
}
