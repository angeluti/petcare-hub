// Administração · Contas (FN-02 a receber, FN-03 a pagar, FN-06 categorias).
// Só dono e gerente (papéis efetivos; a RLS "financeiro" garante).
import { useState } from 'react';
import { usePetshop } from '../contexto/PetshopAtual';
import { erroAdm, usePermissoesEstoque, usePrepararAdministracao } from '../lib/administracao';
import { Carregando, Vazio } from '../componentes/ui';
import { AbaPagar } from './contas/AbaPagar';
import { AbaReceber } from './contas/AbaReceber';
import { AbaCategorias } from './contas/AbaCategorias';
import '../administracao.css';

type Aba = 'pagar' | 'receber' | 'categorias';

export function Contas() {
  const { petshop, tem } = usePetshop();
  const preparo = usePrepararAdministracao(petshop.id);
  const perm = usePermissoesEstoque(petshop.id);
  const abas: [Aba, string][] = [
    ...(tem('administracao.contas_pagar') ? [['pagar', 'A pagar'] as [Aba, string]] : []),
    ...(tem('administracao.contas_receber') ? [['receber', 'A receber'] as [Aba, string]] : []),
    ['categorias', 'Categorias'],
  ];
  const [aba, setAba] = useState<Aba>(abas[0][0]);

  return (
    <div className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Contas</h1>
          <p className="mudo">O que o pet shop tem a pagar e a receber</p>
        </div>
      </header>
      {preparo.isLoading || perm.carregando ? <Carregando /> : preparo.error ? (
        <p className="erro-texto destaque">{erroAdm(preparo.error)}</p>
      ) : !perm.config ? (
        <Vazio>Contas é usada pelo dono e pelo gerente.</Vazio>
      ) : (
        <>
          <nav className="abas" role="tablist">
            {abas.map(([id, rotulo]) => (
              <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? 'ativo' : ''} onClick={() => setAba(id)}>{rotulo}</button>
            ))}
          </nav>
          {aba === 'pagar' && <AbaPagar />}
          {aba === 'receber' && <AbaReceber />}
          {aba === 'categorias' && <AbaCategorias />}
        </>
      )}
    </div>
  );
}
