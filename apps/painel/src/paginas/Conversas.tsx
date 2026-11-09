// BT-09 · Atendimento humano: conversas com o bot pausado, devolver ao bot e
// pausar o bot para um tutor. O bot pausa sozinho quando o dono responde pelo
// celular ou o tutor pede atendente; aqui a equipe vê e controla isso.
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../contexto/PetshopAtual';
import { useBotConfig, useConversasPausadas, useTutores } from '../lib/consultas';
import { devolverBot, pausarBot } from '../lib/acoes';
import { mensagemDeErro } from '../lib/erros';
import { linkWhatsApp, normalizar, normalizarTelefone, telefone } from '../lib/formato';
import { diaDe, hoje, hora, rotuloDia } from '../lib/tempo';
import type { ConversaPausada } from '../lib/tipos';
import { Campo, Carregando, Vazio, useAvisos } from '../componentes/ui';

export function quando(iso: string | null, fuso: string): string {
  if (!iso) return '—';
  const d = diaDe(iso, fuso);
  return d === hoje(fuso) ? `hoje ${hora(iso, fuso)}` : `${rotuloDia(d, fuso, 'dd/MM')} ${hora(iso, fuso)}`;
}

export function Conversas() {
  const { petshop } = usePetshop();
  const fuso = petshop.fuso;
  const q = useConversasPausadas(petshop.id);
  const bot = useBotConfig(petshop.id, true);
  const tutores = useTutores(petshop.id);
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const pausadas = (q.data ?? []).filter((c) => c.estado === 'humano');
  const bloqueadas = (q.data ?? []).filter((c) => c.estado === 'bloqueado');
  const horas = bot.data?.pausa_humana_horas ?? 4;

  const sugestoes = useMemo(() => {
    const t = normalizar(busca.trim());
    const dig = busca.replace(/\D/g, '');
    if (!t) return [];
    return (tutores.data ?? [])
      .filter((x) => normalizar(x.nome).includes(t) || (dig.length >= 3 && (x.tutores?.telefone ?? '').includes(dig)))
      .slice(0, 6);
  }, [busca, tutores.data]);

  async function atualizar() {
    await qc.invalidateQueries({ queryKey: [petshop.id, 'conversas_pausadas'] });
    await qc.invalidateQueries({ queryKey: [petshop.id, 'conversa'] });
  }

  async function pausar(tel: string, nome?: string) {
    setErro(null); setOcupado(tel);
    try {
      await pausarBot(petshop.id, tel);
      await atualizar();
      setBusca('');
      avisar(`Bot pausado para ${nome ?? telefone(tel)} por ${horas} h.`);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(null);
    }
  }

  async function devolver(c: ConversaPausada) {
    setErro(null); setOcupado(c.conversa_id);
    try {
      await devolverBot(c.conversa_id);
      await atualizar();
      avisar(`${c.tutor_nome ?? telefone(c.telefone)} voltou para o bot.`);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(null);
    }
  }

  const telDigitado = normalizarTelefone(busca);
  const podePausarNumero = !!telDigitado && /^\+[1-9]\d{7,14}$/.test(telDigitado) && sugestoes.length === 0;

  return (
    <div className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Atendimento humano</h1>
          <p className="mudo">
            Enquanto a conversa está aqui, o bot fica em silêncio com esse tutor. Ele pausa sozinho quando você responde pelo
            celular ou o tutor pede atendente, e volta depois de {horas} h sem resposta sua (ou quando você devolver).
          </p>
        </div>
      </header>

      <section className="cartao">
        <h3>Pausar o bot para um tutor</h3>
        <div className="linha-campos">
          <Campo rotulo="Tutor ou telefone" largo>
            <input id="pausar-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do tutor ou (19) 99123-4567" />
          </Campo>
        </div>
        {sugestoes.length > 0 && (
          <div className="opcoes">
            {sugestoes.map((t) => t.tutores?.telefone && (
              <button key={t.id} className="opcao" disabled={ocupado === t.tutores.telefone} onClick={() => pausar(t.tutores!.telefone, t.nome)}>
                Pausar para <b>{t.nome}</b> <span className="mudo">{telefone(t.tutores.telefone)}</span>
              </button>
            ))}
          </div>
        )}
        {podePausarNumero && (
          <button className="btn" disabled={ocupado === telDigitado} onClick={() => pausar(telDigitado!)}>
            Pausar para {telefone(telDigitado)} (ainda não é cliente)
          </button>
        )}
        {erro && <p className="erro-texto">{erro}</p>}
      </section>

      <h2 className="subtitulo">Com o bot pausado ({pausadas.length})</h2>
      {q.isLoading ? <Carregando /> : pausadas.length === 0 ? (
        <Vazio>Nenhuma conversa em atendimento humano. O bot está respondendo todo mundo.</Vazio>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>Tutor</th><th>WhatsApp</th><th>Desde</th><th>Bot volta</th><th>Como pausou</th><th></th></tr>
            </thead>
            <tbody>
              {pausadas.map((c) => (
                <tr key={c.conversa_id}>
                  <td>{c.tutor_nome ? <b>{c.tutor_nome}</b> : <span className="mudo">não cadastrado</span>}</td>
                  <td><a href={linkWhatsApp(c.telefone)} target="_blank" rel="noreferrer">{telefone(c.telefone)}</a></td>
                  <td>{quando(c.humano_desde, fuso)}</td>
                  <td>{c.vencida ? <span className="mudo">na próxima mensagem</span> : quando(c.humano_ate, fuso)}</td>
                  <td className="mudo">{c.pausado_por_painel ? 'pelo painel' : 'automático'}</td>
                  <td className="acoes-celula">
                    <button className="btn" disabled={ocupado === c.conversa_id} onClick={() => devolver(c)}>Devolver ao bot</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bloqueadas.length > 0 && (
        <>
          <h2 className="subtitulo">Bot desligado de vez ({bloqueadas.length})</h2>
          <p className="nota">Atendimento só manual, definido pela equipe PetCare Hub. Para mudar, fale com suporte@petcarehub.com.br.</p>
          <div className="tabela-wrap">
            <table className="tabela">
              <tbody>
                {bloqueadas.map((c) => (
                  <tr key={c.conversa_id}>
                    <td>{c.tutor_nome ?? <span className="mudo">não cadastrado</span>}</td>
                    <td>{telefone(c.telefone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
