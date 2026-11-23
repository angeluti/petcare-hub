// ES-05 · Avisos de reposição: locais no mínimo ou abaixo dele (com outros
// locais que podem cobrir) e o que faltou nas requisições dos últimos 30 dias.
// Só quantidades: a consulta não traz custo.
import { useMemo, useState } from 'react';
import { NavLink } from 'react-router';
import { usePetshop } from '../../contexto/PetshopAtual';
import { quantidade, useProdutos } from '../../lib/administracao';
import { useAvisosEstoque, useRequisicoes } from '../../lib/movimentos';
import { Carregando, Vazio } from '../../componentes/ui';
import { dataDe } from '../compras/comum';
import { NovaTransferencia } from './AbaTransferencias';

interface Perm { estoque: boolean; config: boolean }

export function AbaAvisos({ perm, aoVerRequisicoes }: { perm: Perm; aoVerRequisicoes: () => void }) {
  const { petshop, tem } = usePetshop();
  const q = useAvisosEstoque(petshop.id);
  const produtosQ = useProdutos(petshop.id);
  const reqQ = useRequisicoes(petshop.id);
  const [transferir, setTransferir] = useState<{ origem: string; destino: string } | null>(null);
  const porId = useMemo(() => new Map((produtosQ.data ?? []).map((p) => [p.id, p])), [produtosQ.data]);
  const numeroReq = (id: string | null) => reqQ.data?.find((r) => r.id === id)?.numero;

  if (q.isLoading || produtosQ.isLoading) return <Carregando />;
  const avisos = q.data ?? [];
  const minimos = avisos.filter((a) => a.tipo === 'abaixo_minimo');
  const faltas = avisos.filter((a) => a.tipo === 'falta_requisicao');

  return (
    <div className="aba-corpo adm-larga">
      {avisos.length === 0 && <Vazio>Nenhum aviso de reposição. Os mínimos ficam no cadastro de cada produto, por local.</Vazio>}

      {minimos.length > 0 && (
        <section>
          <h3 className="adm-subtitulo">No mínimo ou abaixo dele</h3>
          <div className="tabela-wrap">
            <table className="tabela">
              <thead><tr><th>Produto</th><th>Local</th><th className="num">Saldo</th><th className="num">Mínimo</th><th>Pode cobrir</th><th></th></tr></thead>
              <tbody>
                {minimos.map((a) => {
                  const p = porId.get(a.produto_id);
                  if (!p) return null;
                  return (
                    <tr key={`${a.produto_id}-${a.local_id}`}>
                      <td>{a.produto}</td>
                      <td>{a.local}</td>
                      <td className="num"><span className="adm-alerta">{quantidade(Number(a.saldo), p)}</span></td>
                      <td className="num">{quantidade(Number(a.minimo), p)}</td>
                      <td className="adm-pequeno">
                        {a.cobertura.length === 0 ? <span className="mudo">nenhum outro local</span>
                          : a.cobertura.map((c) => <div key={c.local_id}>{c.local}: {quantidade(Number(c.disponivel), p)} acima do mínimo</div>)}
                      </td>
                      <td className="acoes-celula">
                        {a.cobertura.length > 0 && (
                          <button className="btn-link" onClick={() => setTransferir({ origem: a.cobertura[0].local_id, destino: a.local_id })}>pedir transferência</button>
                        )}
                        {perm.estoque && tem('administracao.compras') && <NavLink className="btn-link" to="/compras">comprar</NavLink>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {faltas.length > 0 && (
        <section>
          <h3 className="adm-subtitulo">Faltou nas requisições (últimos 30 dias)</h3>
          <div className="tabela-wrap">
            <table className="tabela">
              <thead><tr><th>Produto</th><th>Local</th><th className="num">Faltou</th><th className="num">Saldo agora</th><th>Requisição</th></tr></thead>
              <tbody>
                {faltas.map((a, k) => {
                  const p = porId.get(a.produto_id);
                  if (!p) return null;
                  return (
                    <tr key={`${a.referencia}-${a.produto_id}-${k}`}>
                      <td>{a.produto}</td>
                      <td>{a.local}</td>
                      <td className="num">{quantidade(Number(a.faltante), p)}</td>
                      <td className="num">{quantidade(Number(a.saldo), p)}</td>
                      <td><button className="btn-link" onClick={aoVerRequisicoes}>nº {numeroReq(a.referencia) ?? '—'}</button> <span className="mudo adm-pequeno">{dataDe(a.ocorrido_em, petshop.fuso)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {transferir && (
        <NovaTransferencia inicial={transferir} aoFechar={() => setTransferir(null)} aoCriar={() => { setTransferir(null); }} />
      )}
    </div>
  );
}
