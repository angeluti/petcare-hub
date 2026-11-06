// Detalhe de um agendamento: status, remarcar, observações, cancelar, no-show.
// As transições permitidas espelham private.agendamento_status (o banco recusa as demais).
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import { useHorariosDisponiveis, useRecursos } from '../../lib/consultas';
import { checkin, checkout, mudarStatus, remarcar, salvarObservacoes } from '../../lib/acoes';
import { ehConflitoDeHorario, mensagemDeErro } from '../../lib/erros';
import { linkWhatsApp, moeda, telefone } from '../../lib/formato';
import { diaDe, duracaoMin, hora, instante, rotuloDia, rotuloPeriodo, somarMinutos, type Dia } from '../../lib/tempo';
import { STATUS_ROTULO, TIPO_BLOQUEIO_ROTULO, type AgendamentoLista, type Bloqueio, type StatusAgendamento } from '../../lib/tipos';
import { Campo, Carregando, Modal, useAvisos } from '../../componentes/ui';

type Painel = null | 'remarcar' | 'cancelar' | 'checkout';

export function DetalheAgendamento({ ag, bloqueio, aoFechar }: { ag: AgendamentoLista; bloqueio?: Bloqueio; aoFechar: () => void }) {
  const { petshop, tem, podeConfigurar } = usePetshop();
  const fuso = petshop.fuso;
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [painel, setPainel] = useState<Painel>(null);
  const [obs, setObs] = useState(ag.observacoes ?? '');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pet = ag.pet_petshop?.pets;
  const tel = ag.tutor_petshop?.tutores?.telefone;
  const operacao = tem('spa.operacao_dia');
  const editavel = ag.status === 'pendente' || ag.status === 'confirmado';

  async function executar(fn: () => Promise<void>, msg: string) {
    setErro(null); setOcupado(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: [petshop.id, 'agendamentos'] });
      avisar(msg);
      setPainel(null);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const status = (s: StatusAgendamento, msg: string) => executar(() => mudarStatus(ag, s), msg);

  function marcarNoShow() {
    if (new Date(ag.inicio) > new Date() && !window.confirm('O horário ainda não chegou. Marcar como "não veio" mesmo assim?')) return;
    status('no_show', 'Marcado como não compareceu.');
  }

  return (
    <Modal titulo={`${pet?.nome ?? 'Pet'} · ${hora(ag.inicio, fuso)}`} aberto aoFechar={aoFechar}>
      <div className="detalhe">
        <div className="detalhe-topo">
          <span className={`chip st-${ag.status}`}>{STATUS_ROTULO[ag.status]}</span>
          {ag.origem === 'bot' && <span className="chip">pelo bot</span>}
          {ag.encaixe && <span className="chip">encaixe</span>}
          <span className="chip">pagamento: {ag.pagamento_status}</span>
        </div>

        {bloqueio && (
          <p className="alerta">
            ⚠ Este horário caiu num período bloqueado ({TIPO_BLOQUEIO_ROTULO[bloqueio.tipo]}
            {bloqueio.recurso_id ? ` de ${bloqueio.recursos?.nome ?? 'profissional'}` : ' do pet shop'},{' '}
            {rotuloPeriodo(bloqueio.inicio, bloqueio.fim, petshop.fuso)}{bloqueio.motivo ? `: ${bloqueio.motivo}` : ''}).
            Remarque ou cancele e avise o tutor.
          </p>
        )}
        <dl className="ficha">
          <dt>Quando</dt>
          <dd>{rotuloDia(diaDe(ag.inicio, fuso), fuso)}, {hora(ag.inicio, fuso)}–{hora(ag.fim, fuso)}</dd>
          <dt>Profissional</dt>
          <dd>{ag.recursos?.nome}</dd>
          <dt>Pet</dt>
          <dd>{pet?.nome} <span className="porte">{pet?.porte}</span> {pet?.raca && <span className="mudo">{pet.raca}</span>}</dd>
          {ag.pet_petshop?.temperamento && (<><dt>Atenção</dt><dd className="alerta">{ag.pet_petshop.temperamento}</dd></>)}
          <dt>Tutor</dt>
          <dd>
            {ag.tutor_petshop?.nome}{' '}
            {tel && <a href={linkWhatsApp(tel)} target="_blank" rel="noreferrer">{telefone(tel)}</a>}
          </dd>
          <dt>Serviços</dt>
          <dd>
            <ul className="itens">
              {ag.agendamento_itens.map((i) => (
                <li key={i.id}><span>{i.descricao}</span><span>{moeda(i.valor_total)}</span></li>
              ))}
              <li className="total"><span>Total</span><span>{moeda(ag.valor_total)}</span></li>
            </ul>
          </dd>
          {ag.motivo_cancelamento && (<><dt>Motivo</dt><dd>{ag.motivo_cancelamento}</dd></>)}
        </dl>

        {ag.status !== 'entregue' && (
          <Campo rotulo="Observações" largo>
            <div className="input-com-botao">
              <input value={obs} onChange={(e) => setObs(e.target.value)} />
              <button
                className="btn"
                disabled={ocupado || obs === (ag.observacoes ?? '')}
                onClick={() => executar(() => salvarObservacoes(ag, obs), 'Observações salvas.')}
              >Salvar</button>
            </div>
          </Campo>
        )}

        {painel === null && (
          <div className="acoes-grade">
            {ag.status === 'pendente' && <button className="btn primario" disabled={ocupado} onClick={() => status('confirmado', 'Confirmado.')}>Confirmar</button>}
            {operacao && editavel && <button className="btn primario" disabled={ocupado} onClick={() => executar(() => checkin(ag), 'Atendimento iniciado.')}>Iniciar atendimento</button>}
            {operacao && ag.status === 'em_atendimento' && <button className="btn primario" disabled={ocupado} onClick={() => status('pronto', 'Pet pronto.')}>Pet pronto</button>}
            {operacao && (ag.status === 'em_atendimento' || ag.status === 'pronto') && <button className="btn primario" onClick={() => setPainel('checkout')}>Entregar e receber</button>}
            {editavel && <button className="btn" onClick={() => setPainel('remarcar')}>Remarcar</button>}
            {editavel && <button className="btn perigo" onClick={() => setPainel('cancelar')}>Cancelar</button>}
            {editavel && <button className="btn" disabled={ocupado} onClick={marcarNoShow}>Não veio</button>}
            {ag.status === 'cancelado' && <button className="btn" disabled={ocupado} onClick={() => status('pendente', 'Agendamento reaberto como pendente.')}>Reabrir</button>}
            {ag.status === 'no_show' && <button className="btn" disabled={ocupado} onClick={() => status('confirmado', 'Falta desfeita.')}>Desfazer falta</button>}
          </div>
        )}

        {painel === 'cancelar' && (
          <Cancelar ocupado={ocupado} aoVoltar={() => setPainel(null)}
            aoConfirmar={(motivo) => executar(() => mudarStatus(ag, 'cancelado', motivo), 'Agendamento cancelado.')} />
        )}
        {painel === 'remarcar' && (
          <Remarcar ag={ag} podeEncaixar={podeConfigurar} aoVoltar={() => setPainel(null)}
            aoSalvo={async (dia) => {
              await qc.invalidateQueries({ queryKey: [petshop.id, 'agendamentos'] });
              avisar(`Remarcado para ${rotuloDia(dia, fuso, 'dd/MM')}.`);
              setPainel(null);
            }} />
        )}
        {painel === 'checkout' && (
          <Checkout ag={ag} ocupado={ocupado} aoVoltar={() => setPainel(null)}
            aoConfirmar={(pags, fiado) => executar(() => checkout(ag, pags, fiado), 'Pet entregue.')} />
        )}

        {erro && <p className="erro-texto destaque">{erro}</p>}
      </div>
    </Modal>
  );
}

function Cancelar(props: { ocupado: boolean; aoVoltar: () => void; aoConfirmar: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState('');
  return (
    <div className="subform">
      <Campo rotulo="Motivo do cancelamento (opcional)" largo>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="Ex.: tutor desmarcou por telefone" />
      </Campo>
      <div className="acoes-linha">
        <button className="btn" onClick={props.aoVoltar}>Voltar</button>
        <button className="btn perigo" disabled={props.ocupado} onClick={() => props.aoConfirmar(motivo)}>Cancelar agendamento</button>
      </div>
    </div>
  );
}

function Remarcar(props: { ag: AgendamentoLista; podeEncaixar: boolean; aoVoltar: () => void; aoSalvo: (dia: Dia) => void }) {
  const { ag } = props;
  const { petshop } = usePetshop();
  const fuso = petshop.fuso;
  const recQ = useRecursos(petshop.id);
  const [dia, setDia] = useState<Dia>(diaDe(ag.inicio, fuso));
  const [recurso, setRecurso] = useState('');
  const [escolha, setEscolha] = useState<{ inicio: string; recurso_id: string } | null>(null);
  const [manual, setManual] = useState(false);
  const [horaManual, setHoraManual] = useState(hora(ag.inicio, fuso));
  const [recManual, setRecManual] = useState(ag.recurso_id);
  const [encaixe, setEncaixe] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const servicos = ag.agendamento_itens.map((i) => i.servico_id).filter((x): x is string => !!x);
  const dur = duracaoMin(ag.inicio, ag.fim);
  const horQ = useHorariosDisponiveis({
    petshopId: petshop.id, servicos, porte: ag.pet_petshop?.pets?.porte ?? null, dia, recurso: recurso || null, habilitado: !manual,
  });
  // O próprio agendamento ocupa o horário atual; o motor não o exclui. Para
  // ajustar poucos minutos no mesmo profissional, use "horário manual".
  const opcoes = useMemo(() => horQ.data ?? [], [horQ.data]);

  async function salvar() {
    setErro(null);
    let inicio: string; let rec: string;
    if (manual) {
      if (!horaManual) return setErro('Informe a hora.');
      inicio = instante(dia, horaManual, fuso); rec = recManual;
    } else {
      if (!escolha) return setErro('Escolha um horário.');
      inicio = escolha.inicio; rec = escolha.recurso_id;
    }
    setSalvando(true);
    try {
      await remarcar(ag, inicio, somarMinutos(inicio, dur), rec, manual && encaixe);
      props.aoSalvo(dia);
    } catch (e) {
      setErro(ehConflitoDeHorario(e) && manual && props.podeEncaixar
        ? 'Horário ocupado (capacidade do profissional). Marque "encaixe" para forçar.'
        : mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="subform">
      <div className="linha-campos">
        <Campo rotulo="Novo dia">
          <input type="date" value={dia} onChange={(e) => { if (e.target.value) { setDia(e.target.value); setEscolha(null); } }} />
        </Campo>
        {!manual && (
          <Campo rotulo="Profissional">
            <select value={recurso} onChange={(e) => { setRecurso(e.target.value); setEscolha(null); }}>
              <option value="">Qualquer um</option>
              {(recQ.data ?? []).filter((r) => r.ativo).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </Campo>
        )}
        <label className="check alinhado">
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
          Horário manual
        </label>
      </div>

      {manual ? (
        <div className="linha-campos">
          <Campo rotulo="Hora" dica={`Mantém a duração de ${dur} min.`}>
            <input type="time" step={300} value={horaManual} onChange={(e) => setHoraManual(e.target.value)} />
          </Campo>
          <Campo rotulo="Profissional">
            <select value={recManual} onChange={(e) => setRecManual(e.target.value)}>
              {(recQ.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </Campo>
          {props.podeEncaixar && (
            <label className="check alinhado">
              <input type="checkbox" checked={encaixe} onChange={(e) => setEncaixe(e.target.checked)} />
              Encaixe
            </label>
          )}
        </div>
      ) : horQ.isLoading ? (
        <Carregando texto="Consultando horários…" />
      ) : opcoes.length === 0 ? (
        <p className="mudo">Sem horário livre neste dia.</p>
      ) : (
        <div className="horarios">
          {opcoes.map((h) => (
            <button
              key={h.inicio + h.recurso_id}
              className={`horario${escolha?.inicio === h.inicio && escolha.recurso_id === h.recurso_id ? ' ativo' : ''}`}
              onClick={() => setEscolha({ inicio: h.inicio, recurso_id: h.recurso_id })}
            >
              <b>{hora(h.inicio, fuso)}</b><small>{h.recurso_nome}</small>
            </button>
          ))}
        </div>
      )}
      {erro && <p className="erro-texto">{erro}</p>}
      <div className="acoes-linha">
        <button className="btn" onClick={props.aoVoltar}>Voltar</button>
        <button className="btn primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Remarcar'}</button>
      </div>
    </div>
  );
}

const FORMAS = [
  ['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['debito', 'Débito'], ['credito', 'Crédito'], ['outro', 'Outro'],
] as const;

function Checkout(props: {
  ag: AgendamentoLista; ocupado: boolean; aoVoltar: () => void;
  aoConfirmar: (pags: { forma: string; valor: number }[], fiado: boolean) => void;
}) {
  const [forma, setForma] = useState('pix');
  const [valor, setValor] = useState(String(props.ag.valor_total).replace('.', ','));
  const [fiado, setFiado] = useState(false);
  const num = Number(valor.replace(/\./g, '').replace(',', '.'));
  return (
    <div className="subform">
      <div className="linha-campos">
        <Campo rotulo="Forma">
          <select value={forma} onChange={(e) => setForma(e.target.value)} disabled={fiado}>
            {FORMAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Valor recebido (R$)">
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} disabled={fiado} />
        </Campo>
        <label className="check alinhado">
          <input type="checkbox" checked={fiado} onChange={(e) => setFiado(e.target.checked)} />
          Fiado (paga depois)
        </label>
      </div>
      <div className="acoes-linha">
        <button className="btn" onClick={props.aoVoltar}>Voltar</button>
        <button
          className="btn primario"
          disabled={props.ocupado || (!fiado && !(num > 0))}
          onClick={() => props.aoConfirmar(fiado ? [] : [{ forma, valor: num }], fiado)}
        >Entregar pet</button>
      </div>
    </div>
  );
}
