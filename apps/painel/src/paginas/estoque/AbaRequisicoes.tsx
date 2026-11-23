// ES-02/03 · Requisição do salão ao almoxarifado e ES-16 · devolução do salão.
// Consumo: pendente → enviada (baixa no envio) / enviada em parte / recusada / cancelada.
// Devolução: aguardando aprovação → aprovada → recebida (volta ao estoque na confirmação).
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import { useSessao } from '../../contexto/Sessao';
import { erroAdm, escreverNumero, lerNumero, quantidade, useLocais, useProdutos, type Produto } from '../../lib/administracao';
import { quantidadeInvalida } from '../../lib/compras';
import {
  REQ_ABERTA, STATUS_REQUISICAO, aprovarDevolucao, atenderRequisicao, atualizarMovimentos, cancelarRequisicao,
  criarDevolucao, criarRequisicao, receberDevolucao, recusarRequisicao, useRequisicoes, type Requisicao,
} from '../../lib/movimentos';
import { useRecursos } from '../../lib/consultas';
import { hora } from '../../lib/tempo';
import { Campo, Carregando, Modal, Vazio, useAvisos } from '../../componentes/ui';
import { dataDe } from '../compras/comum';
import { ItensForm, type LinhaItem } from './ItensForm';

interface Perm { estoque: boolean; config: boolean }
type Filtro = 'abertas' | 'minhas' | 'todas';

export function AbaRequisicoes({ perm }: { perm: Perm }) {
  const { petshop } = usePetshop();
  const { sessao } = useSessao();
  const uid = sessao?.user.id ?? '';
  const q = useRequisicoes(petshop.id);
  const produtosQ = useProdutos(petshop.id);
  const [filtro, setFiltro] = useState<Filtro>('abertas');
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const porId = useMemo(() => new Map((produtosQ.data ?? []).map((p) => [p.id, p])), [produtosQ.data]);
  const todas = q.data ?? [];
  const lista = todas.filter((r) =>
    filtro === 'abertas' ? REQ_ABERTA.includes(r.status) : filtro === 'minhas' ? r.solicitado_por === uid : true);
  const nAbertas = todas.filter((r) => REQ_ABERTA.includes(r.status)).length;

  if (q.isLoading || produtosQ.isLoading) return <Carregando />;
  const req = todas.find((r) => r.id === aberta) ?? null;

  return (
    <div className="aba-corpo adm-larga">
      <div className="barra">
        <div className="segmentado pequeno" role="group" aria-label="Filtro">
          {([['abertas', `Em aberto${nAbertas ? ` (${nAbertas})` : ''}`], ['minhas', 'Pedidas por mim'], ['todas', 'Todas']] as [Filtro, string][])
            .map(([v, r]) => <button key={v} className={filtro === v ? 'ativo' : ''} onClick={() => setFiltro(v)}>{r}</button>)}
        </div>
        <button className="btn primario adm-direita" onClick={() => setNova(true)}>+ Nova requisição</button>
      </div>

      {lista.length === 0 ? <Vazio>{filtro === 'abertas' ? 'Nenhuma requisição em aberto.' : 'Nenhuma requisição.'}</Vazio> : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th className="num">Nº</th><th>Tipo</th><th>Situação</th><th>Pedida em</th><th>Para</th><th>Itens</th></tr></thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id} className="clicavel" onClick={() => setAberta(r.id)}>
                  <td className="num">{r.numero}</td>
                  <td>{r.tipo === 'consumo' ? 'Requisição' : 'Devolução'}</td>
                  <td><span className={`adm-status adm-rq-${r.status}`}>{STATUS_REQUISICAO[r.status]}</span></td>
                  <td>{dataDe(r.solicitada_em, petshop.fuso)} {hora(r.solicitada_em, petshop.fuso)}</td>
                  <td>{r.recursos?.nome ?? <span className="mudo">—</span>}</td>
                  <td className="adm-pequeno">{resumoItens(r, porId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nova && <NovaRequisicao aoFechar={() => setNova(false)} aoCriar={(id) => { setNova(false); setAberta(id); }} />}
      {req && <DetalheRequisicao key={req.id} req={req} todas={todas} porId={porId} perm={perm} uid={uid}
                                 aoAbrir={setAberta} aoFechar={() => setAberta(null)} />}
    </div>
  );
}

function resumoItens(r: Requisicao, porId: Map<string, Produto>): string {
  const partes = r.requisicao_itens.map((i) => `${escreverNumero(Number(i.qtd_solicitada))} ${i.unidade_rotulo} ${porId.get(i.produto_id)?.nome ?? ''}`.trim());
  return partes.length > 2 ? `${partes.slice(0, 2).join(' · ')} · +${partes.length - 2}` : partes.join(' · ');
}

// ================================================================ Nova requisição
function NovaRequisicao({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (id: string) => void }) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const produtosQ = useProdutos(petshop.id);
  const locaisQ = useLocais(petshop.id);
  const recursosQ = useRecursos(petshop.id);
  const origens = (locaisQ.data ?? []).filter((l) => l.ativo && l.tipo !== 'venda');
  const [localId, setLocalId] = useState('');
  const [recursoId, setRecursoId] = useState('');
  const [obs, setObs] = useState('');
  const [linhas, setLinhas] = useState<LinhaItem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const origem = localId || origens.find((l) => l.padrao_requisicao)?.id || origens[0]?.id || '';
  const insumos = (produtosQ.data ?? []).filter((p) => p.ativo && p.usa_como_insumo && p.produto_unidades.some((u) => u.ativo && u.usa_requisicao));
  const saldo = (id: string) => Number(produtosQ.data?.find((p) => p.id === id)?.estoque_saldos.find((s) => s.local_id === origem)?.quantidade ?? 0);
  const profissionais = (recursosQ.data ?? []).filter((r) => r.ativo && r.tipo === 'profissional');

  async function pedir() {
    setErro(null);
    if (linhas.length === 0) return setErro('Inclua ao menos um item.');
    setSalvando(true);
    try {
      const id = await criarRequisicao(petshop.id, linhas.map((l) => ({ produto_unidade_id: l.embalagem.id, quantidade: l.quantidade })),
                                       origem || null, recursoId || null, obs);
      await atualizarMovimentos(qc, petshop.id);
      avisar('Requisição enviada ao almoxarifado.');
      aoCriar(id);
    } catch (e) {
      setErro(erroAdm(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Nova requisição" aberto largo aoFechar={aoFechar}
           rodape={<><button className="btn" onClick={aoFechar}>Cancelar</button>
                     <button className="btn primario" disabled={salvando} onClick={pedir}>{salvando ? 'Enviando…' : 'Pedir ao almoxarifado'}</button></>}>
      <div className="linha-campos">
        {origens.length > 1 && (
          <Campo rotulo="Sai de">
            <select value={origem} onChange={(e) => setLocalId(e.target.value)}>
              {origens.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Para (opcional)">
          <select value={recursoId} onChange={(e) => setRecursoId(e.target.value)}>
            <option value="">—</option>
            {profissionais.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </Campo>
      </div>
      <ItensForm produtos={insumos} embalagemValida={(u) => u.usa_requisicao} saldo={saldo} linhas={linhas} aoMudar={setLinhas} />
      <Campo rotulo="Observação (opcional)" largo><textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      <p className="nota">A baixa no estoque acontece quando o almoxarifado envia. Se faltar, sai o que houver e a requisição fecha.</p>
      {erro && <p className="erro-texto">{erro}</p>}
    </Modal>
  );
}

// ================================================================ Detalhe e ações
type Acao = 'enviar' | 'recusar' | 'cancelar' | 'devolver' | 'receber' | null;

function DetalheRequisicao(props: {
  req: Requisicao; todas: Requisicao[]; porId: Map<string, Produto>; perm: Perm; uid: string;
  aoAbrir: (id: string) => void; aoFechar: () => void;
}) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const r = props.req;
  const consumo = r.tipo === 'consumo';
  const meu = r.solicitado_por === props.uid;
  const [acao, setAcao] = useState<Acao>(null);
  const [motivo, setMotivo] = useState('');
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const saldoLocal = (produtoId: string) =>
    Number(props.porId.get(produtoId)?.estoque_saldos.find((s) => s.local_id === r.local_id)?.quantidade ?? 0);

  // Quanto já voltou (ou está pedido para voltar) de cada item desta requisição
  const devolvido = (itemId: string) => props.todas
    .filter((d) => d.tipo === 'devolucao' && d.requisicao_origem_id === r.id && ['solicitada', 'aprovada', 'recebida'].includes(d.status))
    .flatMap((d) => d.requisicao_itens.filter((i) => i.item_origem_id === itemId).map((i) => Number(d.status === 'recebida' ? i.qtd_atendida ?? 0 : i.qtd_solicitada)))
    .reduce((s, x) => s + x, 0);

  function abrirAcao(a: Acao) {
    setErro(null); setMotivo('');
    const ini: Record<string, string> = {};
    for (const i of r.requisicao_itens) {
      if (a === 'enviar') ini[i.id] = escreverNumero(Math.min(Number(i.qtd_solicitada), Math.floor(saldoLocal(i.produto_id) / Number(i.fator))));
      if (a === 'receber') ini[i.id] = escreverNumero(Number(i.qtd_solicitada));
      if (a === 'devolver') ini[i.id] = '';
    }
    setQtds(ini);
    setAcao(a);
  }

  async function executar(fn: () => Promise<unknown>, ok: string) {
    setErro(null); setOcupado(true);
    try {
      await fn();
      await atualizarMovimentos(qc, petshop.id);
      avisar(ok);
      setAcao(null);
      return true;
    } catch (e) {
      setErro(erroAdm(e));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  function lerQtds(limite: (i: Requisicao['requisicao_itens'][number]) => number, permiteZero: boolean) {
    const itens: { item_id: string; quantidade: number }[] = [];
    for (const i of r.requisicao_itens) {
      const q = lerNumero(qtds[i.id] ?? '') ?? 0;   // vazio = nada deste item agora
      const pr = props.porId.get(i.produto_id);
      if (q === 0 && permiteZero) { itens.push({ item_id: i.id, quantidade: 0 }); continue; }
      const e = pr ? quantidadeInvalida(q, Number(i.fator), pr) : null;
      if (e) throw new Error(e);
      if (q > limite(i)) throw new Error(`"${pr?.nome}": no máximo ${escreverNumero(limite(i))} ${i.unidade_rotulo}.`);
      itens.push({ item_id: i.id, quantidade: q });
    }
    return itens;
  }

  async function confirmar() {
    try {
      if (acao === 'enviar') {
        const itens = lerQtds((i) => Math.min(Number(i.qtd_solicitada), saldoLocal(i.produto_id) / Number(i.fator)), true);
        setOcupado(true);
        const res = await atenderRequisicao(r.id, itens).finally(() => setOcupado(false));
        await atualizarMovimentos(qc, petshop.id);
        avisar(res.precisa_comprar ? 'Enviada em parte: o que faltou entrou nos avisos de reposição.' : 'Requisição enviada e baixada do estoque.');
        setAcao(null);
      } else if (acao === 'receber') {
        const itens = lerQtds((i) => Number(i.qtd_solicitada), true);
        await executar(() => receberDevolucao(r.id, itens), 'Devolução recebida: o produto voltou ao estoque.');
      } else if (acao === 'devolver') {
        const itens = r.requisicao_itens
          .map((i) => ({ i, q: lerNumero(qtds[i.id] ?? '') ?? 0 }))
          .filter((x) => x.q > 0);
        if (itens.length === 0) return setErro('Informe o que volta ao estoque.');
        for (const { i, q } of itens) {
          const pr = props.porId.get(i.produto_id);
          const e = pr ? quantidadeInvalida(q, Number(i.fator), pr) : null;
          if (e) return setErro(e);
          const max = Number(i.qtd_atendida ?? 0) - devolvido(i.id);
          if (q > max) return setErro(`"${pr?.nome}": pode devolver até ${escreverNumero(max)} ${i.unidade_rotulo}.`);
        }
        setOcupado(true);
        const id = await criarDevolucao(r.id, itens.map(({ i, q }) => ({ item_origem_id: i.id, quantidade: q })), motivo).finally(() => setOcupado(false));
        await atualizarMovimentos(qc, petshop.id);
        avisar('Devolução pedida. Ela volta ao estoque depois da aprovação e da confirmação do recebimento.');
        props.aoAbrir(id);
      } else if (acao === 'recusar') {
        if (!motivo.trim()) return setErro('Informe o motivo da recusa.');
        await executar(() => recusarRequisicao(r.id, motivo), 'Requisição recusada.');
      } else if (acao === 'cancelar') {
        await executar(() => cancelarRequisicao(r.id, motivo), 'Requisição cancelada.');
      }
    } catch (e) {
      setErro(e instanceof Error && !('code' in e) ? e.message : erroAdm(e));
    }
  }

  // Ações disponíveis (o banco confere de novo)
  const podeEnviar = consumo && r.status === 'pendente' && props.perm.estoque;
  const podeRecusar = (consumo && r.status === 'pendente' && props.perm.estoque)
                   || (!consumo && ['solicitada', 'aprovada'].includes(r.status) && props.perm.config);
  const podeCancelar = REQ_ABERTA.includes(r.status) && (meu || props.perm.config);
  const podeDevolver = consumo && ['atendida', 'atendida_parcial'].includes(r.status)
                   && r.requisicao_itens.some((i) => Number(i.qtd_atendida ?? 0) - devolvido(i.id) > 0);
  const podeAprovar = !consumo && r.status === 'solicitada' && props.perm.config;
  const podeReceber = !consumo && r.status === 'aprovada' && props.perm.estoque;
  const origem = r.requisicao_origem_id ? props.todas.find((x) => x.id === r.requisicao_origem_id) : null;

  const rotuloAcao: Record<Exclude<Acao, null>, string> = {
    enviar: 'Confirmar envio', recusar: 'Recusar', cancelar: 'Cancelar requisição', devolver: 'Pedir devolução', receber: 'Confirmar recebimento',
  };

  return (
    <Modal titulo={`${consumo ? 'Requisição' : 'Devolução'} nº ${r.numero}`} aberto largo aoFechar={props.aoFechar}
      rodape={acao ? (
        <>
          <button className="btn" disabled={ocupado} onClick={() => { setAcao(null); setErro(null); }}>Voltar</button>
          <button className={`btn ${acao === 'recusar' || acao === 'cancelar' ? 'perigo' : 'primario'}`} disabled={ocupado} onClick={confirmar}>{rotuloAcao[acao]}</button>
        </>
      ) : (
        <>
          {podeCancelar && <button className="btn" onClick={() => abrirAcao('cancelar')}>Cancelar</button>}
          {podeRecusar && <button className="btn" onClick={() => abrirAcao('recusar')}>Recusar</button>}
          {podeDevolver && <button className="btn" onClick={() => abrirAcao('devolver')}>Devolver ao estoque</button>}
          <button className="btn" onClick={props.aoFechar}>Fechar</button>
          {podeAprovar && <button className="btn primario" disabled={ocupado} onClick={() => executar(() => aprovarDevolucao(r.id), 'Devolução aprovada. Falta confirmar o recebimento físico.')}>Aprovar devolução</button>}
          {podeReceber && <button className="btn primario" onClick={() => abrirAcao('receber')}>Confirmar recebimento</button>}
          {podeEnviar && <button className="btn primario" onClick={() => abrirAcao('enviar')}>Enviar</button>}
        </>
      )}>
      <p className="adm-linha-status">
        <span className={`adm-status adm-rq-${r.status}`}>{STATUS_REQUISICAO[r.status]}</span>
        <span className="mudo"> · pedida em {dataDe(r.solicitada_em, petshop.fuso)} {hora(r.solicitada_em, petshop.fuso)}</span>
        {r.recursos && <span className="mudo"> · para {r.recursos.nome}</span>}
        {r.estoque_locais && <span className="mudo"> · {consumo ? 'sai de' : 'volta para'} {r.estoque_locais.nome}</span>}
      </p>
      {origem && <p className="nota">Devolução da requisição <button className="btn-link" onClick={() => props.aoAbrir(origem.id)}>nº {origem.numero}</button>.</p>}
      {r.observacao && <p className="nota">{r.observacao}</p>}
      {r.motivo && <p className="nota">Motivo: {r.motivo}</p>}

      <div className="tabela-wrap">
        <table className="tabela">
          <thead>
            <tr>
              <th>Produto</th><th className="num">{consumo ? 'Pedido' : 'Devolve'}</th>
              <th className="num">{consumo ? 'Enviado' : 'Recebido'}</th>
              {(acao === 'enviar') && <th className="num">No local</th>}
              {(acao === 'devolver') && <th className="num">Pode devolver</th>}
              {acao && acao !== 'recusar' && acao !== 'cancelar' && <th className="num">{acao === 'enviar' ? 'Enviar agora' : acao === 'receber' ? 'Chegou' : 'Devolver'}</th>}
            </tr>
          </thead>
          <tbody>
            {r.requisicao_itens.map((i) => {
              const pr = props.porId.get(i.produto_id);
              return (
                <tr key={i.id}>
                  <td>{pr?.nome ?? 'Produto'}</td>
                  <td className="num">{escreverNumero(Number(i.qtd_solicitada))} {i.unidade_rotulo}</td>
                  <td className="num">{i.qtd_atendida === null ? <span className="mudo">—</span> : `${escreverNumero(Number(i.qtd_atendida))} ${i.unidade_rotulo}`}</td>
                  {acao === 'enviar' && <td className="num">{pr ? quantidade(saldoLocal(i.produto_id), pr) : '—'}</td>}
                  {acao === 'devolver' && <td className="num">{escreverNumero(Number(i.qtd_atendida ?? 0) - devolvido(i.id))} {i.unidade_rotulo}</td>}
                  {acao && acao !== 'recusar' && acao !== 'cancelar' && (
                    <td className="num">
                      <input className="adm-num" inputMode="decimal" value={qtds[i.id] ?? ''} aria-label={`Quantidade de ${pr?.nome}`}
                             onChange={(e) => setQtds((x) => ({ ...x, [i.id]: e.target.value }))} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {acao === 'enviar' && <p className="nota">Sugestão: o pedido, limitado ao que há no local em embalagens inteiras. O que ficar abaixo do pedido fecha a requisição como enviada em parte.</p>}
      {acao === 'devolver' && <p className="nota">A devolução precisa da aprovação do dono ou do gerente e só volta ao estoque na confirmação do recebimento.</p>}
      {(acao === 'recusar' || acao === 'cancelar' || acao === 'devolver') && (
        <Campo rotulo={acao === 'recusar' ? 'Motivo' : acao === 'devolver' ? 'Observação (opcional)' : 'Motivo (opcional)'} largo>
          <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
        </Campo>
      )}
      {erro && <p className="erro-texto">{erro}</p>}
    </Modal>
  );
}
