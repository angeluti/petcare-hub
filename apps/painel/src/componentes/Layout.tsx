// Menu montado pelas funcionalidades ligadas no plano do pet shop
// (RPC minhas_funcionalidades) e pelo papel do usuário.
import { NavLink, Outlet } from 'react-router';
import { usePetshop } from '../contexto/PetshopAtual';
import { useSessao } from '../contexto/Sessao';
import { Logo } from './Logo';

interface ItemMenu { to: string; rotulo: string; icone: string; exige?: string; soConfig?: boolean }

export const MENU: ItemMenu[] = [
  { to: '/agenda', rotulo: 'Agenda', icone: '▦', exige: 'spa.agenda' },
  { to: '/clientes', rotulo: 'Tutores e pets', icone: '◉', exige: 'spa.agenda' },
  { to: '/conversas', rotulo: 'Atendimento humano', icone: '✆', exige: 'spa.bot' },
  { to: '/relatorios', rotulo: 'Relatórios', icone: '▤', exige: 'spa.relatorios', soConfig: true },
  { to: '/estoque', rotulo: 'Estoque', icone: '▥', exige: 'administracao.estoque' },
  { to: '/compras', rotulo: 'Compras', icone: '▧', exige: 'administracao.compras' },
  { to: '/contas', rotulo: 'Contas', icone: '▦', exige: 'administracao.contas_receber', soConfig: true },
  { to: '/configuracao', rotulo: 'Configuração', icone: '⚙', soConfig: true },
];

// Ligadas no plano, mas ainda não construídas no painel: aparecem como "em breve".
const EM_BREVE: { rotulo: string; exige: string }[] = [
  { rotulo: 'Caixa', exige: 'administracao.caixa' },
  { rotulo: 'Hotel e creche', exige: 'daycare.hotel' },
  { rotulo: 'Prontuário', exige: 'vet.prontuario' },
];

export function itensVisiveis(tem: (c: string) => boolean, podeConfigurar: boolean) {
  return MENU.filter((i) => (!i.exige || tem(i.exige)) && (!i.soConfig || podeConfigurar));
}

export function Layout() {
  const { petshop, vinculos, trocar, tem, podeConfigurar, papel } = usePetshop();
  const { sessao, sair } = useSessao();
  const itens = itensVisiveis(tem, podeConfigurar);
  const breve = EM_BREVE.filter((i) => tem(i.exige));

  return (
    <div className="app">
      <aside className="lateral">
        {/* Sidebar aberta (desktop): logo horizontal. Recolhida (barra do celular): só o símbolo. */}
        <NavLink to="/" className="marca" aria-label="PetCare Hub, início">
          <Logo tipo="horizontal" altura={40} className="marca-horizontal" />
          <Logo tipo="simbolo" altura={32} className="marca-simbolo" />
        </NavLink>

        {vinculos.length > 1 ? (
          <select className="seletor-petshop" value={petshop.id} onChange={(e) => trocar(e.target.value)} aria-label="Pet shop">
            {vinculos.map((v) => (
              <option key={v.petshop.id} value={v.petshop.id}>{v.petshop.nome}</option>
            ))}
          </select>
        ) : (
          <div className="petshop-nome">
            {petshop.logo_url && <img src={petshop.logo_url} alt="" width={28} height={28} />}
            <span>{petshop.nome}</span>
          </div>
        )}

        <nav className="menu">
          {itens.map((i) => (
            <NavLink key={i.to} to={i.to} className={({ isActive }) => (isActive ? 'menu-item ativo' : 'menu-item')}>
              <span className="menu-icone" aria-hidden>{i.icone}</span>
              {i.rotulo}
            </NavLink>
          ))}
        </nav>

        {breve.length > 0 && (
          <div className="menu-breve">
            <span className="menu-breve-titulo">No seu plano · em breve</span>
            {breve.map((i) => <span key={i.exige} className="menu-breve-item">{i.rotulo}</span>)}
          </div>
        )}

        <div className="usuario">
          <span className="usuario-email" title={sessao?.user.email}>{sessao?.user.email}</span>
          <span className="usuario-papel">{papel === 'super_admin' ? 'Harpia (super admin)' : papel}</span>
          <button className="btn-link" onClick={sair}>Sair</button>
        </div>
      </aside>
      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  );
}
