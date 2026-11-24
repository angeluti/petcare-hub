// FN-06 · Categorias de despesa e de receita. As de sistema (usadas pelas compras
// e pelos atendimentos) podem ser renomeadas, mas não desativadas nem apagadas.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import { erroAdm } from '../../lib/administracao';
import { salvarCategoria, useCategorias, type Categoria } from '../../lib/contas';
import { Carregando, useAvisos } from '../../componentes/ui';

export function AbaCategorias() {
  const { petshop } = usePetshop();
  const q = useCategorias(petshop.id);
  if (q.isLoading) return <Carregando />;
  const todas = q.data ?? [];
  return (
    <div className="aba-corpo adm-categorias">
      <Lista tipo="despesa" titulo="Despesas" categorias={todas.filter((c) => c.tipo === 'despesa')} petshopId={petshop.id} />
      <Lista tipo="receita" titulo="Receitas" categorias={todas.filter((c) => c.tipo === 'receita')} petshopId={petshop.id} />
    </div>
  );
}

function Lista({ tipo, titulo, categorias, petshopId }: { tipo: 'despesa' | 'receita'; titulo: string; categorias: Categoria[]; petshopId: string }) {
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [nova, setNova] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(fn: () => Promise<void>, ok: string) {
    setErro(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: [petshopId, 'financeiro_categorias'] });
      avisar(ok);
      return true;
    } catch (e) {
      setErro(erroAdm(e));
      return false;
    }
  }

  return (
    <section>
      <h3 className="adm-subtitulo">{titulo}</h3>
      <ul className="adm-cat-lista">
        {categorias.map((c) => <LinhaCategoria key={c.id} c={c} salvar={(nome, ativo) => salvar(() => salvarCategoria(petshopId, { tipo, nome, ativo }, c.id), 'Categoria salva.')} />)}
      </ul>
      <div className="input-com-botao">
        <input value={nova} placeholder={`Nova categoria de ${tipo}`} onChange={(e) => setNova(e.target.value)} aria-label={`Nova categoria de ${tipo}`} />
        <button className="btn" disabled={!nova.trim()}
                onClick={async () => { if (await salvar(() => salvarCategoria(petshopId, { tipo, nome: nova, ativo: true }), 'Categoria criada.')) setNova(''); }}>Incluir</button>
      </div>
      {erro && <p className="erro-texto">{erro}</p>}
    </section>
  );
}

function LinhaCategoria({ c, salvar }: { c: Categoria; salvar: (nome: string, ativo: boolean) => Promise<boolean> }) {
  const [nome, setNome] = useState(c.nome);
  return (
    <li className={c.ativo ? '' : 'inativo'}>
      <input value={nome} aria-label="Nome da categoria" onChange={(e) => setNome(e.target.value)}
             onBlur={() => { if (nome.trim() && nome.trim() !== c.nome) void salvar(nome, c.ativo); else setNome(c.nome); }} />
      {c.codigo ? <span className="tag">usada pelo sistema</span> : (
        <button className="btn-link" onClick={() => void salvar(c.nome, !c.ativo)}>{c.ativo ? 'desativar' : 'reativar'}</button>
      )}
    </li>
  );
}
