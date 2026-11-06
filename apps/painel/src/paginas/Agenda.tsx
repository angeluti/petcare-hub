import { useMemo, useState } from 'react';
import { usePetshop } from '../contexto/PetshopAtual';
import { useAgendamentos, useBloqueios, useHorariosFuncionamento, useRecursos } from '../lib/consultas';
import {
  DIAS_CURTOS, diaDaSemana, diaDe, ehMeiaNoite, faixaDoDia, hoje, hora, inicioDaSemana, minutosDeHora, minutosDoDia, rotuloDia,
  rotuloPeriodo, sobrepoe, somarDias, type Dia,
} from '../lib/tempo';
import { moeda } from '../lib/formato';
import {
  STATUS_ROTULO, TIPO_BLOQUEIO_ROTULO, type AgendamentoLista, type Bloqueio, type HorarioFuncionamento, type Recurso,
} from '../lib/tipos';
import { Carregando, Vazio } from '../componentes/ui';
import { NovoAgendamento } from './agenda/NovoAgendamento';
import { DetalheAgendamento } from './agenda/DetalheAgendamento';
import { DetalheBloqueio, FormBloqueio } from '../componentes/Bloqueios';

type Modo = 'dia' | 'semana';
const INATIVOS = ['cancelado', 'no_show'];
const PX_POR_MIN = 1.3;
const SEM_EFEITO = ['cancelado', 'no_show', 'entregue'];

/** Bloqueio que vale para o agendamento (pet shop inteiro ou o profissional dele). */
export function bloqueioDoAgendamento(a: AgendamentoLista, bloqueios: Bloqueio[]): Bloqueio | undefined {
  if (SEM_EFEITO.includes(a.status)) return undefined;
  return bloqueios.find((b) => (!b.recurso_id || b.recurso_id === a.recurso_id) && sobrepoe(a.inicio, a.fim, b.inicio, b.fim));
}

/** Feriado ou dia fechado do pet shop inteiro cobrindo o dia todo. */
function fechamentoDoDia(dia: Dia, fuso: string, bloqueios: Bloqueio[]): Bloqueio | undefined {
  const { de, ate } = faixaDoDia(dia, fuso);
  return bloqueios.find((b) => !b.recurso_id && new Date(b.inicio) <= new Date(de) && new Date(b.fim) >= new Date(ate));
}

export function Agenda() {
  const { petshop, podeConfigurar } = usePetshop();
  const fuso = petshop.fuso;
  const [modo, setModo] = useState<Modo>('dia');
  const [dia, setDia] = useState<Dia>(hoje(fuso));
  const [verCancelados, setVerCancelados] = useState(false);
  const [novo, setNovo] = useState<{ dia: Dia; recurso?: string } | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [novoBloqueio, setNovoBloqueio] = useState<{ dia: Dia; recurso?: string } | null>(null);
  const [bloqueioAberto, setBloqueioAberto] = useState<string | null>(null);

  const inicio = modo === 'dia' ? dia : inicioDaSemana(dia);
  const qtdDias = modo === 'dia' ? 1 : 7;
  const agQ = useAgendamentos(petshop.id, fuso, inicio, qtdDias);
  const recQ = useRecursos(petshop.id);
  const horQ = useHorariosFuncionamento(petshop.id);
  const blqQ = useBloqueios(petshop.id, fuso, inicio, qtdDias);
  const bloqueios = blqQ.data ?? [];

  const todos = agQ.data ?? [];
  const lista = verCancelados ? todos : todos.filter((a) => !INATIVOS.includes(a.status));
  const selecionado = todos.find((a) => a.id === aberto) ?? null;
  const bloqueioSelecionado = bloqueios.find((b) => b.id === bloqueioAberto) ?? null;

  const resumo = useMemo(() => {
    const validos = todos.filter((a) => !INATIVOS.includes(a.status));
    return {
      qtd: validos.length,
      valor: validos.reduce((s, a) => s + Number(a.valor_total), 0),
      cancelados: todos.length - validos.length,
      bot: validos.filter((a) => a.origem === 'bot').length,
      emBloqueio: todos.filter((a) => bloqueioDoAgendamento(a, bloqueios)).length,
    };
  }, [todos, bloqueios]);

  const passo = modo === 'dia' ? 1 : 7;

  return (
    <div className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Agenda</h1>
          <p className="mudo">
            {modo === 'dia'
              ? rotuloDia(dia, fuso)
              : `Semana de ${rotuloDia(inicio, fuso, "d 'de' MMM")} a ${rotuloDia(somarDias(inicio, 6), fuso, "d 'de' MMM")}`}
          </p>
        </div>
        <div className="grupo">
          {podeConfigurar && <button className="btn" onClick={() => setNovoBloqueio({ dia })}>Bloquear horário</button>}
          <button className="btn primario" onClick={() => setNovo({ dia })}>+ Novo agendamento</button>
        </div>
      </header>

      <div className="barra">
        <div className="grupo">
          <button className="btn" onClick={() => setDia(somarDias(dia, -passo))} aria-label="Anterior">‹</button>
          <button className="btn" onClick={() => setDia(hoje(fuso))}>Hoje</button>
          <button className="btn" onClick={() => setDia(somarDias(dia, passo))} aria-label="Próximo">›</button>
          <input type="date" className="data" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} />
        </div>
        <div className="grupo segmentado" role="tablist">
          <button role="tab" aria-selected={modo === 'dia'} className={modo === 'dia' ? 'ativo' : ''} onClick={() => setModo('dia')}>Dia</button>
          <button role="tab" aria-selected={modo === 'semana'} className={modo === 'semana' ? 'ativo' : ''} onClick={() => setModo('semana')}>Semana</button>
        </div>
        <label className="check">
          <input type="checkbox" checked={verCancelados} onChange={(e) => setVerCancelados(e.target.checked)} />
          Mostrar cancelados e faltas
        </label>
      </div>

      <div className="resumo">
        <span><b>{resumo.qtd}</b> agendamento{resumo.qtd === 1 ? '' : 's'}</span>
        <span><b>{moeda(resumo.valor)}</b> previstos</span>
        <span><b>{resumo.bot}</b> pelo bot</span>
        {resumo.cancelados > 0 && <span className="mudo">{resumo.cancelados} cancelado(s)/falta(s)</span>}
        {resumo.emBloqueio > 0 && (
          <span className="alerta pequeno">⚠ {resumo.emBloqueio} em período bloqueado: remarque ou cancele</span>
        )}
        {agQ.isFetching && <span className="mudo">atualizando…</span>}
      </div>

      {agQ.isLoading || recQ.isLoading || horQ.isLoading ? (
        <Carregando />
      ) : agQ.error ? (
        <Vazio>Não foi possível carregar a agenda.</Vazio>
      ) : modo === 'dia' ? (
        <VisaoDia
          dia={dia}
          fuso={fuso}
          agendamentos={lista}
          recursos={recQ.data ?? []}
          horarios={horQ.data ?? []}
          bloqueios={bloqueios}
          aoAbrir={setAberto}
          aoAbrirBloqueio={setBloqueioAberto}
          aoNovo={(recurso) => setNovo({ dia, recurso })}
        />
      ) : (
        <VisaoSemana
          inicio={inicio}
          fuso={fuso}
          agendamentos={lista}
          horarios={horQ.data ?? []}
          bloqueios={bloqueios}
          aoAbrir={setAberto}
          aoAbrirBloqueio={setBloqueioAberto}
          aoVerDia={(d) => { setDia(d); setModo('dia'); }}
        />
      )}

      {novo && (
        <NovoAgendamento
          diaInicial={novo.dia}
          recursoInicial={novo.recurso}
          aoFechar={() => setNovo(null)}
          aoCriar={(d) => { setNovo(null); setDia(d); }}
        />
      )}
      {selecionado && (
        <DetalheAgendamento ag={selecionado} bloqueio={bloqueioDoAgendamento(selecionado, bloqueios)} aoFechar={() => setAberto(null)} />
      )}
      {novoBloqueio && (
        <FormBloqueio
          diaInicial={novoBloqueio.dia}
          recursoInicial={novoBloqueio.recurso}
          aoFechar={() => setNovoBloqueio(null)}
          aoSalvar={(d) => setDia(d)}
        />
      )}
      {bloqueioSelecionado && <DetalheBloqueio bloqueio={bloqueioSelecionado} aoFechar={() => setBloqueioAberto(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------ Dia
function VisaoDia(props: {
  dia: Dia; fuso: string; agendamentos: AgendamentoLista[]; recursos: Recurso[]; horarios: HorarioFuncionamento[];
  bloqueios: Bloqueio[];
  aoAbrir: (id: string) => void; aoAbrirBloqueio: (id: string) => void; aoNovo: (recurso: string) => void;
}) {
  const { dia, fuso, agendamentos, recursos, horarios, bloqueios } = props;
  const fechamento = fechamentoDoDia(dia, fuso, bloqueios);
  const { de: diaIni, ate: diaFim } = faixaDoDia(dia, fuso);
  /** minuto inicial e final do bloqueio dentro deste dia (recortado em 00:00–24:00) */
  const recorte = (b: Bloqueio): [number, number] => [
    new Date(b.inicio) <= new Date(diaIni) ? 0 : minutosDoDia(b.inicio, fuso),
    new Date(b.fim) >= new Date(diaFim) ? 24 * 60 : minutosDoDia(b.fim, fuso),
  ];
  const faixas = horarios.filter((h) => h.dia_semana === diaDaSemana(dia));

  // Janela visível: horário do dia, ampliada para caber encaixes fora dele.
  let ini = faixas.length ? Math.min(...faixas.map((f) => minutosDeHora(f.abre))) : 8 * 60;
  let fim = faixas.length ? Math.max(...faixas.map((f) => minutosDeHora(f.fecha))) : 18 * 60;
  for (const a of agendamentos) {
    ini = Math.min(ini, minutosDoDia(a.inicio, fuso));
    fim = Math.max(fim, Math.min(24 * 60, minutosDoDia(a.inicio, fuso) + duracao(a)));
  }
  ini = Math.floor(ini / 60) * 60;
  fim = Math.ceil(fim / 60) * 60;
  const altura = (fim - ini) * PX_POR_MIN;

  const colunas = recursos.filter((r) => r.ativo || agendamentos.some((a) => a.recurso_id === r.id));
  const fechado = faixas.length === 0;

  // Períodos fechados (antes, entre faixas = almoço, depois)
  const ordenadas = [...faixas].sort((a, b) => a.abre.localeCompare(b.abre));
  const fechados: [number, number][] = [];
  let cursor = ini;
  for (const f of ordenadas) {
    const a = minutosDeHora(f.abre);
    if (a > cursor) fechados.push([cursor, a]);
    cursor = Math.max(cursor, minutosDeHora(f.fecha));
  }
  if (cursor < fim) fechados.push([cursor, fim]);

  const blqDoDia = bloqueios.filter((b) => sobrepoe(b.inicio, b.fim, diaIni, diaFim));
  const agora = dia === hoje(fuso) ? minutosDoDia(new Date().toISOString(), fuso) : null;
  const horas: number[] = [];
  for (let m = ini; m < fim; m += 60) horas.push(m);

  if (colunas.length === 0) {
    return <Vazio>Nenhum profissional cadastrado. Cadastre em Configuração → Profissionais.</Vazio>;
  }

  return (
    <div className="grade-dia">
      {fechamento ? (
        <div className="faixa-aviso">
          {TIPO_BLOQUEIO_ROTULO[fechamento.tipo]}{fechamento.motivo ? `: ${fechamento.motivo}` : ''} · pet shop fechado
          ({rotuloPeriodo(fechamento.inicio, fechamento.fim, fuso)}). Bot e painel não oferecem horários.
        </div>
      ) : fechado && <div className="faixa-aviso">Pet shop fechado neste dia (sem horário de funcionamento).</div>}
      <div className="grade" style={{ gridTemplateColumns: `56px repeat(${colunas.length}, minmax(180px, 1fr))` }}>
        <div className="grade-canto" />
        {colunas.map((r) => (
          <div key={r.id} className="grade-cab">
            <span className="ponto" style={{ background: r.cor ?? undefined }} />
            {r.nome}
            {!r.ativo && <span className="mudo"> (inativo)</span>}
          </div>
        ))}

        <div className="grade-horas" style={{ height: altura }}>
          {horas.map((m) => (
            <span key={m} style={{ top: (m - ini) * PX_POR_MIN }}>{String(m / 60).padStart(2, '0')}:00</span>
          ))}
        </div>

        {colunas.map((r) => {
          const itens = agendamentos.filter((a) => a.recurso_id === r.id);
          const faixasLane = distribuirEmFaixas(itens);
          return (
            <div
              key={r.id}
              className="grade-col"
              style={{ height: altura }}
              onDoubleClick={() => props.aoNovo(r.id)}
              title="Clique duas vezes para agendar com este profissional"
            >
              {horas.map((m) => <div key={m} className="linha-hora" style={{ top: (m - ini) * PX_POR_MIN }} />)}
              {fechados.map(([a, b]) => (
                <div key={a} className="fechado" style={{ top: (a - ini) * PX_POR_MIN, height: (b - a) * PX_POR_MIN }} />
              ))}
              {blqDoDia.filter((b) => !b.recurso_id || b.recurso_id === r.id).map((b) => {
                const [bi, bf] = recorte(b);
                const a = Math.max(bi, ini); const z = Math.min(bf, fim);
                if (z <= a) return null;
                return (
                  <button
                    key={b.id}
                    className="bloqueio"
                    style={{ top: (a - ini) * PX_POR_MIN, height: (z - a) * PX_POR_MIN }}
                    onClick={(e) => { e.stopPropagation(); props.aoAbrirBloqueio(b.id); }}
                    onDoubleClick={(e) => e.stopPropagation()}
                    title={rotuloPeriodo(b.inicio, b.fim, fuso)}
                  >
                    <span className="bloqueio-tipo">{TIPO_BLOQUEIO_ROTULO[b.tipo]}</span>
                    {b.motivo && <span className="bloqueio-motivo">{b.motivo}</span>}
                  </button>
                );
              })}
              {agora !== null && agora >= ini && agora <= fim && (
                <div className="agora" style={{ top: (agora - ini) * PX_POR_MIN }} />
              )}
              {itens.map((a) => {
                const { faixa, total } = faixasLane.get(a.id)!;
                const top = (minutosDoDia(a.inicio, fuso) - ini) * PX_POR_MIN;
                const h = Math.max(duracao(a) * PX_POR_MIN, 26);
                const emBloqueio = bloqueioDoAgendamento(a, bloqueios);
                return (
                  <button
                    key={a.id}
                    className={`bloco st-${a.status}${emBloqueio ? ' em-conflito' : ''}`}
                    style={{ top, height: h, left: `calc(${(faixa / total) * 100}% + 3px)`, width: `calc(${100 / total}% - 6px)` }}
                    onClick={(e) => { e.stopPropagation(); props.aoAbrir(a.id); }}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <span className="bloco-hora">
                      {emBloqueio && <span className="selo-conflito" title={`Em período bloqueado: ${TIPO_BLOQUEIO_ROTULO[emBloqueio.tipo]}`}>⚠ </span>}
                      {hora(a.inicio, fuso)}–{hora(a.fim, fuso)}{a.origem === 'bot' && ' · bot'}{a.encaixe && ' · encaixe'}
                    </span>
                    <span className="bloco-pet">{a.pet_petshop?.pets?.nome ?? 'Pet'} <span className="porte">{a.pet_petshop?.pets?.porte}</span></span>
                    <span className="bloco-serv">{a.agendamento_itens.map((i) => i.descricao).join(' + ')}</span>
                    <span className="bloco-tutor">{a.tutor_petshop?.nome}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <Legenda />
    </div>
  );
}

function duracao(a: AgendamentoLista) {
  return (new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60000;
}

/** Atendimentos simultâneos no mesmo profissional (modo múltiplo) ficam lado a lado. */
function distribuirEmFaixas(itens: AgendamentoLista[]) {
  const ord = [...itens].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const res = new Map<string, { faixa: number; total: number }>();
  let grupo: AgendamentoLista[] = [];
  let fimGrupo = 0;
  let fimFaixas: number[] = [];
  const fecharGrupo = () => {
    for (const g of grupo) res.get(g.id)!.total = fimFaixas.length;
    grupo = []; fimFaixas = [];
  };
  for (const a of ord) {
    const ini = new Date(a.inicio).getTime();
    const fim = new Date(a.fim).getTime();
    if (grupo.length && ini >= fimGrupo) fecharGrupo();
    let faixa = fimFaixas.findIndex((f) => f <= ini);
    if (faixa === -1) { faixa = fimFaixas.length; fimFaixas.push(fim); } else fimFaixas[faixa] = fim;
    res.set(a.id, { faixa, total: 1 });
    grupo.push(a);
    fimGrupo = Math.max(fimGrupo, fim);
  }
  fecharGrupo();
  return res;
}

function Legenda() {
  return (
    <div className="legenda">
      {(['pendente', 'confirmado', 'em_atendimento', 'pronto', 'entregue', 'cancelado', 'no_show'] as const).map((s) => (
        <span key={s} className={`chip st-${s}`}>{STATUS_ROTULO[s]}</span>
      ))}
      <span className="chip chip-bloqueio">Bloqueado</span>
      <span className="mudo">Clique duas vezes numa coluna para agendar com aquele profissional; clique num bloqueio para ver ou remover.</span>
    </div>
  );
}

// ------------------------------------------------------------------ Semana
function VisaoSemana(props: {
  inicio: Dia; fuso: string; agendamentos: AgendamentoLista[]; horarios: HorarioFuncionamento[]; bloqueios: Bloqueio[];
  aoAbrir: (id: string) => void; aoAbrirBloqueio: (id: string) => void; aoVerDia: (d: Dia) => void;
}) {
  const { inicio, fuso, agendamentos, horarios, bloqueios } = props;
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  const hj = hoje(fuso);
  return (
    <div className="semana">
      {dias.map((d) => {
        const doDia = agendamentos.filter((a) => diaDe(a.inicio, fuso) === d);
        const { de: dIni, ate: dFim } = faixaDoDia(d, fuso);
        const blqDia = bloqueios.filter((b) => sobrepoe(b.inicio, b.fim, dIni, dFim));
        const fechamento = fechamentoDoDia(d, fuso, bloqueios);
        const aberto = horarios.some((h) => h.dia_semana === diaDaSemana(d)) && !fechamento;
        const valor = doDia.filter((a) => !INATIVOS.includes(a.status)).reduce((s, a) => s + Number(a.valor_total), 0);
        return (
          <section key={d} className={`semana-dia${d === hj ? ' hoje' : ''}${aberto ? '' : ' fechado-dia'}`}>
            <button className="semana-cab" onClick={() => props.aoVerDia(d)}>
              <span className="semana-dow">{DIAS_CURTOS[diaDaSemana(d)]}</span>
              <span className="semana-num">{d.slice(8)}/{d.slice(5, 7)}</span>
              <span className="semana-info">
                {fechamento ? `${TIPO_BLOQUEIO_ROTULO[fechamento.tipo]}${fechamento.motivo ? ` · ${fechamento.motivo}` : ''}`
                  : aberto ? `${doDia.length} · ${moeda(valor)}` : 'fechado'}
              </span>
            </button>
            <div className="semana-lista">
              {blqDia.filter((b) => b !== fechamento).map((b) => (
                <button key={b.id} className="cartao-bloqueio" onClick={() => props.aoAbrirBloqueio(b.id)}>
                  <b>{TIPO_BLOQUEIO_ROTULO[b.tipo]}</b> {b.recursos?.nome ?? 'pet shop'}
                  <span>{ehMeiaNoite(b.inicio, fuso) && ehMeiaNoite(b.fim, fuso) ? 'dia inteiro' : `${hora(b.inicio, fuso)}–${hora(b.fim, fuso)}`}</span>
                </button>
              ))}
              {doDia.map((a) => (
                <button
                  key={a.id}
                  className={`cartao-ag st-${a.status}${bloqueioDoAgendamento(a, bloqueios) ? ' em-conflito' : ''}`}
                  onClick={() => props.aoAbrir(a.id)}
                >
                  <span className="cartao-ag-hora">{bloqueioDoAgendamento(a, bloqueios) && '⚠ '}{hora(a.inicio, fuso)}</span>
                  <span className="cartao-ag-pet">{a.pet_petshop?.pets?.nome} <span className="porte">{a.pet_petshop?.pets?.porte}</span></span>
                  <span className="cartao-ag-serv">{a.agendamento_itens.map((i) => i.descricao).join(' + ')}</span>
                  <span className="cartao-ag-rec">{a.recursos?.nome}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
