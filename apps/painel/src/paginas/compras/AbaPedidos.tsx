// ES-15 · Pedidos de compra: lista, rascunho, envio, recebimento, encerramento e cancelamento.
import { useMemo, useState } from 'react';
import { usePetshop } from '../../contexto/PetshopAtual';
import { STATUS_PEDIDO, PEDIDO_ABERTO, usePedidos, type Pedido } from '../../lib/compras';
import { moeda, normalizar } from '../../lib/formato';
import { Carregando, Vazio } from '../../componentes/ui';
import { PedidoModal } from './PedidoModal';
import { RecebimentoModal } from './RecebimentoModal';
import { dataCurta, percentualRecebido, totalPrevisto } from './comum';

type Filtro = 'abertos' | 'finalizados' | 'todos';

export function AbaPedidos() {
  const { petshop } = usePetshop();
  const q = usePedidos(petshop.id, true);
  const [filtro, setFiltro] = useState<Filtro>('abertos');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | 'novo' | null>(null);
  const [recebendo, setRecebendo] = useState<Pedido | 'avulsa' | null>(null);

  const pedidos = q.data ?? [];
  const lista = useMemo(() => {
    const t = normalizar(busca.trim());
    return pedidos.filter((p) => {
      const aberto = PEDIDO_ABERTO.includes(p.status);
      if (filtro === 'abertos' && !aberto) return false;
      if (filtro === 'finalizados' && aberto) return false;
      return !t || String(p.numero) === t || normalizar(p.fornecedores?.nome ?? '').includes(t);
    });
  }, [pedidos, filtro, busca]);

  if (q.isLoading) return <Carregando />;
  const pedidoAberto = pedidos.find((p) => p.id === aberto) ?? null;

  return (
    <div className="aba-corpo adm-larga">
      <div className="barra">
        <input className="busca" placeholder="Nº ou fornecedor…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar pedido" />
        <div className="segmentado pequeno" role="group" aria-label="Filtro">
          {([['abertos', 'Em aberto'], ['finalizados', 'Finalizados'], ['todos', 'Todos']] as [Filtro, string][])
            .map(([v, r]) => <button key={v} className={filtro === v ? 'ativo' : ''} onClick={() => setFiltro(v)}>{r}</button>)}
        </div>
        <div className="adm-direita adm-botoes">
          <button className="btn" onClick={() => setRecebendo('avulsa')}>Entrada sem pedido</button>
          <button className="btn primario" onClick={() => setAberto('novo')}>+ Novo pedido</button>
        </div>
      </div>

      {lista.length === 0 ? (
        <Vazio>{pedidos.length === 0 ? 'Nenhum pedido de compra ainda.' : 'Nenhum pedido neste filtro.'}</Vazio>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th className="num">Nº</th><th>Fornecedor</th><th>Situação</th><th>Previsto</th><th className="num">Itens</th><th className="num">Total previsto</th><th className="num">Recebido</th></tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className="clicavel" onClick={() => setAberto(p.id)}>
                  <td className="num">{p.numero}</td>
                  <td>{p.fornecedores?.nome ?? '—'}</td>
                  <td><span className={`adm-status adm-st-${p.status}`}>{STATUS_PEDIDO[p.status]}</span></td>
                  <td>{dataCurta(p.data_prevista)}</td>
                  <td className="num">{p.pedido_compra_itens.length}</td>
                  <td className="num">{moeda(totalPrevisto(p))}</td>
                  <td className="num">{p.status === 'rascunho' || p.status === 'cancelado' ? <span className="mudo">—</span> : `${percentualRecebido(p)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aberto && (
        <PedidoModal
          key={aberto}
          pedido={aberto === 'novo' ? null : pedidoAberto}
          aoCriar={(id) => setAberto(id)}
          aoReceber={(p) => { setAberto(null); setRecebendo(p); }}
          aoFechar={() => setAberto(null)}
        />
      )}
      {recebendo && (
        <RecebimentoModal pedido={recebendo === 'avulsa' ? null : recebendo} aoFechar={() => setRecebendo(null)} />
      )}
    </div>
  );
}
