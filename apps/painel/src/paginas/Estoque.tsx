// Administração · Estoque (arquivo 22).
// Nesta rodada: Produtos (com embalagens e mínimo por local), Fornecedores e Locais.
// Próximas: requisições, transferências, inventário; Compras e Contas em páginas próprias.
import { useState } from 'react';
import { usePetshop } from '../contexto/PetshopAtual';
import { usePermissoesEstoque, usePrepararAdministracao } from '../lib/administracao';
import { erroAdm } from '../lib/administracao';
import { Carregando } from '../componentes/ui';
import { AbaProdutos } from './estoque/AbaProdutos';
import { AbaFornecedores } from './estoque/AbaFornecedores';
import { AbaLocais } from './estoque/AbaLocais';
import '../administracao.css';

type Aba = 'produtos' | 'fornecedores' | 'locais';

export function Estoque() {
  const { petshop } = usePetshop();
  const preparo = usePrepararAdministracao(petshop.id);
  const perm = usePermissoesEstoque(petshop.id);
  const [aba, setAba] = useState<Aba>('produtos');

  // Fornecedores: só quem compra (dono, gerente, estoquista) lê pela RLS.
  const abas: [Aba, string][] = [
    ['produtos', 'Produtos'],
    ...(perm.estoque ? ([['fornecedores', 'Fornecedores']] as [Aba, string][]) : []),
    ['locais', 'Locais'],
  ];

  return (
    <div className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Estoque</h1>
          <p className="mudo">Produtos de insumo e de venda, embalagens, locais e mínimos</p>
        </div>
      </header>
      <nav className="abas" role="tablist">
        {abas.map(([id, rotulo]) => (
          <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? 'ativo' : ''} onClick={() => setAba(id)}>
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
          {aba === 'produtos' && <AbaProdutos perm={perm} />}
          {aba === 'fornecedores' && perm.estoque && <AbaFornecedores podeEditar={perm.estoque} />}
          {aba === 'locais' && <AbaLocais podeEditar={perm.config} />}
        </>
      )}
    </div>
  );
}
