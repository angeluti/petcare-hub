// Configuração do pet shop (papéis dono/gerente; a RLS "config" garante no banco).
import { useEffect, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../contexto/PetshopAtual';
import { useBotConfig, useHorariosFuncionamento, useRecursos, useServicos } from '../lib/consultas';
import { supabase, dado } from '../lib/supabase';
import { mensagemDeErro } from '../lib/erros';
import { PORTES, celularValido, moeda, normalizarTelefone, telefone } from '../lib/formato';
import { DIAS_SEMANA } from '../lib/tempo';
import type { HorarioFuncionamento, Recurso, Servico } from '../lib/tipos';
import { Campo, Carregando, useAvisos } from '../componentes/ui';
import { AbaPetshop } from './config/AbaPetshop';
import { AbaBloqueios } from './config/AbaBloqueios';
import { AbaAcessos } from './config/AbaAcessos';

type Aba = 'petshop' | 'geral' | 'horarios' | 'bloqueios' | 'profissionais' | 'servicos' | 'bot' | 'acessos';

export function Configuracao() {
  const { tem, papel } = usePetshop();
  const [aba, setAba] = useState<Aba>('petshop');
  const abas: [Aba, string][] = [
    ['petshop', 'Pet shop'],
    ['servicos', 'Serviços e preços'],
    ['horarios', 'Horários'],
    ['bloqueios', 'Feriados e bloqueios'],
    ['profissionais', 'Profissionais'],
    ...(tem('spa.bot') ? ([['bot', 'Bot do WhatsApp']] as [Aba, string][]) : []),
    ['geral', 'Regras da agenda'],
    ...(papel === 'super_admin' ? ([['acessos', 'Acessos']] as [Aba, string][]) : []),
  ];
  return (
    <div className="pagina">
      <header className="pagina-topo"><h1>Configuração</h1></header>
      <nav className="abas" role="tablist">
        {abas.map(([id, rotulo]) => (
          <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? 'ativo' : ''} onClick={() => setAba(id)}>{rotulo}</button>
        ))}
      </nav>
      {aba === 'petshop' && <AbaPetshop />}
      {aba === 'servicos' && <AbaServicos />}
      {aba === 'bloqueios' && <AbaBloqueios />}
      {aba === 'acessos' && <AbaAcessos />}
      {aba === 'horarios' && <AbaHorarios />}
      {aba === 'profissionais' && <AbaProfissionais />}
      {aba === 'bot' && <AbaBot />}
      {aba === 'geral' && <AbaGeral />}
    </div>
  );
}

// ================================================================ Serviços
type PrecoForm = Record<string, { preco: string; duracao: string }>;

function AbaServicos() {
  const { petshop } = usePetshop();
  const q = useServicos(petshop.id);
  const [aberto, setAberto] = useState<string | 'novo' | null>(null);
  if (q.isLoading) return <Carregando />;
  const servicos = q.data ?? [];
  return (
    <div className="aba-corpo">
      <p className="mudo">
        Preço e duração por porte. A duração alimenta o motor de horários (bot e painel).
        As durações do seed são suposição: ajuste com o tempo real medido.
      </p>
      <div className="tabela-wrap">
        <table className="tabela">
          <thead>
            <tr><th>Serviço</th>{PORTES.map((p) => <th key={p} className="num">{p}</th>)}<th>Bot</th><th></th></tr>
          </thead>
          <tbody>
            {servicos.map((s) => (
              aberto === s.id ? (
                <tr key={s.id}><td colSpan={PORTES.length + 3}><FormServico servico={s} aoFechar={() => setAberto(null)} /></td></tr>
              ) : (
                <tr key={s.id} className={s.ativo ? '' : 'inativo'}>
                  <td><b>{s.nome}</b>{s.adicional && <span className="tag">adicional</span>}{!s.ativo && <span className="tag">inativo</span>}</td>
                  {PORTES.map((p) => {
                    const x = s.servico_precos.find((y) => y.porte === p);
                    return <td key={p} className="num">{x ? <>{moeda(x.preco)}<br /><small className="mudo">{x.duracao_min} min</small></> : <span className="mudo">—</span>}</td>;
                  })}
                  <td>{s.disponivel_bot ? 'sim' : 'não'}</td>
                  <td><button className="btn-link" onClick={() => setAberto(s.id)}>editar</button></td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
      {aberto === 'novo'
        ? <div className="cartao"><FormServico aoFechar={() => setAberto(null)} /></div>
        : <button className="btn" onClick={() => setAberto('novo')}>+ Novo serviço</button>}
    </div>
  );
}

function FormServico({ servico, aoFechar }: { servico?: Servico; aoFechar: () => void }) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [nome, setNome] = useState(servico?.nome ?? '');
  const [adicional, setAdicional] = useState(servico?.adicional ?? false);
  const [bot, setBot] = useState(servico?.disponivel_bot ?? true);
  const [ativo, setAtivo] = useState(servico?.ativo ?? true);
  const [precos, setPrecos] = useState<PrecoForm>(() => {
    const f: PrecoForm = {};
    for (const p of PORTES) {
      const x = servico?.servico_precos.find((y) => y.porte === p);
      f[p] = { preco: x ? String(x.preco).replace('.', ',') : '', duracao: x ? String(x.duracao_min) : '' };
    }
    return f;
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro('Informe o nome.');
    const linhas: { porte: string; preco: number; duracao_min: number }[] = [];
    const apagar: string[] = [];
    for (const p of PORTES) {
      const { preco, duracao } = precos[p];
      if (!preco.trim() && !duracao.trim()) { apagar.push(p); continue; }
      const v = Number(preco.replace(/\./g, '').replace(',', '.'));
      const d = Number(duracao);
      if (!(v >= 0) || !preco.trim()) return setErro(`Preço inválido no porte ${p}.`);
      if (!Number.isInteger(d) || d <= 0 || d % 5 !== 0) return setErro(`Duração do porte ${p} deve ser múltipla de 5 min.`);
      linhas.push({ porte: p, preco: v, duracao_min: d });
    }
    if (linhas.length === 0) return setErro('Preencha preço e duração de pelo menos um porte.');
    setSalvando(true);
    try {
      let id = servico?.id;
      if (id) {
        dado(await supabase.from('servicos').update({ nome: nome.trim(), adicional, disponivel_bot: bot, ativo }).eq('id', id));
      } else {
        const novo = dado<{ id: string }>(
          await supabase.from('servicos')
            .insert({ petshop_id: petshop.id, nome: nome.trim(), adicional, disponivel_bot: bot, ativo, tipo: 'estetica' })
            .select('id').single(),
        );
        id = novo.id;
      }
      dado(await supabase.from('servico_precos').upsert(
        linhas.map((l) => ({ ...l, servico_id: id!, petshop_id: petshop.id })),
        { onConflict: 'servico_id,porte' },
      ));
      if (apagar.length && servico) {
        dado(await supabase.from('servico_precos').delete().eq('servico_id', id!).in('porte', apagar));
      }
      await qc.invalidateQueries({ queryKey: [petshop.id, 'servicos'] });
      avisar('Serviço salvo.');
      aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="subform">
      <div className="linha-campos">
        <Campo rotulo="Nome do serviço"><input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus={!servico} /></Campo>
        <label className="check alinhado"><input type="checkbox" checked={adicional} onChange={(e) => setAdicional(e.target.checked)} /> Adicional (hidratação, unha…)</label>
        <label className="check alinhado"><input type="checkbox" checked={bot} onChange={(e) => setBot(e.target.checked)} /> Oferecer no bot</label>
        <label className="check alinhado"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo</label>
      </div>
      <div className="grade-precos">
        <span />
        <span className="mudo">Preço (R$)</span>
        <span className="mudo">Duração (min)</span>
        {PORTES.map((p) => (
          <div key={p} className="contents">
            <b>{p}</b>
            <input inputMode="decimal" value={precos[p].preco} onChange={(e) => setPrecos({ ...precos, [p]: { ...precos[p], preco: e.target.value } })} />
            <input inputMode="numeric" step={5} value={precos[p].duracao} onChange={(e) => setPrecos({ ...precos, [p]: { ...precos[p], duracao: e.target.value } })} />
          </div>
        ))}
      </div>
      <p className="nota">Deixe preço e duração em branco para não atender aquele porte.</p>
      {erro && <p className="erro-texto">{erro}</p>}
      <div className="acoes-linha">
        <button className="btn" onClick={aoFechar}>Cancelar</button>
        <button className="btn primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar serviço'}</button>
      </div>
    </div>
  );
}

// ================================================================ Horários
type FaixaForm = { id?: string; abre: string; fecha: string };

function AbaHorarios() {
  const { petshop } = usePetshop();
  const q = useHorariosFuncionamento(petshop.id);
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [dias, setDias] = useState<FaixaForm[][]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const dados = q.data;
    if (!dados) return;
    setDias(Array.from({ length: 7 }, (_, d) =>
      dados.filter((h) => h.dia_semana === d).map((h) => ({ id: h.id, abre: h.abre.slice(0, 5), fecha: h.fecha.slice(0, 5) }))));
  }, [q.data]);

  if (q.isLoading || dias.length === 0) return <Carregando />;

  const mudar = (d: number, fn: (f: FaixaForm[]) => FaixaForm[]) => setDias(dias.map((x, i) => (i === d ? fn(x) : x)));

  async function salvar() {
    setErro(null);
    for (let d = 0; d < 7; d++) {
      const ord = [...dias[d]].sort((a, b) => a.abre.localeCompare(b.abre));
      for (let i = 0; i < ord.length; i++) {
        if (!ord[i].abre || !ord[i].fecha || ord[i].fecha <= ord[i].abre) return setErro(`${DIAS_SEMANA[d]}: cada faixa precisa fechar depois de abrir.`);
        if (i > 0 && ord[i].abre < ord[i - 1].fecha) return setErro(`${DIAS_SEMANA[d]}: faixas sobrepostas.`);
      }
    }
    const atuais = q.data as HorarioFuncionamento[];
    const mantidos = new Set(dias.flat().map((f) => f.id).filter(Boolean));
    const remover = atuais.filter((h) => !mantidos.has(h.id)).map((h) => h.id);
    const novos = dias.flatMap((fs, d) => fs.filter((f) => !f.id).map((f) => ({ petshop_id: petshop.id, dia_semana: d, abre: f.abre, fecha: f.fecha })));
    const alterados = dias.flat().filter((f) => {
      if (!f.id) return false;
      const o = atuais.find((h) => h.id === f.id)!;
      return o.abre.slice(0, 5) !== f.abre || o.fecha.slice(0, 5) !== f.fecha;
    });
    setSalvando(true);
    try {
      // Ordem segura: apaga o que saiu, altera, insere. Uma falha no meio
      // deixa o dia parcialmente salvo; a tela recarrega o estado real.
      if (remover.length) dado(await supabase.from('horarios_funcionamento').delete().in('id', remover));
      for (const f of alterados) {
        dado(await supabase.from('horarios_funcionamento').update({ abre: f.abre, fecha: f.fecha }).eq('id', f.id!));
      }
      if (novos.length) dado(await supabase.from('horarios_funcionamento').insert(novos));
      avisar('Horários salvos.');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      await qc.invalidateQueries({ queryKey: [petshop.id, 'horarios_funcionamento'] });
      setSalvando(false);
    }
  }

  // Exibe segunda → domingo
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="aba-corpo">
      <p className="mudo">Use duas faixas para o intervalo de almoço (ex.: 08:00–12:00 e 13:00–18:00). Dia sem faixa = fechado. Feriados e folgas entram como bloqueio (próxima etapa).</p>
      <div className="horarios-semana">
        {ordem.map((d) => (
          <div key={d} className="horario-dia">
            <span className="horario-dia-nome">{DIAS_SEMANA[d]}</span>
            <div className="faixas">
              {dias[d].length === 0 && <span className="mudo">fechado</span>}
              {dias[d].map((f, i) => (
                <span key={f.id ?? `n${i}`} className="faixa">
                  <input type="time" step={900} value={f.abre} onChange={(e) => mudar(d, (x) => x.map((y, j) => (j === i ? { ...y, abre: e.target.value } : y)))} />
                  <span>até</span>
                  <input type="time" step={900} value={f.fecha} onChange={(e) => mudar(d, (x) => x.map((y, j) => (j === i ? { ...y, fecha: e.target.value } : y)))} />
                  <button className="btn-icone" aria-label="Remover faixa" onClick={() => mudar(d, (x) => x.filter((_, j) => j !== i))}>×</button>
                </span>
              ))}
              <button className="btn-link" onClick={() => mudar(d, (x) => [...x, { abre: x.length ? '13:00' : '08:00', fecha: x.length ? '18:00' : '12:00' }])}>+ faixa</button>
            </div>
          </div>
        ))}
      </div>
      {erro && <p className="erro-texto">{erro}</p>}
      <div className="acoes-linha">
        <button className="btn primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar horários'}</button>
      </div>
    </div>
  );
}

// ================================================================ Profissionais
function AbaProfissionais() {
  const { petshop, tem } = usePetshop();
  const recQ = useRecursos(petshop.id);
  const servQ = useServicos(petshop.id);
  const [aberto, setAberto] = useState<string | 'novo' | null>(null);
  if (recQ.isLoading || servQ.isLoading) return <Carregando />;
  const multiplo = petshop.modo_capacidade === 'multiplo' && tem('spa.agenda_capacidade');
  const servicos = servQ.data ?? [];
  return (
    <div className="aba-corpo">
      <p className="mudo">
        Cada profissional é uma coluna da agenda. Sem serviços marcados, ele faz todos.
        {multiplo ? ' Modo múltiplo: defina quantos pets ao mesmo tempo e o intervalo entre entradas.' : ''}
      </p>
      {(recQ.data ?? []).map((r) => (
        aberto === r.id
          ? <div key={r.id} className="cartao"><FormRecurso recurso={r} servicos={servicos} multiplo={multiplo} aoFechar={() => setAberto(null)} /></div>
          : (
            <div key={r.id} className={`linha-item${r.ativo ? '' : ' inativo'}`}>
              <span className="ponto" style={{ background: r.cor ?? undefined }} />
              <b>{r.nome}</b>
              {multiplo && <span className="mudo">até {r.capacidade} pet(s) · {r.intervalo_entrada_min} min entre entradas</span>}
              <span className="mudo">
                {r.recurso_servicos.length === 0 ? 'todos os serviços'
                  : r.recurso_servicos.map((x) => servicos.find((s) => s.id === x.servico_id)?.nome).filter(Boolean).join(', ')}
              </span>
              {!r.ativo && <span className="tag">inativo</span>}
              <button className="btn-link" onClick={() => setAberto(r.id)}>editar</button>
            </div>
          )
      ))}
      {aberto === 'novo'
        ? <div className="cartao"><FormRecurso servicos={servicos} multiplo={multiplo} aoFechar={() => setAberto(null)} /></div>
        : <button className="btn" onClick={() => setAberto('novo')}>+ Novo profissional</button>}
    </div>
  );
}

function FormRecurso(props: { recurso?: Recurso; servicos: Servico[]; multiplo: boolean; aoFechar: () => void }) {
  const { recurso, servicos, multiplo } = props;
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [nome, setNome] = useState(recurso?.nome ?? '');
  const [cor, setCor] = useState(recurso?.cor ?? '#2f7d6d');
  const [ativo, setAtivo] = useState(recurso?.ativo ?? true);
  const [capacidade, setCapacidade] = useState(String(recurso?.capacidade ?? 1));
  const [intervalo, setIntervalo] = useState(String(recurso?.intervalo_entrada_min ?? 0));
  const [faz, setFaz] = useState<string[]>(recurso?.recurso_servicos.map((x) => x.servico_id) ?? []);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro('Informe o nome.');
    const cap = Number(capacidade); const int = Number(intervalo);
    if (!Number.isInteger(cap) || cap < 1 || cap > 20) return setErro('Capacidade entre 1 e 20.');
    if (!Number.isInteger(int) || int < 0 || int > 240) return setErro('Intervalo entre 0 e 240 min.');
    setSalvando(true);
    try {
      const campos = { nome: nome.trim(), cor, ativo, capacidade: cap, intervalo_entrada_min: int };
      let id = recurso?.id;
      if (id) dado(await supabase.from('recursos').update(campos).eq('id', id));
      else {
        id = dado<{ id: string }>(await supabase.from('recursos').insert({ ...campos, petshop_id: petshop.id, tipo: 'profissional' }).select('id').single()).id;
      }
      const antes = recurso?.recurso_servicos.map((x) => x.servico_id) ?? [];
      const tirar = antes.filter((s) => !faz.includes(s));
      const por = faz.filter((s) => !antes.includes(s));
      if (tirar.length) dado(await supabase.from('recurso_servicos').delete().eq('recurso_id', id!).in('servico_id', tirar));
      if (por.length) dado(await supabase.from('recurso_servicos').insert(por.map((s) => ({ recurso_id: id!, servico_id: s, petshop_id: petshop.id }))));
      await qc.invalidateQueries({ queryKey: [petshop.id, 'recursos'] });
      avisar('Profissional salvo.');
      props.aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="subform">
      <div className="linha-campos">
        <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="Cor na agenda"><input type="color" value={cor} onChange={(e) => setCor(e.target.value)} /></Campo>
        <label className="check alinhado"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo</label>
      </div>
      {multiplo && (
        <div className="linha-campos">
          <Campo rotulo="Pets ao mesmo tempo"><input inputMode="numeric" value={capacidade} onChange={(e) => setCapacidade(e.target.value)} /></Campo>
          <Campo rotulo="Minutos entre entradas" dica="Ex.: 30 = começa o 2º pet enquanto o 1º seca">
            <input inputMode="numeric" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
          </Campo>
        </div>
      )}
      <Campo rotulo="Serviços que faz (nenhum marcado = todos)" largo>
        <div className="checks">
          {servicos.filter((s) => s.ativo).map((s) => (
            <label key={s.id} className="check">
              <input type="checkbox" checked={faz.includes(s.id)} onChange={(e) => setFaz(e.target.checked ? [...faz, s.id] : faz.filter((x) => x !== s.id))} />
              {s.nome}
            </label>
          ))}
        </div>
      </Campo>
      {erro && <p className="erro-texto">{erro}</p>}
      <div className="acoes-linha">
        <button className="btn" onClick={props.aoFechar}>Cancelar</button>
        <button className="btn primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div>
  );
}

// ================================================================ Bot
function AbaBot() {
  const { petshop } = usePetshop();
  const q = useBotConfig(petshop.id, true);
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [nome, setNome] = useState('');
  const [saudacao, setSaudacao] = useState('');
  const [pausa, setPausa] = useState('4');
  const [avisos, setAvisos] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (q.data) {
      setNome(q.data.nome_bot); setSaudacao(q.data.saudacao); setPausa(String(q.data.pausa_humana_horas));
      setAvisos(q.data.telefone_avisos ? telefone(q.data.telefone_avisos) : '');
    }
  }, [q.data]);

  if (q.isLoading) return <Carregando />;
  if (!q.data) return <p className="mudo">O bot deste pet shop ainda não foi configurado pela equipe PetCare Hub.</p>;

  const previa = saudacao.replaceAll('{bot}', nome || 'Assistente').replaceAll('{petshop}', petshop.nome);

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro('Dê um nome ao bot.');
    const h = Number(pausa);
    if (!Number.isInteger(h) || h < 1 || h > 72) return setErro('Pausa entre 1 e 72 horas.');
    let celAvisos: string | null = null;
    if (avisos.trim()) {
      celAvisos = normalizarTelefone(avisos);
      if (!celularValido(celAvisos)) return setErro('Celular para avisos inválido. Use DDD + celular com 9 dígitos, ex.: (19) 99123-4567.');
      if (celAvisos === petshop.telefone_wp) return setErro('O celular para avisos precisa ser diferente do WhatsApp do pet shop (o do bot).');
    }
    setSalvando(true);
    try {
      dado(await supabase.from('bot_config')
        .update({ nome_bot: nome.trim(), saudacao: saudacao.trim(), pausa_humana_horas: h, telefone_avisos: celAvisos })
        .eq('petshop_id', petshop.id));
      await qc.invalidateQueries({ queryKey: [petshop.id, 'bot_config'] });
      avisar('Bot atualizado.');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="aba-corpo">
      <div className="bot-status">
        <span className={`chip ${q.data.ativo ? 'st-confirmado' : ''}`}>{q.data.ativo ? 'Bot ligado' : 'Bot desligado'}</span>
        <span className="chip">canal: {q.data.canal === 'zapi' ? 'Z-API' : 'API oficial'}</span>
        <span className="chip">conexão: {q.data.conexao_status}</span>
        <span className="mudo">Ligar o bot e conectar o WhatsApp é feito pela equipe PetCare Hub.</span>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Nome do bot"><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Luna" /></Campo>
        <Campo rotulo="Pausa após atendimento humano (h)" dica="Quando você responde pelo celular, o bot espera esse tempo">
          <input inputMode="numeric" value={pausa} onChange={(e) => setPausa(e.target.value)} />
        </Campo>
      </div>
      <Campo
        rotulo="Celular para avisos"
        largo
        dica="Seu celular pessoal, diferente do WhatsApp do pet shop. Recebe os avisos do bot: tutor pedindo atendente, cancelamento e agendamento em período bloqueado."
      >
        <input id="bot-avisos" inputMode="tel" value={avisos} onChange={(e) => setAvisos(e.target.value)} placeholder="(19) 99123-4567" />
      </Campo>
      <Campo rotulo="Saudação" largo dica="Use {bot} e {petshop} para inserir os nomes.">
        <textarea rows={2} value={saudacao} onChange={(e) => setSaudacao(e.target.value)} />
      </Campo>
      <div className="previa-whats">
        <span className="previa-rotulo">Prévia no WhatsApp</span>
        <div className="balao">{previa}</div>
      </div>
      {erro && <p className="erro-texto">{erro}</p>}
      <div className="acoes-linha">
        <button className="btn primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar bot'}</button>
      </div>
    </div>
  );
}

// ================================================================ Regras da agenda
function AbaGeral() {
  const { petshop, tem } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [f, setF] = useState({
    intervalo_slot_min: String(petshop.intervalo_slot_min),
    antecedencia_min_minutos: String(petshop.antecedencia_min_minutos),
    antecedencia_max_dias: String(petshop.antecedencia_max_dias),
    cancelamento_min_horas: String(petshop.cancelamento_min_horas),
    modo_capacidade: petshop.modo_capacidade,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const podeMultiplo = tem('spa.agenda_capacidade');

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      dado(await supabase.from('petshops').update({
        intervalo_slot_min: Number(f.intervalo_slot_min),
        antecedencia_min_minutos: Number(f.antecedencia_min_minutos),
        antecedencia_max_dias: Number(f.antecedencia_max_dias),
        cancelamento_min_horas: Number(f.cancelamento_min_horas),
        modo_capacidade: podeMultiplo ? f.modo_capacidade : 'simples',
      }).eq('id', petshop.id));
      await qc.invalidateQueries({ queryKey: ['vinculos'] });
      avisar('Regras salvas.');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  const num = (k: keyof typeof f) => ({ value: f[k], onChange: (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }) });

  return (
    <div className="aba-corpo">
      <div className="linha-campos">
        <Campo rotulo="Grade de horários" dica="De quanto em quanto tempo o motor oferece horários">
          <select value={f.intervalo_slot_min} onChange={(e) => setF({ ...f, intervalo_slot_min: e.target.value })}>
            {[10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </Campo>
        <Campo rotulo="Antecedência mínima (min)" dica="Só para o bot"><input inputMode="numeric" {...num('antecedencia_min_minutos')} /></Campo>
        <Campo rotulo="Agenda aberta até (dias)" dica="Só para o bot"><input inputMode="numeric" {...num('antecedencia_max_dias')} /></Campo>
        <Campo rotulo="Cancelamento pelo bot até (h antes)"><input inputMode="numeric" {...num('cancelamento_min_horas')} /></Campo>
      </div>
      <Campo rotulo="Modo da agenda" largo dica={podeMultiplo ? 'Múltiplo: até X pets por profissional, com entrada escalonada.' : 'O modo múltiplo faz parte do plano Profissional.'}>
        <select value={f.modo_capacidade} disabled={!podeMultiplo} onChange={(e) => setF({ ...f, modo_capacidade: e.target.value as 'simples' | 'multiplo' })}>
          <option value="simples">Simples: 1 pet por profissional por horário</option>
          <option value="multiplo">Múltiplo: até X pets por profissional</option>
        </select>
      </Campo>
      <p className="mudo">Fuso: {petshop.fuso}. Nome, endereço, telefone e logo ficam na aba Pet shop.</p>
      {erro && <p className="erro-texto">{erro}</p>}
      <div className="acoes-linha">
        <button className="btn primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar regras'}</button>
      </div>
    </div>
  );
}
