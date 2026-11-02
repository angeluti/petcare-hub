import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router';
import { useSessao } from '../contexto/Sessao';

export function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null); setInfo(null); setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
  }

  async function esqueci() {
    setErro(null); setInfo(null);
    if (!email.trim()) { setErro('Digite seu e-mail para receber o link.'); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    if (error) setErro(error.message);
    else setInfo('Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.');
  }

  return (
    <div className="tela-centro login-fundo">
      <form className="cartao estreito login" onSubmit={entrar}>
        <div className="marca grande">
          <span className="marca-nome">PetCare Hub</span>
          <span className="marca-sub">Painel do pet shop</span>
        </div>
        <label className="campo">
          <span className="campo-rotulo">E-mail</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Senha</span>
          <input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>
        {erro && <p className="erro-texto">{erro}</p>}
        {info && <p className="ok-texto">{info}</p>}
        <button className="btn primario cheio" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="btn-link" onClick={esqueci}>Esqueci minha senha</button>
      </form>
    </div>
  );
}

export function RedefinirSenha() {
  const { concluirRecuperacao } = useSessao();
  const navigate = useNavigate();
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) { setErro('Use pelo menos 8 caracteres.'); return; }
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    // Sai do modo de recuperação pelo roteador: o App re-renderiza e mostra o painel.
    concluirRecuperacao();
    navigate('/agenda', { replace: true });
  }

  return (
    <div className="tela-centro login-fundo">
      <form className="cartao estreito login" onSubmit={salvar}>
        <h2>Criar nova senha</h2>
        <label className="campo">
          <span className="campo-rotulo">Nova senha</span>
          <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />
        </label>
        {erro && <p className="erro-texto">{erro}</p>}
        <button className="btn primario cheio" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar e entrar'}</button>
      </form>
    </div>
  );
}
