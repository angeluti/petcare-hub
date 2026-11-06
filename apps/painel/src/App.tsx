import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useSessao } from './contexto/Sessao';
import { PetshopProvider, usePetshop } from './contexto/PetshopAtual';
import { Layout, itensVisiveis } from './componentes/Layout';
import { ConfirmarLink, Login, RedefinirSenha } from './paginas/Login';
import { Agenda } from './paginas/Agenda';
import { Clientes } from './paginas/Clientes';
import { Configuracao } from './paginas/Configuracao';

export function App() {
  const { sessao, carregando, definindoSenha } = useSessao();

  const { pathname } = useLocation();

  if (carregando) return <div className="tela-centro"><div className="carregando">Carregando…</div></div>;
  // Link do e-mail (convite ou recuperação): troca o token_hash por sessão. Vem antes do login.
  if (pathname === '/auth/confirmar') return <ConfirmarLink />;
  // Sem sessão é sempre login, mesmo em /redefinir-senha (link vencido ou depois de sair).
  if (!sessao) return <Login />;
  // Definir senha exige só sessão: fica FORA do PetshopProvider (checagem de vínculo).
  if (definindoSenha || pathname === '/redefinir-senha') return <RedefinirSenha />;

  return (
    <PetshopProvider>
      <Rotas />
    </PetshopProvider>
  );
}

function Rotas() {
  const { tem, podeConfigurar } = usePetshop();
  const inicial = itensVisiveis(tem, podeConfigurar)[0]?.to;
  if (!inicial) {
    return (
      <div className="tela-centro">
        <div className="cartao estreito">
          <h2>Nada liberado para o seu perfil</h2>
          <p className="mudo">O plano deste pet shop ou o seu papel não inclui telas do painel. Fale com a equipe PetCare Hub.</p>
        </div>
      </div>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        {tem('spa.agenda') && <Route path="/agenda" element={<Agenda />} />}
        {tem('spa.agenda') && <Route path="/clientes" element={<Clientes />} />}
        {podeConfigurar && <Route path="/configuracao" element={<Configuracao />} />}
        <Route path="*" element={<Navigate to={inicial} replace />} />
      </Route>
    </Routes>
  );
}
