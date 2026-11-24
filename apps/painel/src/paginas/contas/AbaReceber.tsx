// FN-02 · Contas a receber: fiados do check-out (calculados dos atendimentos) e
// lançamentos manuais. O fiado é recebido pela RPC receber_agendamento, com a
// mesma regra de situação do check-out.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import { erroAdm, escreverNumero, lerNumero } from '../../lib/administracao';
import {
  FORMAS, FORMAS_ATENDIMENTO, atualizarContas, receberAtendimento, useContasReceberManuais, useReceberAbertas,
  type ContaReceber, type ReceberAberta,
} from '../../lib/contas';
import { moeda, normalizar } from '../../lib/formato';
import { hoje } from '../../lib/tempo';
import { Campo, Carregando, Modal, Vazio, useAvisos } from '../../componentes/ui';
import { dataCurta } from '../compras/comum';
import { ContaModal, LancarModal, Resumo, situacao } from './comum';

export function AbaReceber() {
  const { petshop } = usePetshop();
  const abertasQ = useReceberAbertas(petshop.id, true);
  const manuaisQ = useContasReceberManuais(petshop.id, true);
  const [historico, setHistorico] = useState(false);
  const [busca, setBusca] = useState('');
  const [lancando, setLancando] = useState(false);
  const [fiado, setFiado] = useState<ReceberAberta | null>(null);
  const [manual, setManual] = useState<ContaReceber | null>(null);
  const dia = hoje(petshop.fuso);
  const t = normalizar(busca.trim());

  if (abertasQ.isLoading || manuaisQ.isLoading) return <Carregando />;
  const abertas = (abertasQ.data ?? []).filter((a) => !t || [a.descricao, a.tutor].some((x) => x && normalizar(x).includes(t)))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const todas = abertasQ.data ?? [];
  const atrasadas = todas.filter((a) => a.vencimento < dia);
  const fiados = todas.filter((a) => a.origem === 'agendamento');
  const soma = (l: ReceberAberta[]) => l.reduce((s, a) => s + Number(a.saldo), 0);
  const manuais = (manuaisQ.data ?? []).filter((c) => c.status !== 'aberta')
    .filter((c) => !t || [c.descricao, c.tutor_petshop?.nome].some((x) => x && normalizar(x).includes(t)))
    .sort((a, b) => (b.recebido_em ?? b.vencimento).localeCompare(a.recebido_em ?? a.vencimento));

  function abrir(a: ReceberAberta) {
    if (a.origem === 'agendamento') setFiado(a);
    else setManual((manuaisQ.data ?? []).find((c) => c.id === a.id) ?? null);
  }

  return (
    <div className="aba-corpo adm-larga">
      <Resumo itens={[
        { rotulo: 'Em atraso', valor: soma(atrasadas), qtd: atrasadas.length, destaque: true },
        { rotulo: 'Atendimentos a receber', valor: soma(fiados), qtd: fiados.length },
        { rotulo: 'Em aberto', valor: soma(todas), qtd: todas.length },
      ]} />
      <div className="barra">
        <input className="busca" placeholder="Tutor ou descrição…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        <div className="segmentado pequeno" role="group" aria-label="Filtro">
          <button className={!historico ? 'ativo' : ''} onClick={() => setHistorico(false)}>Em aberto</button>
          <button className={historico ? 'ativo' : ''} onClick={() => setHistorico(true)}>Recebidas e canceladas</button>
        </div>
        <button className="btn primario adm-direita" onClick={() => setLancando(true)}>+ Lançar conta a receber</button>
      </div>

      {!historico ? (
        abertas.length === 0 ? <Vazio>Nada a receber em aberto. Atendimentos fechados como fiado ou com pagamento parcial aparecem aqui.</Vazio> : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead><tr><th>Vencimento</th><th>Descrição</th><th>Tutor</th><th>Origem</th><th className="num">Valor</th><th className="num">A receber</th><th>Situação</th></tr></thead>
              <tbody>
                {abertas.map((a) => {
                  const s = situacao({ status: 'aberta', vencimento: a.vencimento }, dia);
                  return (
                    <tr key={`${a.origem}-${a.id}`} className="clicavel" onClick={() => abrir(a)}>
                      <td>{dataCurta(a.vencimento)}</td>
                      <td>{a.descricao}</td>
                      <td>{a.tutor ?? <span className="mudo">—</span>}</td>
                      <td>{a.origem === 'agendamento' ? 'Atendimento' : 'Lançamento'}</td>
                      <td className="num">{moeda(Number(a.valor))}</td>
                      <td className="num"><b>{moeda(Number(a.saldo))}</b></td>
                      <td><span className={`adm-status ${s.classe}`}>{s.texto}{a.dias_atraso > 0 ? ` · ${a.dias_atraso} dia${a.dias_atraso === 1 ? '' : 's'}` : ''}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        manuais.length === 0 ? <Vazio>Nenhum lançamento recebido ou cancelado. Fiados quitados saem da lista e ficam nos pagamentos do atendimento.</Vazio> : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead><tr><th>Vencimento</th><th>Descrição</th><th>Tutor</th><th className="num">Valor</th><th>Situação</th></tr></thead>
              <tbody>
                {manuais.map((c) => {
                  const s = situacao(c, dia);
                  return (
                    <tr key={c.id} className={`clicavel${c.status === 'cancelada' ? ' inativo' : ''}`} onClick={() => setManual(c)}>
                      <td>{dataCurta(c.vencimento)}</td>
                      <td>{c.descricao}{c.parcelas > 1 && <span className="mudo"> ({c.parcela}/{c.parcelas})</span>}</td>
                      <td>{c.tutor_petshop?.nome ?? <span className="mudo">—</span>}</td>
                      <td className="num">{moeda(Number(c.status === 'recebida' ? c.valor_recebido ?? c.valor : c.valor))}</td>
                      <td><span className={`adm-status ${s.classe}`}>{s.texto}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {lancando && <LancarModal tipo="receber" aoFechar={() => setLancando(false)} />}
      {fiado && <ReceberFiado key={fiado.id} conta={fiado} aoFechar={() => setFiado(null)} />}
      {manual && <ContaModal key={manual.id} tipo="receber" conta={manual} aoFechar={() => setManual(null)} />}
    </div>
  );
}

function ReceberFiado({ conta, aoFechar }: { conta: ReceberAberta; aoFechar: () => void }) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [forma, setForma] = useState('pix');
  const [valorTxt, setValorTxt] = useState(escreverNumero(Number(conta.saldo)));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function receber() {
    setErro(null);
    const v = lerNumero(valorTxt);
    if (v === null || v <= 0) return setErro('Informe o valor recebido.');
    if (Math.round(v * 100) > Math.round(Number(conta.saldo) * 100)) return setErro(`O saldo a receber é ${moeda(Number(conta.saldo))}.`);
    setSalvando(true);
    try {
      await receberAtendimento(conta.id, forma, Math.round(v * 100) / 100);
      await atualizarContas(qc, petshop.id);
      avisar(Math.round(v * 100) === Math.round(Number(conta.saldo) * 100) ? 'Atendimento quitado.' : 'Recebimento parcial registrado.');
      aoFechar();
    } catch (e) {
      setErro(erroAdm(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Receber atendimento" aberto aoFechar={aoFechar}
           rodape={<><button className="btn" onClick={aoFechar}>Cancelar</button>
                     <button className="btn primario" disabled={salvando} onClick={receber}>{salvando ? 'Registrando…' : 'Registrar recebimento'}</button></>}>
      <p>{conta.descricao}{conta.tutor ? ` · ${conta.tutor}` : ''}</p>
      <p className="mudo">Total {moeda(Number(conta.valor))} · já recebido {moeda(Number(conta.recebido))} · a receber <b>{moeda(Number(conta.saldo))}</b></p>
      <div className="linha-campos">
        <Campo rotulo="Forma">
          <select value={forma} onChange={(e) => setForma(e.target.value)}>
            {FORMAS_ATENDIMENTO.map((k) => <option key={k} value={k}>{FORMAS[k]}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Valor recebido agora"><input inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} /></Campo>
      </div>
      <p className="nota">O pagamento entra no atendimento, como no check-out. Quando o valor fecha o total, o atendimento fica pago.</p>
      {erro && <p className="erro-texto">{erro}</p>}
    </Modal>
  );
}
