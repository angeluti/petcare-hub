// FN-03 · Contas a pagar: as geradas pelos recebimentos de compra e os lançamentos manuais.
import { useMemo, useState } from 'react';
import { usePetshop } from '../../contexto/PetshopAtual';
import { useContasPagar, type ContaPagar } from '../../lib/contas';
import { moeda, normalizar } from '../../lib/formato';
import { hoje, somarDias } from '../../lib/tempo';
import { Carregando, Vazio } from '../../componentes/ui';
import { dataCurta } from '../compras/comum';
import { ContaModal, LancarModal, Resumo, situacao } from './comum';

type Filtro = 'abertas' | 'pagas' | 'canceladas' | 'todas';

export function AbaPagar() {
  const { petshop } = usePetshop();
  const q = useContasPagar(petshop.id, true);
  const [filtro, setFiltro] = useState<Filtro>('abertas');
  const [busca, setBusca] = useState('');
  const [lancando, setLancando] = useState(false);
  const [aberta, setAberta] = useState<ContaPagar | null>(null);
  const dia = hoje(petshop.fuso);
  const em7 = somarDias(dia, 7);
  const contas = q.data ?? [];

  const abertas = contas.filter((c) => c.status === 'aberta');
  const vencidas = abertas.filter((c) => c.vencimento < dia);
  const proximas = abertas.filter((c) => c.vencimento >= dia && c.vencimento <= em7);
  const soma = (l: ContaPagar[]) => l.reduce((s, c) => s + Number(c.valor), 0);

  const lista = useMemo(() => {
    const t = normalizar(busca.trim());
    return contas
      .filter((c) => filtro === 'todas' || (filtro === 'abertas' ? c.status === 'aberta' : filtro === 'pagas' ? c.status === 'paga' : c.status === 'cancelada'))
      .filter((c) => !t || [c.descricao, c.fornecedores?.nome, c.documento, c.financeiro_categorias?.nome].some((x) => x && normalizar(x).includes(t)))
      .sort((a, b) => (filtro === 'pagas' ? (b.pago_em ?? '').localeCompare(a.pago_em ?? '') : a.vencimento.localeCompare(b.vencimento)));
  }, [contas, filtro, busca]);

  if (q.isLoading) return <Carregando />;
  return (
    <div className="aba-corpo adm-larga">
      <Resumo itens={[
        { rotulo: 'Vencidas', valor: soma(vencidas), qtd: vencidas.length, destaque: true },
        { rotulo: 'Vencem em 7 dias', valor: soma(proximas), qtd: proximas.length },
        { rotulo: 'Em aberto', valor: soma(abertas), qtd: abertas.length },
      ]} />
      <div className="barra">
        <input className="busca" placeholder="Descrição, fornecedor, documento…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar conta" />
        <div className="segmentado pequeno" role="group" aria-label="Filtro">
          {([['abertas', 'Em aberto'], ['pagas', 'Pagas'], ['canceladas', 'Canceladas'], ['todas', 'Todas']] as [Filtro, string][])
            .map(([v, r]) => <button key={v} className={filtro === v ? 'ativo' : ''} onClick={() => setFiltro(v)}>{r}</button>)}
        </div>
        <button className="btn primario adm-direita" onClick={() => setLancando(true)}>+ Lançar conta</button>
      </div>
      {lista.length === 0 ? <Vazio>{contas.length === 0 ? 'Nenhuma conta a pagar. As compras recebidas entram aqui sozinhas.' : 'Nenhuma conta neste filtro.'}</Vazio> : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Vencimento</th><th>Descrição</th><th>Fornecedor</th><th>Categoria</th><th className="num">Valor</th><th>Situação</th></tr></thead>
            <tbody>
              {lista.map((c) => {
                const s = situacao(c, dia);
                return (
                  <tr key={c.id} className={`clicavel${c.status === 'cancelada' ? ' inativo' : ''}`} onClick={() => setAberta(c)}>
                    <td>{dataCurta(c.vencimento)}</td>
                    <td>{c.descricao}{c.parcelas > 1 && <span className="mudo"> ({c.parcela}/{c.parcelas})</span>}</td>
                    <td>{c.fornecedores?.nome ?? <span className="mudo">—</span>}</td>
                    <td>{c.financeiro_categorias?.nome ?? '—'}</td>
                    <td className="num">{moeda(Number(c.status === 'paga' ? c.valor_pago ?? c.valor : c.valor))}</td>
                    <td><span className={`adm-status ${s.classe}`}>{s.texto}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {lancando && <LancarModal tipo="pagar" aoFechar={() => setLancando(false)} />}
      {aberta && <ContaModal key={aberta.id} tipo="pagar" conta={aberta} aoFechar={() => setAberta(null)} />}
    </div>
  );
}
