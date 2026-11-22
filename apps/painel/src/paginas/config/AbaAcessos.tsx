// AC-02 · Convite de acesso (só super admin Harpia no MVP).
// O convite sai da Edge Function `convidar-membro`, que usa a Secret key no
// servidor: cria o usuário (inviteUserByEmail) e o vínculo em petshop_membros.
// O navegador nunca vê a Secret key.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { usePetshop } from '../../contexto/PetshopAtual';
import { useMembros } from '../../lib/consultas';
import { supabase, dado } from '../../lib/supabase';
import { mensagemDeErro } from '../../lib/erros';
import type { Papel } from '../../lib/tipos';
import { Campo, Carregando, Vazio, useAvisos } from '../../componentes/ui';

const PAPEIS: [Papel, string][] = [
  ['dono', 'Dono'],
  ['gerente', 'Gerente'],
  ['recepcao', 'Recepção'],
  ['profissional', 'Profissional'],
  ['estoquista', 'Estoquista'],
];

interface RespostaConvite { status: 'convidado' | 'vinculado'; user_id: string; mensagem: string }

async function mensagemDaFuncao(e: unknown): Promise<string> {
  if (e instanceof FunctionsHttpError) {
    try {
      const corpo = await e.context.json();
      if (corpo?.erro) return String(corpo.erro);
    } catch { /* corpo não é JSON */ }
  }
  return mensagemDeErro(e);
}

export function AbaAcessos() {
  const { petshop, papel } = usePetshop();
  const ehHarpia = papel === 'super_admin';
  const q = useMembros(petshop.id, ehHarpia);
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [papelNovo, setPapelNovo] = useState<Papel>('dono');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function convidar() {
    setErro(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErro('E-mail inválido.');
    setEnviando(true);
    try {
      const { data: bruto, error } = await supabase.functions.invoke('convidar-membro', {
        body: { email: email.trim(), nome: nome.trim() || null, papel: papelNovo, petshop_id: petshop.id },
      });
      if (error) throw error;
      const data = bruto as RespostaConvite | null;
      await qc.invalidateQueries({ queryKey: [petshop.id, 'membros'] });
      avisar(data?.mensagem ?? 'Convite enviado.', data?.status === 'vinculado' ? 'info' : 'ok');
      setEmail(''); setNome('');
    } catch (e) {
      setErro(await mensagemDaFuncao(e));
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivo(id: string, ativo: boolean) {
    try {
      dado(await supabase.from('petshop_membros').update({ ativo }).eq('id', id));
      await qc.invalidateQueries({ queryKey: [petshop.id, 'membros'] });
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro');
    }
  }

  if (!ehHarpia) return <p className="mudo">Os acessos deste pet shop são criados pela equipe PetCare Hub.</p>;

  return (
    <div className="aba-corpo">
      <p className="mudo">
        A pessoa recebe um e-mail de noreply@petcarehub.com.br, cria a senha pelo link e entra vendo só {petshop.nome}.
        Se o e-mail já tiver login no Hub (rede ou franquia), só o vínculo é criado.
      </p>
      <div className="cartao">
        <div className="linha-campos">
          <Campo rotulo="E-mail"><input id="convite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dono@petshop.com.br" /></Campo>
          <Campo rotulo="Nome (opcional)"><input id="convite-nome" value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
          <Campo rotulo="Papel">
            <select id="convite-papel" value={papelNovo} onChange={(e) => setPapelNovo(e.target.value as Papel)}>
              {PAPEIS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </Campo>
        </div>
        {erro && <p className="erro-texto">{erro}</p>}
        <div className="acoes-linha">
          <button className="btn primario" disabled={enviando} onClick={convidar}>{enviando ? 'Enviando…' : 'Enviar convite'}</button>
        </div>
      </div>

      <h3>Quem acessa {petshop.nome}</h3>
      {q.isLoading ? <Carregando /> : (q.data ?? []).length === 0 ? <Vazio>Ninguém vinculado ainda.</Vazio> : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Nome</th><th>Papel</th><th>Desde</th><th>Acesso</th></tr></thead>
            <tbody>
              {(q.data ?? []).map((m) => (
                <tr key={m.id} className={m.ativo ? '' : 'inativo'}>
                  <td>{m.nome ?? <span className="mudo">sem nome</span>}</td>
                  <td>{PAPEIS.find(([v]) => v === m.papel)?.[1] ?? m.papel}</td>
                  <td>{new Date(m.criado_em).toLocaleDateString('pt-BR')}</td>
                  <td>
                    <label className="check">
                      <input type="checkbox" checked={m.ativo} onChange={(e) => alternarAtivo(m.id, e.target.checked)} />
                      {m.ativo ? 'ativo' : 'suspenso'}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
