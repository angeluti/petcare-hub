// Recebimentos registrados (com pedido ou sem pedido). Só leitura: o que entrou
// no estoque não se edita; correção é por inventário.
import { useMemo, useState } from 'react';
import { usePetshop } from '../../contexto/PetshopAtual';
import { quantidade, useProdutos } from '../../lib/administracao';
import { useRecebimentos, type Recebimento } from '../../lib/compras';
import { moeda, normalizar } from '../../lib/formato';
import { Carregando, Modal, Vazio } from '../../componentes/ui';
import { RecebimentoModal } from './RecebimentoModal';
import { dataDe } from './comum';

export function AbaRecebimentos() {
  const { petshop } = usePetshop();
  const q = useRecebimentos(petshop.id, true);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<Recebimento | null>(null);
  const [avulsa, setAvulsa] = useState(false);
  const todos = q.data ?? [];
  const lista = useMemo(() => {
    const t = normalizar(busca.trim());
    return todos.filter((r) => !t || String(r.numero) === t || (r.nf_numero ?? '').includes(t)
      || normalizar(r.fornecedores?.nome ?? '').includes(t));
  }, [todos, busca]);

  if (q.isLoading) return <Carregando />;
  return (
    <div className="aba-corpo adm-larga">
      <div className="barra">
        <input className="busca" placeholder="Nº, NF ou fornecedor…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar recebimento" />
        <button className="btn adm-direita" onClick={() => setAvulsa(true)}>Entrada sem pedido</button>
      </div>
      {lista.length === 0 ? <Vazio>{todos.length === 0 ? 'Nenhum recebimento ainda.' : 'Nada encontrado.'}</Vazio> : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th className="num">Nº</th><th>Data</th><th>Fornecedor</th><th>Pedido</th><th>NF</th><th>Local</th><th className="num">Valor</th></tr></thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id} className="clicavel" onClick={() => setAberto(r)}>
                  <td className="num">{r.numero}</td>
                  <td>{dataDe(r.recebido_em, petshop.fuso)}</td>
                  <td>{r.fornecedores?.nome ?? <span className="mudo">—</span>}</td>
                  <td>{r.pedidos_compra ? `nº ${r.pedidos_compra.numero}` : <span className="mudo">sem pedido</span>}</td>
                  <td>{r.nf_numero ?? <span className="mudo">—</span>}</td>
                  <td>{r.estoque_locais?.nome ?? '—'}</td>
                  <td className="num">{moeda(Number(r.valor_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {aberto && <DetalheRecebimento recebimento={aberto} aoFechar={() => setAberto(null)} />}
      {avulsa && <RecebimentoModal pedido={null} aoFechar={() => setAvulsa(false)} />}
    </div>
  );
}

function DetalheRecebimento({ recebimento: r, aoFechar }: { recebimento: Recebimento; aoFechar: () => void }) {
  const { petshop } = usePetshop();
  const produtosQ = useProdutos(petshop.id);
  const porId = new Map((produtosQ.data ?? []).map((p) => [p.id, p]));
  return (
    <Modal titulo={`Recebimento nº ${r.numero}`} aberto largo aoFechar={aoFechar}
           rodape={<><span className="rodape-resumo">Total: <b>{moeda(Number(r.valor_total))}</b></span><button className="btn" onClick={aoFechar}>Fechar</button></>}>
      <p className="mudo">
        {dataDe(r.recebido_em, petshop.fuso)}
        {r.fornecedores && ` · ${r.fornecedores.nome}`}
        {r.pedidos_compra ? ` · pedido nº ${r.pedidos_compra.numero}` : ' · sem pedido'}
        {r.nf_numero && ` · NF ${r.nf_numero}`}
        {r.estoque_locais && ` · entrou em ${r.estoque_locais.nome}`}
      </p>
      <div className="tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Produto</th><th className="num">Quantidade</th><th className="num">Entrou no estoque</th><th className="num">Custo por embalagem</th><th className="num">Valor</th></tr></thead>
          <tbody>
            {r.recebimento_itens.map((i) => {
              const p = porId.get(i.produto_id);
              return (
                <tr key={i.id}>
                  <td>{p?.nome ?? 'Produto'}</td>
                  <td className="num">{String(Number(i.quantidade)).replace('.', ',')} {i.unidade_rotulo}</td>
                  <td className="num">{p ? quantidade(Number(i.quantidade) * Number(i.fator), p) : '—'}</td>
                  <td className="num">{moeda(Number(i.custo_unitario))}</td>
                  <td className="num">{moeda(Number(i.valor_total))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {r.observacao && <p className="nota">{r.observacao}</p>}
    </Modal>
  );
}
