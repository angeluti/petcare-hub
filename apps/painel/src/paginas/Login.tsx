import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { mensagemDeErro } from '../lib/erros';
import { useNavigate } from 'react-router';
import { useSessao } from '../contexto/Sessao';
import { Logo } from '../componentes/Logo';

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
    if (error) setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : mensagemDeErro(error));
  }

  async function esqueci() {
    setErro(null); setInfo(null);
    if (!email.trim()) { setErro('Digite seu e-mail para receber o link.'); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    if (error) setErro(mensagemDeErro(error));
    else setInfo('Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.');
  }

  return (
    <div className="tela-centro login-fundo">
      <form className="cartao estreito login" onSubmit={entrar}>
        <div className="marca-login">
          <Logo tipo="horizontal" altura={56} />
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

/**
 * /auth/confirmar?token_hash=…&type=invite|recovery
 * Link dos templates do Supabase (supabase/templates). O token só é trocado
 * por sessão aqui, quando a pessoa abre a página: um leitor de link de e-mail
 * corporativo (Safe Links) que só visita a URL não consome o convite.
 */
export function ConfirmarLink() {
  const { iniciarDefinicaoSenha } = useSessao();
  const navigate = useNavigate();
  const [erro, setErro] = useState<string | null>(null);
  const feito = useRef(false); // StrictMode roda o efeito duas vezes; o token só vale uma

  useEffect(() => {
    if (feito.current) return;
    feito.current = true;
    const q = new URLSearchParams(window.location.search);
    const token_hash = q.get('token_hash');
    const tipo = q.get('type') as EmailOtpType | null;
    if (!token_hash || (tipo !== 'invite' && tipo !== 'recovery')) {
      setErro('Link incompleto. Abra o link direto do e-mail.');
      return;
    }
    supabase.auth.verifyOtp({ token_hash, type: tipo }).then(({ error }) => {
      if (error) { setErro(mensagemDeErro(error)); return; }
      iniciarDefinicaoSenha(tipo === 'invite' ? 'convite' : 'recuperacao');
      navigate('/redefinir-senha', { replace: true });
    });
  }, [iniciarDefinicaoSenha, navigate]);

  return (
    <div className="tela-centro login-fundo">
      <div className="cartao estreito login">
        <div className="marca-login"><Logo tipo="horizontal" altura={48} /></div>
        {erro ? (
          <>
            <h2>Não foi possível abrir o link</h2>
            <p className="erro-texto">{erro}</p>
            <p className="mudo">
              Se você já criou sua senha, é só entrar. Senão, use "Esqueci minha senha" na tela de entrada
              ou peça um novo convite para suporte@petcarehub.com.br.
            </p>
            <button className="btn primario cheio" onClick={() => window.location.replace('/')}>Ir para a entrada</button>
          </>
        ) : (
          <div className="carregando">Validando o link…</div>
        )}
      </div>
    </div>
  );
}

export function RedefinirSenha() {
  const { concluirRecuperacao, definindoSenha, sessao } = useSessao();
  const navigate = useNavigate();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const convite = definindoSenha === 'convite';

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) { setErro('Use pelo menos 8 caracteres.'); return; }
    if (senha !== confirmacao) { setErro('As duas senhas não são iguais.'); return; }
    setSalvando(true);
    // Também limpa o metadado do convite: a partir daqui o login é por senha.
    const { error } = await supabase.auth.updateUser({ password: senha, data: { precisa_definir_senha: false } });
    setSalvando(false);
    if (error) { setErro(mensagemDeErro(error)); return; }
    concluirRecuperacao();
    navigate('/agenda', { replace: true });
  }

  return (
    <div className="tela-centro login-fundo">
      <form className="cartao estreito login" onSubmit={salvar}>
        <div className="marca-login"><Logo tipo="horizontal" altura={48} /></div>
        <h2>{convite ? 'Crie sua senha de acesso' : 'Criar nova senha'}</h2>
        {convite && <p className="mudo">Boas-vindas ao PetCare Hub. Defina a senha que você vai usar para entrar com {sessao?.user.email}.</p>}
        <label className="campo">
          <span className="campo-rotulo">{convite ? 'Senha' : 'Nova senha'}</span>
          <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Repita a senha</span>
          <input type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
        </label>
        {erro && <p className="erro-texto">{erro}</p>}
        <button className="btn primario cheio" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar e entrar'}</button>
      </form>
    </div>
  );
}
