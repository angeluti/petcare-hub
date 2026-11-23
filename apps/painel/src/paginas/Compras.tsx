// Administração · Compras (ES-15 pedido de compra, ES-04 recebimento e entrada sem pedido).
// Só dono, gerente e estoquista (papéis efetivos, os mesmos da RLS).
import { useState } from 'react';
import { usePetshop } from '../contexto/PetshopAtual';
import { erroAdm, usePermissoesEstoque, usePrepararAdministracao } from '../lib/administracao';
import { Carregando, Vazio } from '../componentes/ui';
import { AbaPedidos } from './compras/AbaPedidos';
import { AbaRecebimentos } from './compras/AbaRecebimentos';
import '../administracao.css';

type Aba = 'pedidos' | 'recebimentos';

export function Compras() {
  const { petshop } = usePetshop();
  const preparo = usePrepararAdministracao(petshop.id);
  const perm = usePermissoesEstoque(petshop.id);
  const [aba, setAba] = useState<Aba>('pedidos');

  return (
    <div className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Compras</h1>
          <p className="mudo">Pedidos aos fornecedores e entrada do que chegou</p>
        </div>
      </header>
      {preparo.isLoading || perm.carregando ? (
        <Carregando />
      ) : preparo.error ? (
        <p className="erro-texto destaque">{erroAdm(preparo.error)}</p>
      ) : !perm.estoque ? (
        <Vazio>Compras é usada pelo dono, pelo gerente e pelo estoquista.</Vazio>
      ) : (
        <>
          <nav className="abas" role="tablist">
            {([['pedidos', 'Pedidos'], ['recebimentos', 'Recebimentos']] as [Aba, string][]).map(([id, rotulo]) => (
              <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? 'ativo' : ''} onClick={() => setAba(id)}>
                {rotulo}
              </button>
            ))}
          </nav>
          {aba === 'pedidos' ? <AbaPedidos /> : <AbaRecebimentos />}
        </>
      )}
    </div>
  );
}
