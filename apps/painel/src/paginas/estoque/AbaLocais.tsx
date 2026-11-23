// ES-13 · Locais de estoque (dono e gerente editam; a RLS "config" garante).
// Vários locais dependem da funcionalidade administracao.estoque_locais (o banco também barra).
// Local com saldo não desativa; o local padrão precisa de substituto antes.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import {
  TIPOS_LOCAL, erroAdm, salvarLocal, useLocais, useProdutos, type Local, type LocalForm, type TipoLocal,
} from '../../lib/administracao';
import { Campo, Carregando, Modal, useAvisos } from '../../componentes/ui';

export function AbaLocais({ podeEditar }: { podeEditar: boolean }) {
  const { petshop, tem } = usePetshop();
  const q = useLocais(petshop.id);
  const produtosQ = useProdutos(petshop.id);
  const [aberto, setAberto] = useState<string | 'novo' | null>(null);
  const locais = q.data ?? [];
  const ativos = locais.filter((l) => l.ativo).length;
  const variosLocais = tem('administracao.estoque_locais');
  const podeCriar = podeEditar && (variosLocais || ativos === 0);

  const comSaldo = (id: string) =>
    (produtosQ.data ?? []).filter((p) => p.estoque_saldos.some((s) => s.local_id === id && Number(s.quantidade) > 0)).length;

  if (q.isLoading) return <Carregando />;
  return (
    <div className="aba-corpo">
      <p className="mudo">
        Onde o estoque fica guardado. A requisição do salão sai do local padrão de requisição; a compra entra no local padrão de entrada.
        O salão não é um local: o que vai para ele já saiu do estoque.
      </p>
      <div className="adm-locais">
        {locais.map((l) => (
          <button key={l.id} className={`adm-local${l.ativo ? '' : ' inativo'}`} onClick={() => setAberto(l.id)}>
            <span className="adm-local-nome">{l.nome}</span>
            <span className="adm-local-tipo">{TIPOS_LOCAL[l.tipo]}{!l.ativo && ' · inativo'}</span>
            <span className="adm-local-selos">
              {l.padrao_requisicao && <span className="adm-selo">sai a requisição</span>}
              {l.padrao_entrada && <span className="adm-selo">entra a compra</span>}
            </span>
            <span className="mudo adm-pequeno">{comSaldo(l.id)} produto{comSaldo(l.id) === 1 ? '' : 's'} com saldo</span>
          </button>
        ))}
      </div>
      {podeCriar && <div><button className="btn" onClick={() => setAberto('novo')}>+ Novo local</button></div>}
      {podeEditar && !variosLocais && ativos > 0 && (
        <p className="nota">O plano deste pet shop inclui um local de estoque. Para separar almoxarifado e prateleira de venda, fale com a equipe PetCare Hub.</p>
      )}
      {aberto && (
        <LocalModal
          local={aberto === 'novo' ? null : locais.find((l) => l.id === aberto) ?? null}
          podeEditar={podeEditar}
          aoFechar={() => setAberto(null)}
        />
      )}
    </div>
  );
}

function LocalModal({ local, podeEditar, aoFechar }: { local: Local | null; podeEditar: boolean; aoFechar: () => void }) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [f, setF] = useState<LocalForm>({
    nome: local?.nome ?? '',
    tipo: local?.tipo ?? 'almoxarifado',
    padrao_requisicao: local?.padrao_requisicao ?? false,
    padrao_entrada: local?.padrao_entrada ?? false,
    ativo: local?.ativo ?? true,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const muda = <K extends keyof LocalForm>(k: K, v: LocalForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const leitura = !podeEditar;

  async function salvar() {
    setErro(null);
    if (!f.nome.trim()) return setErro('Informe o nome do local.');
    setSalvando(true);
    try {
      await salvarLocal(petshop.id, f, local?.id);
      await qc.invalidateQueries({ queryKey: [petshop.id, 'estoque_locais'] });
      avisar(local ? 'Local salvo.' : `Local ${f.nome.trim()} criado.`);
      aoFechar();
    } catch (e) {
      setErro(erroAdm(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={local ? local.nome : 'Novo local'}
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
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => muda('nome', e.target.value)} disabled={leitura} autoFocus={!local} /></Campo>
        <Campo rotulo="Tipo" dica={f.tipo === 'venda' ? 'Só recebe produtos marcados como venda' : undefined}>
          <select value={f.tipo} disabled={leitura}
                  onChange={(e) => { const t = e.target.value as TipoLocal; setF((x) => ({ ...x, tipo: t, padrao_requisicao: t === 'venda' ? false : x.padrao_requisicao })); }}>
            {(Object.keys(TIPOS_LOCAL) as TipoLocal[]).map((t) => <option key={t} value={t}>{TIPOS_LOCAL[t]}</option>)}
          </select>
        </Campo>
      </div>
      <div className="checks adm-checks adm-espaco">
        <label className="check">
          <input type="checkbox" checked={f.padrao_requisicao} disabled={leitura || f.tipo === 'venda'}
                 onChange={(e) => muda('padrao_requisicao', e.target.checked)} />
          Origem padrão das requisições do salão
        </label>
        <label className="check">
          <input type="checkbox" checked={f.padrao_entrada} disabled={leitura} onChange={(e) => muda('padrao_entrada', e.target.checked)} />
          Destino padrão das compras recebidas
        </label>
        {local && (
          <label className="check">
            <input type="checkbox" checked={f.ativo} disabled={leitura} onChange={(e) => muda('ativo', e.target.checked)} /> Local ativo
          </label>
        )}
      </div>
      <p className="nota">Marcar como padrão tira a marca do local que era padrão antes.</p>
      {erro && <p className="erro-texto">{erro}</p>}
    </Modal>
  );
}
