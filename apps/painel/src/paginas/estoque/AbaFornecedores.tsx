// ES-08 · Fornecedores (dono, gerente e estoquista: a RLS só mostra para eles).
// Fornecedor usado em pedido ou recebimento não se apaga: desativa.
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import { erroAdm, salvarFornecedor, useFornecedores, type Fornecedor, type FornecedorForm } from '../../lib/administracao';
import { normalizar } from '../../lib/formato';
import { Campo, Carregando, Modal, Vazio, useAvisos } from '../../componentes/ui';

export function AbaFornecedores({ podeEditar }: { podeEditar: boolean }) {
  const { petshop } = usePetshop();
  const q = useFornecedores(petshop.id);
  const [busca, setBusca] = useState('');
  const [inativos, setInativos] = useState(false);
  const [aberto, setAberto] = useState<string | 'novo' | null>(null);
  const todos = q.data ?? [];
  const lista = useMemo(() => {
    const t = normalizar(busca.trim());
    return todos.filter((f) => (inativos || f.ativo)
      && (!t || [f.nome, f.documento, f.contato, f.email].some((x) => x && normalizar(x).includes(t))));
  }, [todos, busca, inativos]);

  if (q.isLoading) return <Carregando />;
  return (
    <div className="aba-corpo adm-larga">
      <div className="barra">
        <input className="busca larga" placeholder="Buscar fornecedor…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar fornecedor" />
        <label className="check"><input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> mostrar inativos</label>
        {podeEditar && <button className="btn primario adm-direita" onClick={() => setAberto('novo')}>+ Novo fornecedor</button>}
      </div>
      {lista.length === 0 ? (
        <Vazio>{todos.length === 0 ? 'Nenhum fornecedor ainda. Cadastre quem vende os seus insumos.' : 'Nada encontrado.'}</Vazio>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Fornecedor</th><th>Contato</th><th>Telefone</th><th>E-mail</th><th className="num">Prazo</th></tr></thead>
            <tbody>
              {lista.map((f) => (
                <tr key={f.id} className={`clicavel${f.ativo ? '' : ' inativo'}`} onClick={() => setAberto(f.id)}>
                  <td><b>{f.nome}</b>{f.documento && <div className="mudo adm-pequeno">{f.documento}</div>}{!f.ativo && <span className="tag">inativo</span>}</td>
                  <td>{f.contato ?? <span className="mudo">—</span>}</td>
                  <td>{f.telefone ?? <span className="mudo">—</span>}</td>
                  <td>{f.email ?? <span className="mudo">—</span>}</td>
                  <td className="num">{f.prazo_entrega_dias === null ? <span className="mudo">—</span> : `${f.prazo_entrega_dias} dia${f.prazo_entrega_dias === 1 ? '' : 's'}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {aberto && (
        <FornecedorModal
          fornecedor={aberto === 'novo' ? null : todos.find((f) => f.id === aberto) ?? null}
          podeEditar={podeEditar}
          aoFechar={() => setAberto(null)}
        />
      )}
    </div>
  );
}

function FornecedorModal({ fornecedor, podeEditar, aoFechar }: { fornecedor: Fornecedor | null; podeEditar: boolean; aoFechar: () => void }) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [f, setF] = useState<FornecedorForm>({
    nome: fornecedor?.nome ?? '',
    documento: fornecedor?.documento ?? '',
    contato: fornecedor?.contato ?? '',
    telefone: fornecedor?.telefone ?? '',
    email: fornecedor?.email ?? '',
    prazo_entrega_dias: fornecedor?.prazo_entrega_dias ?? null,
    observacao: fornecedor?.observacao ?? '',
    ativo: fornecedor?.ativo ?? true,
  });
  const [prazoTxt, setPrazoTxt] = useState(fornecedor?.prazo_entrega_dias == null ? '' : String(fornecedor.prazo_entrega_dias));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const muda = <K extends keyof FornecedorForm>(k: K, v: FornecedorForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const leitura = !podeEditar;

  async function salvar() {
    setErro(null);
    if (!f.nome.trim()) return setErro('Informe o nome do fornecedor.');
    const prazo = prazoTxt.trim() === '' ? null : Number(prazoTxt);
    if (prazo !== null && (!Number.isInteger(prazo) || prazo < 0)) return setErro('Prazo de entrega em dias inteiros.');
    if (f.email && f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) return setErro('E-mail inválido.');
    setSalvando(true);
    try {
      await salvarFornecedor(petshop.id, { ...f, prazo_entrega_dias: prazo }, fornecedor?.id);
      await qc.invalidateQueries({ queryKey: [petshop.id, 'fornecedores'] });
      avisar(fornecedor ? 'Fornecedor salvo.' : `${f.nome.trim()} cadastrado.`);
      aoFechar();
    } catch (e) {
      setErro(erroAdm(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={fornecedor ? fornecedor.nome : 'Novo fornecedor'}
      aberto
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn" onClick={aoFechar}>{leitura ? 'Fechar' : 'Cancelar'}</button>
          {!leitura && <button className="btn primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>}
        </>
      }
    >
      <div className="linha-campos">
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => muda('nome', e.target.value)} disabled={leitura} autoFocus={!fornecedor} /></Campo>
        <Campo rotulo="CNPJ ou CPF (opcional)"><input value={f.documento ?? ''} onChange={(e) => muda('documento', e.target.value)} disabled={leitura} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Contato (opcional)" dica="Nome de quem atende"><input value={f.contato ?? ''} onChange={(e) => muda('contato', e.target.value)} disabled={leitura} /></Campo>
        <Campo rotulo="Telefone (opcional)"><input inputMode="tel" value={f.telefone ?? ''} onChange={(e) => muda('telefone', e.target.value)} disabled={leitura} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="E-mail (opcional)"><input type="email" value={f.email ?? ''} onChange={(e) => muda('email', e.target.value)} disabled={leitura} /></Campo>
        <Campo rotulo="Prazo de entrega (dias, opcional)"><input inputMode="numeric" value={prazoTxt} onChange={(e) => setPrazoTxt(e.target.value)} disabled={leitura} /></Campo>
      </div>
      <Campo rotulo="Observação (opcional)" largo>
        <textarea rows={2} value={f.observacao ?? ''} onChange={(e) => muda('observacao', e.target.value)} disabled={leitura} />
      </Campo>
      {fornecedor && !leitura && (
        <label className="check adm-espaco"><input type="checkbox" checked={f.ativo} onChange={(e) => muda('ativo', e.target.checked)} /> Fornecedor ativo</label>
      )}
      {erro && <p className="erro-texto">{erro}</p>}
    </Modal>
  );
}
