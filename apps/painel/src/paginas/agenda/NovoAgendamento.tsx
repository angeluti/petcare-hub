// Criar agendamento pelo painel: tutor → pet → serviços → dia → horário.
// Os horários vêm do motor do banco (horarios_disponiveis), o mesmo do bot.
// A reserva é reservar_agendamento; se outro usuário (ou o bot) pegou o
// horário entre a listagem e o clique, o banco devolve 23P01 e a lista recarrega.
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import { useHorariosDisponiveis, usePets, useRecursos, useServicos, useTutores } from '../../lib/consultas';
import { reservar } from '../../lib/acoes';
import { ehConflitoDeHorario, mensagemDeErro } from '../../lib/erros';
import { moeda, normalizar, telefone } from '../../lib/formato';
import { supabase, dado } from '../../lib/supabase';
import { hoje, hora, instante, rotuloDia, somarDias, type Dia } from '../../lib/tempo';
import { Campo, Carregando, Modal, useAvisos } from '../../componentes/ui';
import { FormPet, FormTutor } from '../../componentes/Cadastro';

export function NovoAgendamento(props: {
  diaInicial: Dia;
  recursoInicial?: string;
  aoFechar: () => void;
  aoCriar: (dia: Dia) => void;
}) {
  const { petshop, podeConfigurar } = usePetshop();
  const fuso = petshop.fuso;
  const qc = useQueryClient();
  const avisar = useAvisos();

  const tutoresQ = useTutores(petshop.id);
  const petsQ = usePets(petshop.id);
  const servQ = useServicos(petshop.id);
  const recQ = useRecursos(petshop.id);

  const [busca, setBusca] = useState('');
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [novoTutor, setNovoTutor] = useState(false);
  const [petId, setPetId] = useState<string | null>(null);
  const [novoPet, setNovoPet] = useState(false);
  const [servicos, setServicos] = useState<string[]>([]);
  const [dia, setDia] = useState<Dia>(props.diaInicial < hoje(fuso) ? hoje(fuso) : props.diaInicial);
  const [recurso, setRecurso] = useState<string>(props.recursoInicial ?? '');
  const [inicioEscolhido, setInicioEscolhido] = useState<string | null>(null);
  const [encaixe, setEncaixe] = useState(false);
  const [horaEncaixe, setHoraEncaixe] = useState('');
  const [status, setStatus] = useState<'confirmado' | 'pendente'>('confirmado');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const tutores = tutoresQ.data ?? [];
  const tutor = tutores.find((t) => t.tutor_id === tutorId) ?? null;
  const petsDoTutor = (petsQ.data ?? []).filter((p) => p.pets?.tutor_id === tutorId);
  const pet = petsDoTutor.find((p) => p.pet_id === petId)?.pets ?? null;
  const porte = pet?.porte ?? null;
  const ativos = (servQ.data ?? []).filter((s) => s.ativo);
  const recursosAtivos = (recQ.data ?? []).filter((r) => r.ativo);

  const encontrados = useMemo(() => {
    const q = normalizar(busca.trim());
    const dig = busca.replace(/\D/g, '');
    if (!q) return tutores.slice(0, 8);
    return tutores
      .filter((t) => normalizar(t.nome).includes(q) || (dig.length >= 3 && (t.tutores?.telefone ?? '').includes(dig)))
      .slice(0, 8);
  }, [busca, tutores]);

  const escolhidos = ativos.filter((s) => servicos.includes(s.id));
  const totais = escolhidos.reduce(
    (acc, s) => {
      const p = s.servico_precos.find((x) => x.porte === porte);
      return p ? { preco: acc.preco + Number(p.preco), dur: acc.dur + p.duracao_min } : acc;
    },
    { preco: 0, dur: 0 },
  );

  const pronto = !!tutorId && !!petId && servicos.length > 0 && !!porte;

  const diasQ = useQuery({
    queryKey: [petshop.id, 'proximos_dias', servicos.join(','), porte],
    enabled: pronto && !encaixe,
    queryFn: async () =>
      dado<{ dia: string; dia_semana: string; horarios: number }[]>(
        await supabase.rpc('proximos_dias_com_vaga', { p_petshop: petshop.id, p_servicos: servicos, p_porte: porte as string, p_dias: 14 }),
      ),
  });

  const diasComVaga = diasQ.data;

  const horQ = useHorariosDisponiveis({
    petshopId: petshop.id, servicos, porte, dia, recurso: recurso || null, habilitado: pronto && !encaixe,
  });

  // Agrupa por horário: "09:00 — Ana, Bruno"
  const horarios = useMemo(() => {
    const m = new Map<string, { inicio: string; nomes: string[]; vagas: number }>();
    for (const h of horQ.data ?? []) {
      const g = m.get(h.inicio) ?? { inicio: h.inicio, nomes: [], vagas: 0 };
      g.nomes.push(h.recurso_nome);
      g.vagas += h.vagas;
      m.set(h.inicio, g);
    }
    return [...m.values()];
  }, [horQ.data]);

  function alternarServico(id: string) {
    setInicioEscolhido(null);
    setServicos((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function confirmar() {
    setErro(null);
    if (!pronto || !tutorId || !petId) return;
    let inicio = inicioEscolhido;
    if (encaixe) {
      if (!recurso) return setErro('No encaixe, escolha o profissional.');
      if (!horaEncaixe) return setErro('Informe a hora do encaixe.');
      inicio = instante(dia, horaEncaixe, fuso);
    }
    if (!inicio) return setErro('Escolha um horário.');
    setSalvando(true);
    try {
      await reservar({
        petshopId: petshop.id, petId, tutorId, servicos, inicio,
        recurso: recurso || null, observacoes: obs, encaixe, status,
      });
      await qc.invalidateQueries({ queryKey: [petshop.id, 'agendamentos'] });
      avisar(`Agendado: ${pet?.nome} em ${rotuloDia(dia, fuso, 'dd/MM')} às ${hora(inicio, fuso)}.`);
      props.aoCriar(dia);
    } catch (e) {
      if (ehConflitoDeHorario(e)) {
        setInicioEscolhido(null);
        await qc.invalidateQueries({ queryKey: [petshop.id, 'disponiveis'] });
        await qc.invalidateQueries({ queryKey: [petshop.id, 'agendamentos'] });
      }
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  const carregando = tutoresQ.isLoading || petsQ.isLoading || servQ.isLoading || recQ.isLoading;

  return (
    <Modal
      titulo="Novo agendamento"
      aberto
      largo
      aoFechar={props.aoFechar}
      rodape={
        <>
          <span className="rodape-resumo">
            {pronto && <>Total <b>{moeda(totais.preco)}</b> · {totais.dur} min</>}
          </span>
          <button className="btn" onClick={props.aoFechar}>Cancelar</button>
          <button className="btn primario" disabled={!pronto || salvando || (!encaixe && !inicioEscolhido)} onClick={confirmar}>
            {salvando ? 'Reservando…' : 'Confirmar agendamento'}
          </button>
        </>
      }
    >
      {carregando ? <Carregando /> : (
        <div className="passos">
          {/* 1. Tutor */}
          <section className="passo">
            <h3><span className="num">1</span> Tutor</h3>
            {tutor ? (
              <div className="escolhido">
                <div><b>{tutor.nome}</b> <span className="mudo">{telefone(tutor.tutores?.telefone)}</span></div>
                <button className="btn-link" onClick={() => { setTutorId(null); setPetId(null); setInicioEscolhido(null); }}>trocar</button>
              </div>
            ) : novoTutor ? (
              <FormTutor
                petshopId={petshop.id}
                tutores={tutores}
                aoSalvar={(id) => { setTutorId(id); setNovoTutor(false); setNovoPet(true); }}
                aoCancelar={() => setNovoTutor(false)}
              />
            ) : (
              <>
                <input className="busca" placeholder="Buscar por nome ou telefone…" value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
                <div className="opcoes">
                  {encontrados.map((t) => (
                    <button key={t.tutor_id} className="opcao" onClick={() => { setTutorId(t.tutor_id); setPetId(null); }}>
                      <b>{t.nome}</b> <span className="mudo">{telefone(t.tutores?.telefone)}</span>
                    </button>
                  ))}
                  {encontrados.length === 0 && <span className="mudo">Ninguém encontrado.</span>}
                </div>
                <button className="btn" onClick={() => setNovoTutor(true)}>+ Novo tutor</button>
              </>
            )}
          </section>

          {/* 2. Pet */}
          {tutor && (
            <section className="passo">
              <h3><span className="num">2</span> Pet</h3>
              {novoPet ? (
                <FormPet
                  petshopId={petshop.id}
                  tutorId={tutor.tutor_id}
                  aoSalvar={(id) => { setPetId(id); setNovoPet(false); }}
                  aoCancelar={() => setNovoPet(false)}
                />
              ) : (
                <div className="opcoes">
                  {petsDoTutor.map((p) => (
                    <button
                      key={p.pet_id}
                      className={`opcao${p.pet_id === petId ? ' ativo' : ''}`}
                      onClick={() => { setPetId(p.pet_id); setInicioEscolhido(null); }}
                    >
                      <b>{p.pets?.nome}</b> <span className="porte">{p.pets?.porte ?? 'sem porte'}</span>
                      {p.pets?.raca && <span className="mudo"> {p.pets.raca}</span>}
                    </button>
                  ))}
                  <button className="btn" onClick={() => setNovoPet(true)}>+ Novo pet</button>
                </div>
              )}
              {pet && !pet.porte && <p className="erro-texto">Este pet está sem porte. Edite em Tutores e pets antes de agendar.</p>}
              {petsDoTutor.find((p) => p.pet_id === petId)?.temperamento && (
                <p className="alerta">⚠ {petsDoTutor.find((p) => p.pet_id === petId)?.temperamento}</p>
              )}
            </section>
          )}

          {/* 3. Serviços */}
          {pet && porte && (
            <section className="passo">
              <h3><span className="num">3</span> Serviços <span className="mudo">porte {porte}</span></h3>
              <div className="servicos-escolha">
                {ativos.map((s) => {
                  const p = s.servico_precos.find((x) => x.porte === porte);
                  return (
                    <label key={s.id} className={`servico-opcao${!p ? ' indisponivel' : ''}`}>
                      <input type="checkbox" disabled={!p} checked={servicos.includes(s.id)} onChange={() => alternarServico(s.id)} />
                      <span className="servico-nome">{s.nome}{s.adicional && <span className="tag">adicional</span>}</span>
                      <span className="servico-preco">{p ? `${moeda(p.preco)} · ${p.duracao_min} min` : `sem preço p/ ${porte}`}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {/* 4. Dia e horário */}
          {pronto && (
            <section className="passo">
              <h3><span className="num">4</span> Dia e horário</h3>
              <div className="linha-campos">
                <Campo rotulo="Dia">
                  <input type="date" value={dia} onChange={(e) => { if (e.target.value) { setDia(e.target.value); setInicioEscolhido(null); } }} />
                </Campo>
                <Campo rotulo="Profissional">
                  <select value={recurso} onChange={(e) => { setRecurso(e.target.value); setInicioEscolhido(null); }}>
                    <option value="">{encaixe ? 'Escolha…' : 'Qualquer um (o sistema escolhe)'}</option>
                    {recursosAtivos.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                  </select>
                </Campo>
                {podeConfigurar && (
                  <label className="check alinhado">
                    <input type="checkbox" checked={encaixe} onChange={(e) => { setEncaixe(e.target.checked); setInicioEscolhido(null); }} />
                    Encaixe (ignora capacidade e horário)
                  </label>
                )}
              </div>

              {!encaixe && diasComVaga && (
                <div className="dias-chips">
                  {Array.from({ length: 14 }, (_, i) => somarDias(hoje(fuso), i)).map((d) => {
                    const info = diasComVaga.find((x) => x.dia === d);
                    return (
                      <button
                        key={d}
                        className={`dia-chip${d === dia ? ' ativo' : ''}${info ? '' : ' sem-vaga'}`}
                        onClick={() => { setDia(d); setInicioEscolhido(null); }}
                      >
                        <span>{rotuloDia(d, fuso, 'EEE')}</span>
                        <b>{d.slice(8)}</b>
                        <small>{info ? `${info.horarios} hor.` : '—'}</small>
                      </button>
                    );
                  })}
                </div>
              )}

              {encaixe ? (
                <div className="linha-campos">
                  <Campo rotulo="Hora do encaixe" dica={`Duração: ${totais.dur} min. O banco não confere capacidade nem horário de funcionamento.`}>
                    <input type="time" step={300} value={horaEncaixe} onChange={(e) => setHoraEncaixe(e.target.value)} />
                  </Campo>
                </div>
              ) : horQ.isLoading ? (
                <Carregando texto="Consultando horários livres…" />
              ) : horQ.error ? (
                <p className="erro-texto">{mensagemDeErro(horQ.error)}</p>
              ) : horarios.length === 0 ? (
                <p className="mudo">Sem horário livre neste dia para {totais.dur} min. Tente outro dia ou outro profissional.</p>
              ) : (
                <div className="horarios">
                  {horarios.map((h) => (
                    <button
                      key={h.inicio}
                      className={`horario${h.inicio === inicioEscolhido ? ' ativo' : ''}`}
                      onClick={() => setInicioEscolhido(h.inicio)}
                      title={h.nomes.join(', ')}
                    >
                      <b>{hora(h.inicio, fuso)}</b>
                      <small>{recurso ? `${h.vagas} vaga${h.vagas > 1 ? 's' : ''}` : h.nomes.join(', ')}</small>
                    </button>
                  ))}
                </div>
              )}

              <div className="linha-campos">
                <Campo rotulo="Situação">
                  <select value={status} onChange={(e) => setStatus(e.target.value as 'confirmado' | 'pendente')}>
                    <option value="confirmado">Confirmado</option>
                    <option value="pendente">Pendente (aguardando o tutor)</option>
                  </select>
                </Campo>
                <Campo rotulo="Observações" largo>
                  <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: tutor traz o shampoo dele" />
                </Campo>
              </div>
            </section>
          )}

          {erro && <p className="erro-texto destaque">{erro}</p>}
        </div>
      )}
    </Modal>
  );
}
