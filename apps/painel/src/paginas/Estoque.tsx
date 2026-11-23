// Administração · Estoque (arquivos 22 e 23).
// Dia a dia: requisições do salão, avisos de reposição, transferências e inventário.
// Cadastro: produtos (embalagens e mínimo por local), fornecedores e locais.
// Cada aba aparece conforme o papel; o banco confere de novo em cada ação.
import { useState } from 'react';
import { usePetshop } from '../contexto/PetshopAtual';
import { erroAdm, useLocais, usePermissoesEstoque, usePrepararAdministracao } from '../lib/administracao';
import { useAvisosEstoque } from '../lib/movimentos';
import { Carregando } from '../componentes/ui';
import { AbaRequisicoes } from './estoque/AbaRequisicoes';
import { AbaAvisos } from './estoque/AbaAvisos';
import { AbaTransferencias } from './estoque/AbaTransferencias';
import { AbaInventario } from './estoque/AbaInventario';
import { AbaProdutos } from './estoque/AbaProdutos';
import { AbaFornecedores } from './estoque/AbaFornecedores';
import { AbaLocais } from './estoque/AbaLocais';
import '../administracao.css';

type Aba = 'requisicoes' | 'avisos' | 'transferencias' | 'inventario' | 'produtos' | 'fornecedores' | 'locais';

export function Estoque() {
  const { petshop, tem } = usePetshop();
  const preparo = usePrepararAdministracao(petshop.id);
  const perm = usePermissoesEstoque(petshop.id);
  const locaisQ = useLocais(petshop.id);
  const avisosQ = useAvisosEstoque(petshop.id);
  const comRequisicao = tem('administracao.almoxarifado');
  const [aba, setAba] = useState<Aba | null>(null);

  const variosLocais = (locaisQ.data ?? []).filter((l) => l.ativo).length > 1;
  const nAvisos = (avisosQ.data ?? []).length;
  const abas: [Aba, string][] = [
    ...(comRequisicao ? [['requisicoes', 'Requisições'] as [Aba, string]] : []),
    ['avisos', `Reposição${nAvisos ? ` (${nAvisos})` : ''}`],
    ...(variosLocais ? [['transferencias', 'Transferências'] as [Aba, string]] : []),
    ...(perm.estoque ? [['inventario', 'Inventário'] as [Aba, string]] : []),
    ['produtos', 'Produtos'],
    ...(perm.estoque ? [['fornecedores', 'Fornecedores'] as [Aba, string]] : []),
    ['locais', 'Locais'],
  ];
  const atual: Aba = aba && abas.some(([id]) => id === aba) ? aba : abas[0][0];

  return (
    <div className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Estoque</h1>
          <p className="mudo">Requisições do salão, reposição, inventário e cadastro de produtos</p>
        </div>
      </header>
      <nav className="abas" role="tablist">
        {abas.map(([id, rotulo]) => (
          <button key={id} role="tab" aria-selected={atual === id} className={atual === id ? 'ativo' : ''} onClick={() => setAba(id)}>
            {rotulo}
          </button>
        ))}
      </nav>
      {preparo.isLoading || perm.carregando ? (
        <Carregando />
      ) : preparo.error ? (
        <p className="erro-texto destaque">{erroAdm(preparo.error)}</p>
      ) : (
        <>
          {atual === 'requisicoes' && <AbaRequisicoes perm={perm} />}
          {atual === 'avisos' && <AbaAvisos perm={perm} aoVerRequisicoes={() => setAba('requisicoes')} />}
          {atual === 'transferencias' && <AbaTransferencias perm={perm} />}
          {atual === 'inventario' && <AbaInventario perm={perm} />}
          {atual === 'produtos' && <AbaProdutos perm={perm} />}
          {atual === 'fornecedores' && <AbaFornecedores podeEditar={perm.estoque} />}
          {atual === 'locais' && <AbaLocais podeEditar={perm.config} />}
        </>
      )}
    </div>
  );
}
