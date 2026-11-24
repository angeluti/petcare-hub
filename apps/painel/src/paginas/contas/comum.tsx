// Contas a pagar e a receber: lançamento em parcelas e a janela de cada conta
// (baixa, edição, cancelamento e reabertura), iguais para os dois lados.
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import { erroAdm, escreverNumero, lerNumero, useFornecedores } from '../../lib/administracao';
import { dividirParcelas, type Parcela } from '../../lib/compras';
import {
  FORMAS, atualizarContas, baixarConta, cancelarConta, editarConta, lancarConta, reabrirConta, useCategorias,
  type ContaPagar, type ContaReceber, type TipoConta,
} from '../../lib/contas';
import { useTutores } from '../../lib/consultas';
import { moeda } from '../../lib/formato';
import { hoje, somarDias } from '../../lib/tempo';
import { Campo, Modal, useAvisos } from '../../componentes/ui';
import { dataCurta } from '../compras/comum';

export function situacao(c: { status: string; vencimento: string }, dia: string): { texto: string; classe: string } {
  if (c.status === 'paga') return { texto: 'Paga', classe: 'adm-ct-ok' };
  if (c.status === 'recebida') return { texto: 'Recebida', classe: 'adm-ct-ok' };
  if (c.status === 'cancelada') return { texto: 'Cancelada', classe: '' };
  if (c.vencimento < dia) return { texto: 'Vencida', classe: 'adm-ct-vencida' };
  if (c.vencimento === dia) return { texto: 'Vence hoje', classe: 'adm-ct-hoje' };
  return { texto: 'Em aberto', classe: 'adm-ct-aberta' };
}

export function Resumo({ itens }: { itens: { rotulo: string; valor: number; qtd: number; destaque?: boolean }[] }) {
  return (
    <div className="adm-resumo">
      {itens.map((i) => (
        <div key={i.rotulo} className={`adm-resumo-item${i.destaque && i.qtd > 0 ? ' destaque' : ''}`}>
          <span className="mudo">{i.rotulo}</span>
          <b>{moeda(i.valor)}</b>
          <span className="mudo adm-pequeno">{i.qtd} conta{i.qtd === 1 ? '' : 's'}</span>
        </div>
      ))}
    </div>
  );
}

// ================================================================ Lançar
export function LancarModal({ tipo, aoFechar }: { tipo: TipoConta; aoFechar: () => void }) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const categoriasQ = useCategorias(petshop.id);
  const fornecedoresQ = useFornecedores(petshop.id, tipo === 'pagar');
  const tutoresQ = useTutores(petshop.id);
  const dia0 = hoje(petshop.fuso);
  const categorias = (categoriasQ.data ?? []).filter((c) => c.ativo && c.tipo === (tipo === 'pagar' ? 'despesa' : 'receita'));
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [tutor, setTutor] = useState('');
  const [documento, setDocumento] = useState('');
  const [obs, setObs] = useState('');
  const [valorTxt, setValorTxt] = useState('');
  const [n, setN] = useState(1);
  const [primeiro, setPrimeiro] = useState(dia0);
  const [intervalo, setIntervalo] = useState(30);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const total = lerNumero(valorTxt) ?? 0;
  const totalCent = Math.round(total * 100);
  useEffect(() => {
    setParcelas(totalCent > 0 ? dividirParcelas(totalCent / 100, n, primeiro, intervalo, somarDias) : []);
  }, [totalCent, n, primeiro, intervalo]);
  const soma = Math.round(parcelas.reduce((s, p) => s + p.valor, 0) * 100);

  async function lancar() {
    setErro(null);
    if (!descricao.trim()) return setErro('Informe a descrição.');
    if (!categoria) return setErro('Escolha a categoria.');
    if (!(totalCent > 0)) return setErro('Informe o valor.');
    if (soma !== totalCent) return setErro(`As parcelas somam ${moeda(soma / 100)} e o valor é ${moeda(totalCent / 100)}.`);
    setSalvando(true);
    try {
      await lancarConta({ petshopId: petshop.id, tipo, descricao, categoriaId: categoria, parcelas,
                          fornecedorId: fornecedor || null, tutorId: tutor || null, documento, observacao: obs });
      await atualizarContas(qc, petshop.id);
      avisar(n === 1 ? 'Conta lançada.' : `${n} parcelas lançadas.`);
      aoFechar();
    } catch (e) {
      setErro(erroAdm(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={tipo === 'pagar' ? 'Lançar conta a pagar' : 'Lançar conta a receber'} aberto largo aoFechar={aoFechar}
           rodape={<><span className="rodape-resumo">Total: <b>{moeda(totalCent / 100)}</b></span>
                     <button className="btn" onClick={aoFechar}>Cancelar</button>
                     <button className="btn primario" disabled={salvando} onClick={lancar}>{salvando ? 'Lançando…' : 'Lançar'}</button></>}>
      <div className="linha-campos">
        <Campo rotulo="Descrição"><input value={descricao} onChange={(e) => setDescricao(e.target.value)} autoFocus /></Campo>
        <Campo rotulo="Categoria">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">—</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
      </div>
      <div className="linha-campos">
        {tipo === 'pagar' ? (
          <Campo rotulo="Fornecedor (opcional)">
            <select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
              <option value="">—</option>
              {(fornecedoresQ.data ?? []).filter((f) => f.ativo).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>
        ) : (
          <Campo rotulo="Tutor (opcional)">
            <select value={tutor} onChange={(e) => setTutor(e.target.value)}>
              <option value="">—</option>
              {(tutoresQ.data ?? []).map((t) => <option key={t.tutor_id} value={t.tutor_id}>{t.nome ?? t.tutores?.telefone}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Documento (opcional)" dica="Nota, boleto ou recibo"><input value={documento} onChange={(e) => setDocumento(e.target.value)} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Valor total"><input inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} placeholder="0,00" /></Campo>
        <Campo rotulo="Parcelas">
          <select value={n} onChange={(e) => setN(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((k) => <option key={k} value={k}>{k === 1 ? 'Única' : `${k} parcelas`}</option>)}
          </select>
        </Campo>
        <Campo rotulo={n === 1 ? 'Vencimento' : '1º vencimento'}><input type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} /></Campo>
        {n > 1 && (
          <Campo rotulo="Intervalo (dias)">
            <input inputMode="numeric" value={intervalo} onChange={(e) => setIntervalo(Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1))} />
          </Campo>
        )}
      </div>
      {n > 1 && parcelas.length > 0 && <TabelaParcelas parcelas={parcelas} aoMudar={setParcelas} />}
      {n > 1 && soma !== totalCent && <p className="erro-texto">As parcelas somam {moeda(soma / 100)}; o total é {moeda(totalCent / 100)}.</p>}
      <Campo rotulo="Observação (opcional)" largo><textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      {erro && <p className="erro-texto">{erro}</p>}
    </Modal>
  );
}

export function TabelaParcelas({ parcelas, aoMudar }: { parcelas: Parcela[]; aoMudar: (p: Parcela[]) => void }) {
  return (
    <div className="tabela-wrap">
      <table className="tabela">
        <thead><tr><th className="num">Parcela</th><th>Vencimento</th><th className="num">Valor</th></tr></thead>
        <tbody>
          {parcelas.map((p, k) => (
            <tr key={k}>
              <td className="num">{k + 1}/{parcelas.length}</td>
              <td><input type="date" value={p.vencimento} onChange={(e) => aoMudar(parcelas.map((x, j) => (j === k ? { ...x, vencimento: e.target.value } : x)))} /></td>
              <td className="num"><CampoValor valor={p.valor} aoMudar={(v) => aoMudar(parcelas.map((x, j) => (j === k ? { ...x, valor: v } : x)))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CampoValor({ valor, aoMudar }: { valor: number; aoMudar: (v: number) => void }) {
  const [txt, setTxt] = useState(escreverNumero(valor));
  useEffect(() => setTxt(escreverNumero(valor)), [valor]);
  return (
    <input className="adm-num" inputMode="decimal" value={txt} aria-label="Valor"
           onChange={(e) => setTxt(e.target.value)}
           onBlur={() => { const v = lerNumero(txt); if (v !== null && v >= 0) aoMudar(Math.round(v * 100) / 100); else setTxt(escreverNumero(valor)); }} />
  );
}

// ================================================================ Janela da conta
type Acao = 'baixar' | 'editar' | 'cancelar' | null;

export function ContaModal({ tipo, conta, aoFechar }: { tipo: TipoConta; conta: ContaPagar | ContaReceber; aoFechar: () => void }) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const categoriasQ = useCategorias(petshop.id);
  const dia0 = hoje(petshop.fuso);
  const [acao, setAcao] = useState<Acao>(null);
  const [data, setData] = useState(dia0);
  const [forma, setForma] = useState('pix');
  const [valorTxt, setValorTxt] = useState(escreverNumero(Number(conta.valor)));
  const [venc, setVenc] = useState(conta.vencimento);
  const [descricao, setDescricao] = useState(conta.descricao);
  const [categoria, setCategoria] = useState(conta.categoria_id);
  const [obs, setObs] = useState(conta.observacao ?? '');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const aberta = conta.status === 'aberta';
  const daCompra = tipo === 'pagar' && !!(conta as ContaPagar).recebimento_id;
  const sit = situacao(conta, dia0);
  const quitada = tipo === 'pagar' ? (conta as ContaPagar) : (conta as ContaReceber);
  const quitadoEm = tipo === 'pagar' ? (conta as ContaPagar).pago_em : (conta as ContaReceber).recebido_em;
  const valorQuitado = tipo === 'pagar' ? (conta as ContaPagar).valor_pago : (conta as ContaReceber).valor_recebido;
  const categorias = (categoriasQ.data ?? []).filter((c) => c.tipo === (tipo === 'pagar' ? 'despesa' : 'receita') && (c.ativo || c.id === conta.categoria_id));

  async function executar(fn: () => Promise<unknown>, ok: string) {
    setErro(null); setOcupado(true);
    try {
      await fn();
      await atualizarContas(qc, petshop.id);
      avisar(ok);
      aoFechar();
    } catch (e) {
      setErro(erroAdm(e));
    } finally {
      setOcupado(false);
    }
  }

  function confirmar() {
    if (acao === 'baixar') {
      const v = lerNumero(valorTxt);
      if (v === null || v < 0) return setErro('Valor inválido.');
      if (!data) return setErro('Informe a data.');
      return executar(() => baixarConta(tipo, conta.id, forma, data, v), tipo === 'pagar' ? 'Conta paga.' : 'Conta recebida.');
    }
    if (acao === 'editar') {
      const v = lerNumero(valorTxt);
      if (!daCompra && (v === null || v <= 0)) return setErro('Valor inválido.');
      if (!descricao.trim()) return setErro('Informe a descrição.');
      return executar(() => editarConta(tipo, conta.id, {
        vencimento: venc, descricao, categoria, observacao: obs,
        valor: daCompra || v === Number(conta.valor) ? undefined : v!,
      }), 'Conta alterada.');
    }
    if (acao === 'cancelar') {
      if (!motivo.trim()) return setErro('Informe o motivo.');
      return executar(() => cancelarConta(tipo, conta.id, motivo), 'Conta cancelada.');
    }
  }

  const rotuloQuitar = tipo === 'pagar' ? 'Registrar pagamento' : 'Registrar recebimento';
  return (
    <Modal titulo={conta.descricao + (conta.parcelas > 1 ? ` (${conta.parcela}/${conta.parcelas})` : '')} aberto aoFechar={aoFechar}
      rodape={acao ? (
        <>
          <button className="btn" disabled={ocupado} onClick={() => { setAcao(null); setErro(null); }}>Voltar</button>
          <button className={`btn ${acao === 'cancelar' ? 'perigo' : 'primario'}`} disabled={ocupado} onClick={confirmar}>
            {acao === 'baixar' ? rotuloQuitar : acao === 'editar' ? 'Salvar' : 'Cancelar conta'}
          </button>
        </>
      ) : (
        <>
          {aberta && <button className="btn" onClick={() => setAcao('cancelar')}>Cancelar conta</button>}
          {aberta && <button className="btn" onClick={() => setAcao('editar')}>Editar</button>}
          {!aberta && <button className="btn" disabled={ocupado} onClick={() => executar(() => reabrirConta(tipo, conta.id), 'Conta reaberta.')}>Reabrir</button>}
          <button className="btn" onClick={aoFechar}>Fechar</button>
          {aberta && <button className="btn primario" onClick={() => setAcao('baixar')}>{rotuloQuitar}</button>}
        </>
      )}>
      {!acao && (
        <dl className="adm-detalhe">
          <dt>Situação</dt><dd><span className={`adm-status ${sit.classe}`}>{sit.texto}</span></dd>
          <dt>Vencimento</dt><dd>{dataCurta(conta.vencimento)}</dd>
          <dt>Valor</dt><dd>{moeda(Number(conta.valor))}</dd>
          <dt>Categoria</dt><dd>{conta.financeiro_categorias?.nome ?? '—'}</dd>
          {tipo === 'pagar' && <><dt>Fornecedor</dt><dd>{(conta as ContaPagar).fornecedores?.nome ?? '—'}</dd></>}
          {tipo === 'receber' && <><dt>Tutor</dt><dd>{(conta as ContaReceber).tutor_petshop?.nome ?? '—'}</dd></>}
          {conta.documento && <><dt>Documento</dt><dd>{conta.documento}</dd></>}
          {daCompra && <><dt>Origem</dt><dd>Recebimento de compra</dd></>}
          {quitadoEm && <><dt>{tipo === 'pagar' ? 'Pago em' : 'Recebido em'}</dt><dd>{dataCurta(quitadoEm)} · {moeda(Number(valorQuitado))}{quitada.forma_pagamento ? ` · ${FORMAS[quitada.forma_pagamento] ?? quitada.forma_pagamento}` : ''}</dd></>}
          {conta.motivo && <><dt>Motivo</dt><dd>{conta.motivo}</dd></>}
          {conta.observacao && <><dt>Observação</dt><dd>{conta.observacao}</dd></>}
        </dl>
      )}
      {acao === 'baixar' && (
        <div className="linha-campos">
          <Campo rotulo="Data"><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
          <Campo rotulo="Forma">
            <select value={forma} onChange={(e) => setForma(e.target.value)}>
              {Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Valor" dica="Com juros ou desconto, informe o valor efetivo"><input inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} /></Campo>
        </div>
      )}
      {acao === 'editar' && (
        <>
          <div className="linha-campos">
            <Campo rotulo="Descrição"><input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Campo>
            <Campo rotulo="Categoria">
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
          </div>
          <div className="linha-campos">
            <Campo rotulo="Vencimento"><input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></Campo>
            <Campo rotulo="Valor" dica={daCompra ? 'Vem do recebimento de compra' : undefined}>
              <input inputMode="decimal" value={valorTxt} disabled={daCompra} onChange={(e) => setValorTxt(e.target.value)} />
            </Campo>
          </div>
          <Campo rotulo="Observação" largo><textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
        </>
      )}
      {acao === 'cancelar' && (
        <Campo rotulo="Motivo" largo><textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>
      )}
      {erro && <p className="erro-texto">{erro}</p>}
    </Modal>
  );
}
