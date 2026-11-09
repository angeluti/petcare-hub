// Ficha do tutor · bloco "WhatsApp e privacidade"
//   TP-12 mensagens automáticas (o tutor muda pelo bot com SAIR/ATIVAR; o dono
//         pode mudar a pedido do tutor no balcão, com registro de quem e quando)
//   TP-15 consentimento de compartilhamento (só leitura; o tutor muda pelo bot)
//   BT-09 pausar o bot / devolver ao bot para este tutor
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../contexto/PetshopAtual';
import { useConsentimentos, useConversaDoTelefone, useMembros } from '../lib/consultas';
import { definirMensagens, devolverBot, pausarBot } from '../lib/acoes';
import { mensagemDeErro } from '../lib/erros';
import { diaDe, hoje, hora, rotuloDia } from '../lib/tempo';
import type { TutorVinculo } from '../lib/tipos';
import { useAvisos } from './ui';

const ESCOPO: Record<string, string> = {
  compartilhar_dados_pet: 'Dados do pet com outros pet shops do Hub',
  compartilhar_saude: 'Saúde do pet (vacinas, prontuário) com clínicas do Hub',
};
const CANAL: Record<string, string> = { bot: 'pelo WhatsApp', painel: 'pelo painel', presencial: 'presencial', app: 'pelo app' };

function quando(iso: string | null, fuso: string): string {
  if (!iso) return '—';
  const d = diaDe(iso, fuso);
  return d === hoje(fuso) ? `hoje às ${hora(iso, fuso)}` : `${rotuloDia(d, fuso, 'dd/MM/yyyy')} às ${hora(iso, fuso)}`;
}

export function WhatsappTutor({ tutor }: { tutor: TutorVinculo }) {
  const { petshop, tem, podeConfigurar } = usePetshop();
  const fuso = petshop.fuso;
  const tel = tutor.tutores?.telefone ?? null;
  const qc = useQueryClient();
  const avisar = useAvisos();
  const consQ = useConsentimentos(petshop.id, tutor.tutor_id);
  const botLigado = tem('spa.bot');
  const convQ = useConversaDoTelefone(petshop.id, tel, botLigado);
  // Nome de quem mudou no painel (lista de membros do próprio pet shop)
  const membros = useMembros(petshop.id, podeConfigurar);
  const [confirmando, setConfirmando] = useState(false);
  const [pedidoTutor, setPedidoTutor] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function trocarMensagens() {
    setErro(null); setOcupado(true);
    try {
      await definirMensagens(tutor.id, !tutor.aceita_mensagens);
      await qc.invalidateQueries({ queryKey: [petshop.id, 'tutores'] });
      avisar(tutor.aceita_mensagens ? 'Mensagens automáticas desligadas a pedido do tutor.' : 'Mensagens automáticas religadas a pedido do tutor.');
      setConfirmando(false); setPedidoTutor(false);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  async function pausarOuDevolver() {
    if (!tel) return;
    setErro(null); setOcupado(true);
    try {
      const c = convQ.data;
      if (c?.estado === 'humano') await devolverBot(c.id);
      else await pausarBot(petshop.id, tel);
      await qc.invalidateQueries({ queryKey: [petshop.id, 'conversa', tel] });
      await qc.invalidateQueries({ queryKey: [petshop.id, 'conversas_pausadas'] });
      avisar(c?.estado === 'humano' ? 'Conversa devolvida ao bot.' : 'Bot pausado para este tutor.');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const quemMudou = tutor.mensagens_alterado_origem === 'bot'
    ? 'pelo próprio tutor no WhatsApp'
    : tutor.mensagens_alterado_origem === 'painel'
      ? `no painel${(() => {
          const m = membros.data?.find((x) => x.user_id === tutor.mensagens_alterado_por);
          return m?.nome ? ` por ${m.nome}` : '';
        })()}`
      : null;

  const ativos = (consQ.data ?? []).filter((c) => !c.revogado_em);
  const revogados = (consQ.data ?? []).filter((c) => c.revogado_em);
  const conv = convQ.data;

  return (
    <section className="whatsapp-tutor">
      <h3>WhatsApp e privacidade</h3>

      <div className="linha-status">
        <span className={`chip ${tutor.aceita_mensagens ? 'st-confirmado' : 'st-cancelado'}`}>
          {tutor.aceita_mensagens ? 'Recebe lembretes e avisos' : 'Não recebe mensagens automáticas'}
        </span>
        <span className="mudo">
          {tutor.mensagens_alterado_em
            ? `${tutor.aceita_mensagens ? 'Religado' : 'Desligado'} ${quemMudou ?? ''} em ${quando(tutor.mensagens_alterado_em, fuso)}`
            : !tutor.aceita_mensagens && tutor.opt_out_em
              ? `Desligado em ${quando(tutor.opt_out_em, fuso)}`
              : 'O tutor pode mandar SAIR ou ATIVAR no WhatsApp.'}
        </span>
      </div>
      {!confirmando ? (
        <button className="btn-link" onClick={() => setConfirmando(true)}>
          {tutor.aceita_mensagens ? 'Desligar a pedido do tutor' : 'Religar a pedido do tutor'}
        </button>
      ) : (
        <div className="subform">
          <label className="check">
            <input id="confirma-pedido-tutor" type="checkbox" checked={pedidoTutor} onChange={(e) => setPedidoTutor(e.target.checked)} />
            O tutor pediu pessoalmente para {tutor.aceita_mensagens ? 'parar de receber' : 'voltar a receber'} as mensagens automáticas.
          </label>
          <p className="nota">Fica registrado quem fez e quando. O tutor pode mudar de novo pelo WhatsApp a qualquer momento (SAIR ou ATIVAR).</p>
          <div className="acoes-linha">
            <button className="btn" onClick={() => { setConfirmando(false); setPedidoTutor(false); }}>Voltar</button>
            <button className="btn primario" disabled={!pedidoTutor || ocupado} onClick={trocarMensagens}>
              {tutor.aceita_mensagens ? 'Desligar mensagens' : 'Religar mensagens'}
            </button>
          </div>
        </div>
      )}

      <div className="linha-status">
        {consQ.isLoading ? <span className="mudo">Carregando consentimentos…</span> : ativos.length === 0 ? (
          <>
            <span className="chip">Não compartilha dados</span>
            <span className="mudo">
              {revogados.length > 0 ? `Revogou em ${quando(revogados[0].revogado_em, fuso)}.` : 'Nunca autorizou.'} O tutor autoriza ou revoga pelo bot (REVOGAR).
            </span>
          </>
        ) : ativos.map((c) => (
          <span key={c.id} className="consentimento">
            <span className="chip st-confirmado">Compartilha</span>{' '}
            {ESCOPO[c.escopo] ?? c.escopo} · autorizou {CANAL[c.canal] ?? c.canal} em {quando(c.concedido_em, fuso)} · termo {c.versao_termo}
          </span>
        ))}
      </div>

      {botLigado && tel && (
        <div className="linha-status">
          {conv?.estado === 'humano' ? (
            <>
              <span className="chip st-pendente">Bot pausado</span>
              <span className="mudo">desde {quando(conv.humano_desde, fuso)} · volta {conv.humano_ate ? quando(conv.humano_ate, fuso) : 'quando devolver'}</span>
              <button className="btn" disabled={ocupado} onClick={pausarOuDevolver}>Devolver ao bot</button>
            </>
          ) : conv?.estado === 'bloqueado' ? (
            <span className="chip st-cancelado">Bot desligado de vez para este tutor</span>
          ) : (
            <>
              <span className="chip">Bot atende</span>
              <button className="btn" disabled={ocupado} onClick={pausarOuDevolver}>Pausar o bot</button>
            </>
          )}
        </div>
      )}
      {erro && <p className="erro-texto">{erro}</p>}
    </section>
  );
}
