// RL-02 e RL-03 · Relatórios de agendamento (dono, gerente e super admin).
// Sem metas nem avisos da POC: o acompanhamento da POC é feito fora do app.
// Os números vêm prontos da RPC relatorio_poc (arquivo 17), pela data do
// atendimento no fuso do pet shop. O painel só formata.
import { useState } from 'react';
import { usePetshop } from '../contexto/PetshopAtual';
import { useRelatorio } from '../lib/consultas';
import { mensagemDeErro } from '../lib/erros';
import { hoje, rotuloDia, somarDias, type Dia } from '../lib/tempo';
import type { LinhaRelatorio } from '../lib/tipos';
import { Carregando, Vazio } from '../componentes/ui';

const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

function primeiroDoMes(d: Dia, deslocamento = 0): Dia {
  const [a, m] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1 + deslocamento, 1));
  return dt.toISOString().slice(0, 10);
}

export function Relatorios() {
  const { petshop } = usePetshop();
  const fuso = petshop.fuso;
  const hj = hoje(fuso);
  const [de, setDe] = useState<Dia>(somarDias(hj, -29));
  const [ate, setAte] = useState<Dia>(hj);
  const q = useRelatorio(petshop.id, de, ate);

  const atalhos: [string, Dia, Dia][] = [
    ['7 dias', somarDias(hj, -6), hj],
    ['30 dias', somarDias(hj, -29), hj],
    ['90 dias', somarDias(hj, -89), hj],
    ['Este mês', primeiroDoMes(hj), hj],
    ['Mês passado', primeiroDoMes(hj, -1), somarDias(primeiroDoMes(hj), -1)],
  ];

  const r = q.data;
  const t = r?.totais;

  return (
    <div className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Relatórios</h1>
          <p className="mudo">Agendamentos pela data do atendimento, no fuso do pet shop.</p>
        </div>
      </header>

      <div className="barra">
        <div className="grupo">
          <label className="campo-inline">De <input id="rel-de" type="date" value={de} max={ate} onChange={(e) => e.target.value && setDe(e.target.value)} /></label>
          <label className="campo-inline">até <input id="rel-ate" type="date" value={ate} min={de} onChange={(e) => e.target.value && setAte(e.target.value)} /></label>
        </div>
        <div className="grupo atalhos">
          {atalhos.map(([rotulo, a, b]) => (
            <button key={rotulo} className={`btn${a === de && b === ate ? ' ativo-suave' : ''}`} onClick={() => { setDe(a); setAte(b); }}>{rotulo}</button>
          ))}
        </div>
      </div>

      {q.isLoading ? <Carregando /> : q.error ? (
        <Vazio>{mensagemDeErro(q.error)}</Vazio>
      ) : !r || !t || !t.total ? (
        <Vazio>Nenhum agendamento entre {rotuloDia(de, fuso, 'dd/MM/yyyy')} e {rotuloDia(ate, fuso, 'dd/MM/yyyy')}.</Vazio>
      ) : (
        <>
          {t.sem_desfecho > 0 && (
            <p className="alerta">
              ⚠ {t.sem_desfecho} atendimento{t.sem_desfecho > 1 ? 's' : ''} já passou e segue sem desfecho
              (nem "entregue" nem "não veio"). Marque na agenda para o não comparecimento ficar certo.
            </p>
          )}

          <div className="indicadores">
            <Indicador
              titulo="Agendados pelo bot"
              valor={pct(t.pct_bot)}
              detalhe={`${t.pelo_bot} de ${t.nao_cancelados} não cancelados`}
              estado="neutro"
            />
            <Indicador
              titulo="Não comparecimento"
              valor={pct(t.pct_no_show)}
              detalhe={`${t.no_show} "não veio" em ${t.entregues + t.no_show} atendimentos encerrados`}
              estado="neutro"
            />
            <Indicador
              titulo="Cancelamentos"
              valor={pct(t.pct_cancelamento)}
              detalhe={`${t.cancelados} de ${t.total} · tutor ${t.cancel_tutor} (bot ${t.cancel_tutor_bot}) · pet shop ${t.cancel_petshop}`}
              estado="neutro"
            />
            <Indicador
              titulo="Agendamentos no período"
              valor={t.total.toLocaleString('pt-BR')}
              detalhe={`${t.entregues} entregues · ${t.sem_desfecho} sem desfecho`}
              estado="neutro"
            />
          </div>

          <h2 className="subtitulo">Semana a semana</h2>
          <div className="tabela-wrap">
            <table className="tabela relatorio">
              <thead>
                <tr>
                  <th>Semana</th>
                  <th className="num">Total</th>
                  <th className="num">Pelo bot</th>
                  <th>% bot</th>
                  <th className="num">Entregues</th>
                  <th className="num">Não veio</th>
                  <th className="num">% não veio</th>
                  <th className="num">Cancelados <small>(tutor/pet shop)</small></th>
                  <th className="num">% cancel.</th>
                  <th className="num">Sem desfecho</th>
                </tr>
              </thead>
              <tbody>
                {r.semanas.map((s) => <LinhaSemana key={s.semana} s={s} fuso={fuso} />)}
              </tbody>
              <tfoot>
                <LinhaSemana s={t} fuso={fuso} total />
              </tfoot>
            </table>
          </div>
          <p className="nota">
            % bot = agendamentos com origem no bot ÷ agendamentos não cancelados. Não comparecimento = "não veio" ÷ (entregues + "não veio"),
            só atendimentos que já passaram. Cancelamento = cancelados ÷ total. A semana começa na segunda-feira; a primeira
            e a última podem estar cortadas pelo período escolhido.
          </p>
        </>
      )}
    </div>
  );
}

function Indicador(props: { titulo: string; valor: string; detalhe: string; estado: 'bom' | 'atencao' | 'neutro' }) {
  return (
    <section className={`indicador ind-${props.estado}`}>
      <span className="indicador-titulo">{props.titulo}</span>
      <span className="indicador-valor">{props.valor}</span>
      <span className="indicador-detalhe">{props.detalhe}</span>
    </section>
  );
}

function LinhaSemana({ s, fuso, total }: { s: LinhaRelatorio; fuso: string; total?: boolean }) {
  const largura = Math.min(100, s.pct_bot ?? 0);
  return (
    <tr className={total ? 'linha-total' : ''}>
      <td>{total ? 'Período' : `${rotuloDia(s.semana!, fuso, 'dd/MM')} a ${rotuloDia(somarDias(s.semana!, 6), fuso, 'dd/MM')}`}</td>
      <td className="num">{s.total}</td>
      <td className="num">{s.pelo_bot}</td>
      <td>
        <div className="barra-pct">
          <i style={{ width: `${largura}%` }} />
          <span>{pct(s.pct_bot)}</span>
        </div>
      </td>
      <td className="num">{s.entregues}</td>
      <td className="num">{s.no_show}</td>
      <td className="num">{pct(s.pct_no_show)}</td>
      <td className="num">{s.cancelados}{s.cancelados > 0 && <small className="mudo"> ({s.cancel_tutor}/{s.cancel_petshop})</small>}</td>
      <td className="num">{pct(s.pct_cancelamento)}</td>
      <td className="num">{s.sem_desfecho > 0 ? <span className="selo-conflito">{s.sem_desfecho}</span> : 0}</td>
    </tr>
  );
}
