// ES-14 · Transferência entre locais.
// Pedida → aprovada (dono ou gerente; nasce aprovada se pedida por eles) →
// concluída só na confirmação física, quando o estoque se move.
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import { useSessao } from '../../contexto/Sessao';
import { erroAdm, escreverNumero, lerNumero, quantidade, useLocais, useProdutos, type Produto } from '../../lib/administracao';
import { quantidadeInvalida } from '../../lib/compras';
import {
  STATUS_TRANSFERENCIA, atualizarMovimentos, cancelarTransferencia, confirmarTransferencia, criarTransferencia,
  decidirTransferencia, useTransferencias, type Transferencia,
} from '../../lib/movimentos';
import { hora } from '../../lib/tempo';
import { Campo, Carregando, Modal, Vazio, useAvisos } from '../../componentes/ui';
import { dataDe } from '../compras/comum';
import { ItensForm, type LinhaItem } from './ItensForm';

interface Perm { estoque: boolean; config: boolean }
const ABERTAS = ['solicitada', 'aprovada'];

export function AbaTransferencias({ perm }: { perm: Perm }) {
  const { petshop } = usePetshop();
  const { sessao } = useSessao();
  const q = useTransferencias(petshop.id);
  const produtosQ = useProdutos(petshop.id);
  const locaisQ = useLocais(petshop.id);
  const [todas, setTodas] = useState(false);
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const porId = useMemo(() => new Map((produtosQ.data ?? []).map((p) => [p.id, p])), [produtosQ.data]);
  const nomeLocal = (id: string) => locaisQ.data?.find((l) => l.id === id)?.nome ?? '—';

  if (q.isLoading || produtosQ.isLoading || locaisQ.isLoading) return <Carregando />;
  const lista = (q.data ?? []).filter((t) => todas || ABERTAS.includes(t.status));
  const t = (q.data ?? []).find((x) => x.id === aberta) ?? null;

  return (
    <div className="aba-corpo adm-larga">
      <div className="barra">
        <div className="segmentado pequeno" role="group" aria-label="Filtro">
          <button className={!todas ? 'ativo' : ''} onClick={() => setTodas(false)}>Em aberto</button>
          <button className={todas ? 'ativo' : ''} onClick={() => setTodas(true)}>Todas</button>
        </div>
        <button className="btn primario adm-direita" onClick={() => setNova(true)}>+ Nova transferência</button>
      </div>
      {lista.length === 0 ? <Vazio>{todas ? 'Nenhuma transferência.' : 'Nenhuma transferência em aberto.'}</Vazio> : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th className="num">Nº</th><th>De</th><th>Para</th><th>Situação</th><th>Pedida em</th><th className="num">Itens</th></tr></thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.id} className="clicavel" onClick={() => setAberta(x.id)}>
                  <td className="num">{x.numero}</td>
                  <td>{nomeLocal(x.origem_id)}</td>
                  <td>{nomeLocal(x.destino_id)}</td>
                  <td><span className={`adm-status adm-tr-${x.status}`}>{STATUS_TRANSFERENCIA[x.status]}</span></td>
                  <td>{dataDe(x.solicitada_em, petshop.fuso)} {hora(x.solicitada_em, petshop.fuso)}</td>
                  <td className="num">{x.transferencia_itens.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nova && <NovaTransferencia aoFechar={() => setNova(false)} aoCriar={(id) => { setNova(false); setAberta(id); }} />}
      {t && <DetalheTransferencia key={t.id} t={t} porId={porId} perm={perm} uid={sessao?.user.id ?? ''} nomeLocal={nomeLocal}
                                  aoFechar={() => setAberta(null)} />}
    </div>
  );
}

// ================================================================ Nova
export function NovaTransferencia(props: {
  inicial?: { origem?: string; destino?: string };
  aoFechar: () => void;
  aoCriar: (id: string) => void;
}) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const produtosQ = useProdutos(petshop.id);
  const locaisQ = useLocais(petshop.id);
  const locais = (locaisQ.data ?? []).filter((l) => l.ativo);
  const [origem, setOrigem] = useState(props.inicial?.origem ?? '');
  const [destino, setDestino] = useState(props.inicial?.destino ?? '');
  const [obs, setObs] = useState('');
  const [linhas, setLinhas] = useState<LinhaItem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const destinoVenda = locais.find((l) => l.id === destino)?.tipo === 'venda';
  const produtos = (produtosQ.data ?? []).filter((p) => p.ativo && (!destinoVenda || p.usa_como_venda));
  const saldo = (id: string) => Number(produtosQ.data?.find((p) => p.id === id)?.estoque_saldos.find((s) => s.local_id === origem)?.quantidade ?? 0);

  async function pedir() {
    setErro(null);
    if (!origem || !destino) return setErro('Escolha a origem e o destino.');
    if (origem === destino) return setErro('Origem e destino precisam ser diferentes.');
    if (linhas.length === 0) return setErro('Inclua ao menos um item.');
    setSalvando(true);
    try {
      const id = await criarTransferencia(petshop.id, origem, destino, linhas.map((l) => ({ produto_unidade_id: l.embalagem.id, quantidade: l.quantidade })), obs);
      await atualizarMovimentos(qc, petshop.id);
      avisar('Transferência registrada. O estoque só muda na confirmação da movimentação.');
      props.aoCriar(id);
    } catch (e) {
      setErro(erroAdm(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Nova transferência" aberto largo aoFechar={props.aoFechar}
           rodape={<><button className="btn" onClick={props.aoFechar}>Cancelar</button>
                     <button className="btn primario" disabled={salvando} onClick={pedir}>{salvando ? 'Registrando…' : 'Pedir transferência'}</button></>}>
      {locais.length < 2 ? <p className="mudo">É preciso ter ao menos dois locais ativos (Estoque → Locais).</p> : (
        <>
          <div className="linha-campos">
            <Campo rotulo="De">
              <select value={origem} onChange={(e) => { setOrigem(e.target.value); setLinhas([]); }}>
                <option value="">—</option>
                {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Para" dica={destinoVenda ? 'Local de venda: só produtos marcados como venda' : undefined}>
              <select value={destino} onChange={(e) => { setDestino(e.target.value); setLinhas([]); }}>
                <option value="">—</option>
                {locais.filter((l) => l.id !== origem).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </Campo>
          </div>
          {origem && destino && (
            <ItensForm produtos={produtos} embalagemValida={() => true} saldo={saldo} linhas={linhas} aoMudar={setLinhas} />
          )}
          <Campo rotulo="Motivo ou observação (opcional)" largo><textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
          <p className="nota">Pedida por outro papel, a transferência espera a aprovação do dono ou do gerente. Em todos os casos, o estoque só se move quando alguém confirma a movimentação física.</p>
        </>
      )}
      {erro && <p className="erro-texto">{erro}</p>}
    </Modal>
  );
}

// ================================================================ Detalhe
function DetalheTransferencia(props: {
  t: Transferencia; porId: Map<string, Produto>; perm: Perm; uid: string; nomeLocal: (id: string) => string; aoFechar: () => void;
}) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const t = props.t;
  const [acao, setAcao] = useState<'confirmar' | 'recusar' | 'cancelar' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const saldoOrigem = (produtoId: string) =>
    Number(props.porId.get(produtoId)?.estoque_saldos.find((s) => s.local_id === t.origem_id)?.quantidade ?? 0);

  function abrir(a: 'confirmar' | 'recusar' | 'cancelar') {
    setErro(null); setMotivo('');
    if (a === 'confirmar') {
      setQtds(Object.fromEntries(t.transferencia_itens.map((i) =>
        [i.id, escreverNumero(Math.min(Number(i.qtd_solicitada), Math.floor(saldoOrigem(i.produto_id) / Number(i.fator))))])));
    }
    setAcao(a);
  }

  async function executar(fn: () => Promise<unknown>, ok: string) {
    setErro(null); setOcupado(true);
    try {
      await fn();
      await atualizarMovimentos(qc, petshop.id);
      avisar(ok);
      setAcao(null);
    } catch (e) {
      setErro(erroAdm(e));
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    if (acao === 'confirmar') {
      const itens: { item_id: string; quantidade: number }[] = [];
      for (const i of t.transferencia_itens) {
        const q = lerNumero(qtds[i.id] ?? '') ?? 0;
        const pr = props.porId.get(i.produto_id);
        if (q > 0 && pr) { const e = quantidadeInvalida(q, Number(i.fator), pr); if (e) return setErro(e); }
        const max = Math.min(Number(i.qtd_solicitada), saldoOrigem(i.produto_id) / Number(i.fator));
        if (q > max) return setErro(`"${pr?.nome}": no máximo ${escreverNumero(Math.floor(max * 10000) / 10000)} ${i.unidade_rotulo}.`);
        itens.push({ item_id: i.id, quantidade: q });
      }
      await executar(() => confirmarTransferencia(t.id, itens), 'Movimentação confirmada: o estoque dos dois locais foi atualizado.');
    } else if (acao === 'recusar') {
      if (!motivo.trim()) return setErro('Informe o motivo da recusa.');
      await executar(() => decidirTransferencia(t.id, false, motivo), 'Transferência recusada.');
    } else if (acao === 'cancelar') {
      await executar(() => cancelarTransferencia(t.id, motivo), 'Transferência cancelada.');
    }
  }

  const aberta = ABERTAS.includes(t.status);
  const podeAprovar = t.status === 'solicitada' && props.perm.config;
  const podeRecusar = aberta && props.perm.config;
  const podeCancelar = aberta && (t.solicitado_por === props.uid || props.perm.config);
  const podeConfirmar = t.status === 'aprovada' && props.perm.estoque;

  return (
    <Modal titulo={`Transferência nº ${t.numero}`} aberto largo aoFechar={props.aoFechar}
      rodape={acao ? (
        <>
          <button className="btn" disabled={ocupado} onClick={() => { setAcao(null); setErro(null); }}>Voltar</button>
          <button className={`btn ${acao === 'confirmar' ? 'primario' : 'perigo'}`} disabled={ocupado} onClick={confirmar}>
            {acao === 'confirmar' ? 'Confirmar movimentação' : acao === 'recusar' ? 'Recusar' : 'Cancelar transferência'}
          </button>
        </>
      ) : (
        <>
          {podeCancelar && <button className="btn" onClick={() => abrir('cancelar')}>Cancelar</button>}
          {podeRecusar && <button className="btn" onClick={() => abrir('recusar')}>Recusar</button>}
          <button className="btn" onClick={props.aoFechar}>Fechar</button>
          {podeAprovar && <button className="btn primario" disabled={ocupado} onClick={() => executar(() => decidirTransferencia(t.id, true), 'Transferência aprovada. Falta confirmar a movimentação física.')}>Aprovar</button>}
          {podeConfirmar && <button className="btn primario" onClick={() => abrir('confirmar')}>Confirmar movimentação</button>}
        </>
      )}>
      <p className="adm-linha-status">
        <span className={`adm-status adm-tr-${t.status}`}>{STATUS_TRANSFERENCIA[t.status]}</span>
        <span className="mudo"> · {props.nomeLocal(t.origem_id)} → {props.nomeLocal(t.destino_id)}</span>
      </p>
      {t.observacao && <p className="nota">{t.observacao}</p>}
      {t.motivo && <p className="nota">Motivo: {t.motivo}</p>}
      <div className="tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Produto</th><th className="num">Pedido</th><th className="num">Movido</th>
            {acao === 'confirmar' && <><th className="num">Na origem</th><th className="num">Movido agora</th></>}</tr></thead>
          <tbody>
            {t.transferencia_itens.map((i) => {
              const pr = props.porId.get(i.produto_id);
              return (
                <tr key={i.id}>
                  <td>{pr?.nome ?? 'Produto'}</td>
                  <td className="num">{escreverNumero(Number(i.qtd_solicitada))} {i.unidade_rotulo}</td>
                  <td className="num">{i.qtd_movida === null ? <span className="mudo">—</span> : `${escreverNumero(Number(i.qtd_movida))} ${i.unidade_rotulo}`}</td>
                  {acao === 'confirmar' && (
                    <>
                      <td className="num">{pr ? quantidade(saldoOrigem(i.produto_id), pr) : '—'}</td>
                      <td className="num"><input className="adm-num" inputMode="decimal" value={qtds[i.id] ?? ''} aria-label={`Quantidade movida de ${pr?.nome}`}
                                                 onChange={(e) => setQtds((x) => ({ ...x, [i.id]: e.target.value }))} /></td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {acao === 'confirmar' && <p className="nota">Informe o que foi movido de fato. Se for menos que o pedido, a transferência fecha com a diferença registrada.</p>}
      {(acao === 'recusar' || acao === 'cancelar') && (
        <Campo rotulo={acao === 'recusar' ? 'Motivo' : 'Motivo (opcional)'} largo>
          <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
        </Campo>
      )}
      {erro && <p className="erro-texto">{erro}</p>}
    </Modal>
  );
}
