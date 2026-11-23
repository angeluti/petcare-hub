// ES-06 · Inventário por local. O estoquista conta; dono ou gerente fecham.
// A diferença é calculada sobre o saldo do momento da contagem, então requisições
// feitas durante o inventário não se perdem. Sempre na unidade de controle.
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import { erroAdm, quantidade, useLocais, useProdutos, type Produto } from '../../lib/administracao';
import {
  abrirInventario, atualizarMovimentos, cancelarInventario, contarInventario, fecharInventario, useInventarios, type Inventario,
} from '../../lib/movimentos';
import { moeda } from '../../lib/formato';
import { Campo, Carregando, Modal, Vazio, useAvisos } from '../../componentes/ui';
import { dataDe } from '../compras/comum';
import { QtdInput } from './QtdInput';

interface Perm { estoque: boolean; config: boolean }
const STATUS = { aberto: 'Em contagem', fechado: 'Fechado', cancelado: 'Cancelado' } as const;

export function AbaInventario({ perm }: { perm: Perm }) {
  const { petshop } = usePetshop();
  const q = useInventarios(petshop.id, perm.estoque);
  const [abrindo, setAbrindo] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  if (q.isLoading) return <Carregando />;
  const lista = q.data ?? [];
  const inv = lista.find((i) => i.id === aberto) ?? null;

  return (
    <div className="aba-corpo adm-larga">
      <div className="barra">
        <p className="mudo adm-sem-margem">Conte o que há no local; ao fechar, o estoque é ajustado pela diferença.</p>
        <button className="btn primario adm-direita" onClick={() => setAbrindo(true)}>+ Abrir inventário</button>
      </div>
      {lista.length === 0 ? <Vazio>Nenhum inventário ainda.</Vazio> : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th className="num">Nº</th><th>Local</th><th>Situação</th><th>Aberto em</th><th className="num">Contados</th><th>Fechado em</th></tr></thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id} className="clicavel" onClick={() => setAberto(i.id)}>
                  <td className="num">{i.numero}</td>
                  <td>{i.estoque_locais?.nome ?? '—'}</td>
                  <td><span className={`adm-status adm-inv-${i.status}`}>{STATUS[i.status]}</span></td>
                  <td>{dataDe(i.aberto_em, petshop.fuso)}</td>
                  <td className="num">{i.inventario_itens.filter((x) => x.qtd_contada !== null).length} de {i.inventario_itens.length}</td>
                  <td>{dataDe(i.fechado_em, petshop.fuso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {abrindo && <AbrirInventario aoFechar={() => setAbrindo(false)} aoAbrir={(id) => { setAbrindo(false); setAberto(id); }} />}
      {inv && <DetalheInventario key={inv.id} inv={inv} perm={perm} aoFechar={() => setAberto(null)} />}
    </div>
  );
}

function AbrirInventario({ aoFechar, aoAbrir }: { aoFechar: () => void; aoAbrir: (id: string) => void }) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const locaisQ = useLocais(petshop.id);
  const produtosQ = useProdutos(petshop.id);
  const locais = (locaisQ.data ?? []).filter((l) => l.ativo);
  const [localId, setLocalId] = useState('');
  const [modo, setModo] = useState<'saldo' | 'escolher'>('saldo');
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const local = localId || locais[0]?.id || '';
  const ativos = (produtosQ.data ?? []).filter((p) => p.ativo);
  const comSaldoNoLocal = ativos.filter((p) => p.estoque_saldos.some((s) => s.local_id === local)).length;

  async function abrir() {
    setErro(null);
    if (!local) return setErro('Escolha o local.');
    if (modo === 'escolher' && escolhidos.size === 0) return setErro('Escolha ao menos um produto.');
    setSalvando(true);
    try {
      const id = await abrirInventario(petshop.id, local, modo === 'escolher' ? [...escolhidos] : null, obs);
      await atualizarMovimentos(qc, petshop.id);
      avisar('Inventário aberto. Conte e salve cada produto.');
      aoAbrir(id);
    } catch (e) {
      setErro(erroAdm(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Abrir inventário" aberto aoFechar={aoFechar}
           rodape={<><button className="btn" onClick={aoFechar}>Cancelar</button>
                     <button className="btn primario" disabled={salvando} onClick={abrir}>{salvando ? 'Abrindo…' : 'Abrir'}</button></>}>
      {locais.length > 1 && (
        <Campo rotulo="Local">
          <select value={local} onChange={(e) => setLocalId(e.target.value)}>
            {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </Campo>
      )}
      <div className="checks adm-checks adm-espaco">
        <label className="check"><input type="radio" checked={modo === 'saldo'} onChange={() => setModo('saldo')} /> Todos os produtos já movimentados neste local ({comSaldoNoLocal})</label>
        <label className="check"><input type="radio" checked={modo === 'escolher'} onChange={() => setModo('escolher')} /> Escolher os produtos</label>
      </div>
      {modo === 'escolher' && (
        <div className="adm-escolha">
          {ativos.map((p) => (
            <label key={p.id} className="check">
              <input type="checkbox" checked={escolhidos.has(p.id)}
                     onChange={(e) => setEscolhidos((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
              {p.nome}
            </label>
          ))}
        </div>
      )}
      <Campo rotulo="Observação (opcional)" largo><textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      {erro && <p className="erro-texto">{erro}</p>}
    </Modal>
  );
}

function DetalheInventario({ inv, perm, aoFechar }: { inv: Inventario; perm: Perm; aoFechar: () => void }) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const produtosQ = useProdutos(petshop.id);
  const porId = useMemo(() => new Map((produtosQ.data ?? []).map((p) => [p.id, p])), [produtosQ.data]);
  const [extra, setExtra] = useState('');
  const [confirmando, setConfirmando] = useState<'fechar' | 'cancelar' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const aberto = inv.status === 'aberto';
  const saldoAgora = (p: Produto | undefined) => Number(p?.estoque_saldos.find((s) => s.local_id === inv.local_id)?.quantidade ?? 0);
  const itens = [...inv.inventario_itens].sort((a, b) => (porId.get(a.produto_id)?.nome ?? '').localeCompare(porId.get(b.produto_id)?.nome ?? ''));
  const contados = itens.filter((i) => i.qtd_contada !== null);
  const comDiferenca = contados.filter((i) => Number(i.qtd_contada) !== Number(i.saldo_sistema)).length;
  const foraDaLista = (produtosQ.data ?? []).filter((p) => p.ativo && !inv.inventario_itens.some((i) => i.produto_id === p.id));

  async function contar(produto: Produto, base: number) {
    const unidadeBase = produto.produto_unidades.find((u) => u.eh_base);
    if (!unidadeBase) return;
    setErro(null); setOcupado(true);
    try {
      await contarInventario(inv.id, [{ produto_unidade_id: unidadeBase.id, quantidade: base }]);
      await qc.invalidateQueries({ queryKey: [petshop.id, 'inventarios'] });
      avisar(`${produto.nome}: ${quantidade(base, produto)} contados.`);
    } catch (e) {
      setErro(erroAdm(e));
    } finally {
      setOcupado(false);
    }
  }

  async function finalizar() {
    setErro(null); setOcupado(true);
    try {
      if (confirmando === 'fechar') {
        const r = await fecharInventario(inv.id);
        avisar(`Inventário fechado: ${r.itens_ajustados} produto(s) ajustado(s), ${moeda(Number(r.valor_ajuste))} de diferença.`);
      } else {
        await cancelarInventario(inv.id);
        avisar('Inventário cancelado. O estoque não mudou.');
      }
      await atualizarMovimentos(qc, petshop.id);
      setConfirmando(null);
    } catch (e) {
      setErro(erroAdm(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal titulo={`Inventário nº ${inv.numero} · ${inv.estoque_locais?.nome ?? ''}`} aberto largo aoFechar={aoFechar}
      rodape={confirmando ? (
        <>
          <button className="btn" disabled={ocupado} onClick={() => setConfirmando(null)}>Voltar</button>
          <button className={`btn ${confirmando === 'fechar' ? 'primario' : 'perigo'}`} disabled={ocupado} onClick={finalizar}>
            {confirmando === 'fechar' ? 'Fechar e ajustar o estoque' : 'Cancelar inventário'}
          </button>
        </>
      ) : (
        <>
          {aberto && <span className="rodape-resumo mudo">{contados.length} de {itens.length} contados</span>}
          {aberto && <button className="btn" onClick={() => setConfirmando('cancelar')}>Cancelar inventário</button>}
          <button className="btn" onClick={aoFechar}>Fechar janela</button>
          {aberto && perm.config && <button className="btn primario" disabled={contados.length === 0} onClick={() => setConfirmando('fechar')}>Fechar inventário</button>}
        </>
      )}>
      {confirmando === 'fechar' ? (
        <p>{comDiferenca === 0 ? 'Nenhuma diferença entre o contado e o sistema.' : `${comDiferenca} produto(s) com diferença serão ajustados.`} Produtos não contados ficam como estão. O ajuste é calculado sobre o saldo do momento de cada contagem.</p>
      ) : confirmando === 'cancelar' ? (
        <p>Cancelar descarta as contagens. O estoque não muda.</p>
      ) : (
        <>
          {aberto && !perm.config && <p className="nota">Quem fecha o inventário e ajusta o estoque é o dono ou o gerente.</p>}
          {produtosQ.isLoading ? <Carregando /> : (
            <div className="tabela-wrap">
              <table className="tabela">
                <thead><tr><th>Produto</th><th className="num">No sistema</th><th>Contado</th><th className="num">Diferença</th>{!aberto && <th className="num">Ajuste</th>}</tr></thead>
                <tbody>
                  {itens.map((i) => {
                    const p = porId.get(i.produto_id);
                    if (!p) return null;
                    const sistema = i.qtd_contada !== null ? Number(i.saldo_sistema) : saldoAgora(p);
                    const dif = i.qtd_contada !== null ? Number(i.qtd_contada) - Number(i.saldo_sistema) : null;
                    return (
                      <tr key={i.id}>
                        <td>{p.nome}</td>
                        <td className="num">{quantidade(sistema, p)}</td>
                        <td>{aberto
                          ? <Contagem produto={p} valor={i.qtd_contada === null ? null : Number(i.qtd_contada)} ocupado={ocupado} aoSalvar={(v) => contar(p, v)} />
                          : i.qtd_contada === null ? <span className="mudo">não contado</span> : quantidade(Number(i.qtd_contada), p)}</td>
                        <td className="num">{dif === null ? <span className="mudo">—</span> : <span className={dif < 0 ? 'adm-alerta' : ''}>{dif > 0 ? '+' : ''}{quantidade(dif, p)}</span>}</td>
                        {!aberto && <td className="num">{i.ajuste === null ? '—' : quantidade(Number(i.ajuste), p)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {aberto && foraDaLista.length > 0 && (
            <div className="subform">
              <Campo rotulo="Contar também">
                <select value={extra} onChange={(e) => setExtra(e.target.value)}>
                  <option value="">—</option>
                  {foraDaLista.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </Campo>
              {extra && porId.get(extra) && (
                <Contagem key={extra} produto={porId.get(extra)!} valor={null} ocupado={ocupado}
                          aoSalvar={async (v) => { await contar(porId.get(extra)!, v); setExtra(''); }} />
              )}
            </div>
          )}
        </>
      )}
      {erro && <p className="erro-texto">{erro}</p>}
    </Modal>
  );
}

function Contagem({ produto, valor, ocupado, aoSalvar }: { produto: Produto; valor: number | null; ocupado: boolean; aoSalvar: (v: number) => void }) {
  const [v, setV] = useState<number | null>(valor);
  const valido = v !== null && v >= 0 && Number.isInteger(v);
  return (
    <div className="input-com-botao adm-minimo">
      <QtdInput produto={produto} valor={v} aoMudar={setV} rotulo={`Contagem de ${produto.nome}`} />
      <button className="btn" disabled={!valido || ocupado || v === valor} onClick={() => valido && aoSalvar(v!)}>Salvar</button>
    </div>
  );
}
