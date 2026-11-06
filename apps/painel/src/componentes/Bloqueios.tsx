// CF-03 (feriados e dias fechados) e AG-07 (bloqueio de horário por profissional).
// Tudo vai para a tabela `bloqueios` (recurso_id nulo = pet shop inteiro).
// O motor de disponibilidade já descarta esses períodos: bot e painel deixam de
// oferecer o horário. Agendamentos que JÁ existem no período não são mexidos:
// o painel avisa o dono antes de salvar e marca o agendamento na agenda.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../contexto/PetshopAtual';
import { agendamentosNoPeriodo, useRecursos } from '../lib/consultas';
import { supabase, dado } from '../lib/supabase';
import { mensagemDeErro } from '../lib/erros';
import { linkWhatsApp, telefone } from '../lib/formato';
import { diaDe, hoje, hora, instante, rotuloDia, rotuloPeriodo, somarDias, type Dia } from '../lib/tempo';
import { TIPO_BLOQUEIO_ROTULO, type AgendamentoLista, type Bloqueio, type TipoBloqueio } from '../lib/tipos';
import { Campo, Modal, useAvisos } from './ui';

const TIPOS_PETSHOP: TipoBloqueio[] = ['feriado', 'outro'];
const TIPOS_PROFISSIONAL: TipoBloqueio[] = ['folga', 'almoco', 'outro', 'manutencao'];

interface Periodo { inicio: string; fim: string }

/** Invalida tudo que depende de bloqueio: agenda, lista e o motor de horários. */
export async function invalidarBloqueios(qc: ReturnType<typeof useQueryClient>, petshopId: string) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: [petshopId, 'bloqueios'] }),
    qc.invalidateQueries({ queryKey: [petshopId, 'disponiveis'] }),
    qc.invalidateQueries({ queryKey: [petshopId, 'proximos_dias'] }),
  ]);
}

export function FormBloqueio(props: {
  diaInicial?: Dia;
  recursoInicial?: string | null;
  aoFechar: () => void;
  aoSalvar?: (dia: Dia) => void;
}) {
  const { petshop } = usePetshop();
  const fuso = petshop.fuso;
  const qc = useQueryClient();
  const avisar = useAvisos();
  const recQ = useRecursos(petshop.id);

  const [alcance, setAlcance] = useState<string>(props.recursoInicial ?? ''); // '' = pet shop inteiro
  const [tipo, setTipo] = useState<TipoBloqueio>(props.recursoInicial ? 'folga' : 'feriado');
  const [diaInteiro, setDiaInteiro] = useState(!props.recursoInicial);
  const [de, setDe] = useState<Dia>(props.diaInicial && props.diaInicial >= hoje(fuso) ? props.diaInicial : hoje(fuso));
  const [ate, setAte] = useState<Dia>(de);
  const [horaIni, setHoraIni] = useState('12:00');
  const [horaFim, setHoraFim] = useState('13:00');
  const [semanas, setSemanas] = useState('0');
  const [motivo, setMotivo] = useState('');
  const [conflitos, setConflitos] = useState<AgendamentoLista[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const tipos = alcance ? TIPOS_PROFISSIONAL : TIPOS_PETSHOP;

  function mudarAlcance(v: string) {
    setAlcance(v);
    setConflitos(null);
    if (!v) { setTipo('feriado'); setDiaInteiro(true); }
    else if (!TIPOS_PROFISSIONAL.includes(tipo)) setTipo('folga');
  }

  function periodos(): Periodo[] | string {
    if (diaInteiro) {
      if (ate < de) return 'A data final é antes da inicial.';
      return [{ inicio: instante(de, '00:00', fuso), fim: instante(somarDias(ate, 1), '00:00', fuso) }];
    }
    if (!horaIni || !horaFim || horaFim <= horaIni) return 'O horário final precisa ser depois do inicial.';
    const n = Number(semanas);
    if (!Number.isInteger(n) || n < 0 || n > 12) return 'Repetição entre 0 e 12 semanas.';
    return Array.from({ length: n + 1 }, (_, i) => {
      const d = somarDias(de, i * 7);
      return { inicio: instante(d, horaIni, fuso), fim: instante(d, horaFim, fuso) };
    });
  }

  async function salvar(ignorarConflitos: boolean) {
    setErro(null);
    const ps = periodos();
    if (typeof ps === 'string') return setErro(ps);
    setSalvando(true);
    try {
      if (!ignorarConflitos) {
        const achados = (await Promise.all(ps.map((p) => agendamentosNoPeriodo(petshop.id, p.inicio, p.fim, alcance || null)))).flat();
        const unicos = [...new Map(achados.map((a) => [a.id, a])).values()];
        if (unicos.length > 0) { setConflitos(unicos); return; }
      }
      dado(await supabase.from('bloqueios').insert(ps.map((p) => ({
        petshop_id: petshop.id,
        recurso_id: alcance || null,
        tipo,
        inicio: p.inicio,
        fim: p.fim,
        motivo: motivo.trim() || null,
      }))));
      await invalidarBloqueios(qc, petshop.id);
      avisar(ps.length > 1 ? `${ps.length} bloqueios criados.` : 'Bloqueio criado.');
      props.aoSalvar?.(de);
      props.aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  const recursos = (recQ.data ?? []).filter((r) => r.ativo);

  return (
    <Modal
      titulo="Bloquear agenda"
      aberto
      aoFechar={props.aoFechar}
      rodape={conflitos ? (
        <>
          <button className="btn" onClick={() => setConflitos(null)}>Voltar</button>
          <button className="btn primario" disabled={salvando} onClick={() => salvar(true)}>Bloquear mesmo assim</button>
        </>
      ) : (
        <>
          <button className="btn" onClick={props.aoFechar}>Cancelar</button>
          <button className="btn primario" disabled={salvando} onClick={() => salvar(false)}>{salvando ? 'Salvando…' : 'Bloquear'}</button>
        </>
      )}
    >
      {conflitos ? (
        <div className="subform">
          <p className="alerta">
            {conflitos.length === 1 ? 'Já existe 1 agendamento' : `Já existem ${conflitos.length} agendamentos`} neste período.
            O bloqueio não cancela nada: depois de salvar, remarque ou cancele cada um e avise o tutor.
          </p>
          <ul className="lista-conflitos">
            {conflitos.map((a) => {
              const tel = a.tutor_petshop?.tutores?.telefone;
              return (
                <li key={a.id}>
                  <b>{rotuloDia(diaDe(a.inicio, fuso), fuso, 'dd/MM')} {hora(a.inicio, fuso)}</b>
                  {' · '}{a.pet_petshop?.pets?.nome} com {a.recursos?.nome}
                  {' · '}{a.tutor_petshop?.nome}{' '}
                  {tel && <a href={linkWhatsApp(tel)} target="_blank" rel="noreferrer">{telefone(tel)}</a>}
                </li>
              );
            })}
          </ul>
          <p className="nota">Esses agendamentos ficam marcados com ⚠ na agenda até serem remarcados ou cancelados.</p>
        </div>
      ) : (
        <div className="subform sem-fundo">
          <div className="linha-campos">
            <Campo rotulo="Para quem">
              <select value={alcance} onChange={(e) => mudarAlcance(e.target.value)}>
                <option value="">Pet shop inteiro (feriado, dia fechado)</option>
                {recursos.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Tipo">
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoBloqueio)}>
                {tipos.map((t) => <option key={t} value={t}>{alcance || t !== 'outro' ? TIPO_BLOQUEIO_ROTULO[t] : 'Fechado'}</option>)}
              </select>
            </Campo>
            <label className="check alinhado">
              <input type="checkbox" checked={diaInteiro} onChange={(e) => { setDiaInteiro(e.target.checked); setConflitos(null); }} />
              Dia inteiro
            </label>
          </div>

          {diaInteiro ? (
            <div className="linha-campos">
              <Campo rotulo="De"><input type="date" value={de} onChange={(e) => { if (e.target.value) { setDe(e.target.value); if (ate < e.target.value) setAte(e.target.value); } }} /></Campo>
              <Campo rotulo="Até (inclusive)"><input type="date" value={ate} min={de} onChange={(e) => e.target.value && setAte(e.target.value)} /></Campo>
            </div>
          ) : (
            <div className="linha-campos">
              <Campo rotulo="Dia"><input type="date" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} /></Campo>
              <Campo rotulo="Das"><input type="time" step={900} value={horaIni} onChange={(e) => setHoraIni(e.target.value)} /></Campo>
              <Campo rotulo="Até"><input type="time" step={900} value={horaFim} onChange={(e) => setHoraFim(e.target.value)} /></Campo>
              <Campo rotulo="Repetir" dica="Mesmo dia e horário nas semanas seguintes">
                <select value={semanas} onChange={(e) => setSemanas(e.target.value)}>
                  <option value="0">Não repetir</option>
                  {[1, 2, 3, 4, 6, 8, 12].map((n) => <option key={n} value={n}>+{n} semana{n > 1 ? 's' : ''}</option>)}
                </select>
              </Campo>
            </div>
          )}

          <Campo rotulo="Motivo (opcional)" largo dica={alcance ? undefined : 'Aparece na agenda. Ex.: Finados, Reforma, Inventário'}>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={alcance ? 'Ex.: consulta médica' : 'Ex.: Finados'} />
          </Campo>
          <p className="nota">Bot e painel deixam de oferecer horários nesse período. O encaixe manual do dono continua possível.</p>
          {erro && <p className="erro-texto">{erro}</p>}
        </div>
      )}
    </Modal>
  );
}

/** Detalhe de um bloqueio clicado na agenda, com opção de remover. */
export function DetalheBloqueio({ bloqueio, aoFechar }: { bloqueio: Bloqueio; aoFechar: () => void }) {
  const { petshop, podeConfigurar } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState(false);

  async function remover() {
    setErro(null); setRemovendo(true);
    try {
      dado(await supabase.from('bloqueios').delete().eq('id', bloqueio.id));
      await invalidarBloqueios(qc, petshop.id);
      avisar('Bloqueio removido. Os horários voltam a ser oferecidos.');
      aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setRemovendo(false);
    }
  }

  return (
    <Modal
      titulo={TIPO_BLOQUEIO_ROTULO[bloqueio.tipo] + (bloqueio.recurso_id ? ` · ${bloqueio.recursos?.nome ?? ''}` : ' · pet shop inteiro')}
      aberto
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn" onClick={aoFechar}>Fechar</button>
          {podeConfigurar && <button className="btn perigo" disabled={removendo} onClick={remover}>Remover bloqueio</button>}
        </>
      }
    >
      <dl className="ficha">
        <dt>Quando</dt><dd>{rotuloPeriodo(bloqueio.inicio, bloqueio.fim, petshop.fuso)}</dd>
        {bloqueio.motivo && (<><dt>Motivo</dt><dd>{bloqueio.motivo}</dd></>)}
      </dl>
      {erro && <p className="erro-texto">{erro}</p>}
    </Modal>
  );
}
