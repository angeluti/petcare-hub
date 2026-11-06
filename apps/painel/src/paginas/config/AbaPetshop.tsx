// CF-01 · Dados do pet shop: nome, endereço, telefone e logo (dono e gerente).
// Plano, status, slug e número do WhatsApp são só leitura: o trigger
// private.proteger_petshop recusa a alteração (42501) para quem não é da Harpia.
// Esses dados alimentam a saudação e as respostas do bot (bot_petshop_info).
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import { supabase, dado } from '../../lib/supabase';
import { mensagemDeErro } from '../../lib/erros';
import { normalizarTelefone, telefone } from '../../lib/formato';
import { Campo, useAvisos } from '../../componentes/ui';

const BUCKET = 'logos';
const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 1024 * 1024;
const PLANO_ROTULO: Record<string, string> = { starter: 'Essencial', pro: 'Profissional', daycare: 'Day Care', clinic: 'Clinic' };

/** Caminho do arquivo dentro do bucket, a partir da URL pública (para apagar a logo antiga). */
function caminhoNoBucket(url: string | null): string | null {
  if (!url) return null;
  const marca = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marca);
  return i >= 0 ? decodeURIComponent(url.slice(i + marca.length).split('?')[0]) : null;
}

export function AbaPetshop() {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({
    nome: petshop.nome,
    endereco: petshop.endereco ?? '',
    telefone: petshop.telefone_contato ? telefone(petshop.telefone_contato) : '',
  });
  const [logo, setLogo] = useState<string | null>(petshop.logo_url);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  type CamposEditaveis = { nome?: string; endereco?: string | null; telefone_contato?: string | null; logo_url?: string | null };

  async function atualizar(campos: CamposEditaveis) {
    dado(await supabase.from('petshops').update(campos).eq('id', petshop.id));
    await qc.invalidateQueries({ queryKey: ['vinculos'] });
  }

  async function salvar() {
    setErro(null);
    if (!f.nome.trim()) return setErro('Informe o nome do pet shop.');
    let tel: string | null = null;
    if (f.telefone.trim()) {
      tel = normalizarTelefone(f.telefone);
      if (!tel || !/^\+[1-9]\d{7,14}$/.test(tel)) return setErro('Telefone inválido. Use DDD + número, ex.: (19) 3888-1234.');
    }
    setSalvando(true);
    try {
      await atualizar({ nome: f.nome.trim(), endereco: f.endereco.trim() || null, telefone_contato: tel });
      avisar('Dados do pet shop salvos.');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function enviarLogo(arquivo: File) {
    setErro(null);
    if (!TIPOS_LOGO.includes(arquivo.type)) return setErro('Use PNG, JPG ou WebP.');
    if (arquivo.size > MAX_BYTES) return setErro('A logo pode ter até 1 MB.');
    setEnviando(true);
    try {
      const ext = arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg';
      const caminho = `${petshop.id}/logo-${Date.now()}.${ext}`;
      const up = await supabase.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
      if (up.error) throw up.error;
      const url = supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
      const antiga = caminhoNoBucket(logo);
      await atualizar({ logo_url: url });
      if (antiga) await supabase.storage.from(BUCKET).remove([antiga]); // falha aqui não importa
      setLogo(url);
      avisar('Logo atualizada.');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
      if (arquivoRef.current) arquivoRef.current.value = '';
    }
  }

  async function removerLogo() {
    setErro(null);
    setEnviando(true);
    try {
      const antiga = caminhoNoBucket(logo);
      await atualizar({ logo_url: null });
      if (antiga) await supabase.storage.from(BUCKET).remove([antiga]);
      setLogo(null);
      avisar('Logo removida.');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  const telPrevia = f.telefone.trim() ? normalizarTelefone(f.telefone) : null;

  return (
    <div className="aba-corpo">
      <p className="mudo">Esses dados aparecem para o tutor nas respostas do bot (endereço e telefone) e identificam o pet shop no painel.</p>

      <div className="logo-petshop">
        <div className="logo-petshop-previa">
          {logo ? <img src={logo} alt={`Logo de ${petshop.nome}`} /> : <span className="mudo">Sem logo</span>}
        </div>
        <div className="logo-petshop-acoes">
          <input
            ref={arquivoRef}
            id="logo-arquivo"
            type="file"
            accept={TIPOS_LOGO.join(',')}
            hidden
            onChange={(e) => { const a = e.target.files?.[0]; if (a) enviarLogo(a); }}
          />
          <button className="btn" disabled={enviando} onClick={() => arquivoRef.current?.click()}>
            {enviando ? 'Enviando…' : logo ? 'Trocar logo' : 'Enviar logo'}
          </button>
          {logo && <button className="btn-link" disabled={enviando} onClick={removerLogo}>remover</button>}
          <span className="campo-dica">PNG, JPG ou WebP, até 1 MB. De preferência quadrada, com fundo.</span>
        </div>
      </div>

      <div className="linha-campos">
        <Campo rotulo="Nome do pet shop"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="Telefone de contato" dica={telPrevia ? telefone(telPrevia) : 'Fixo ou celular, com DDD'}>
          <input inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} placeholder="(19) 3888-1234" />
        </Campo>
      </div>
      <Campo rotulo="Endereço" largo dica="Como o tutor deve ler: rua, número, bairro e cidade">
        <input value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} placeholder="Rua das Flores, 120 - Centro, Valinhos/SP" />
      </Campo>

      {erro && <p className="erro-texto">{erro}</p>}
      <div className="acoes-linha">
        <button className="btn primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar dados'}</button>
      </div>

      <section className="somente-leitura">
        <h3>Definidos pela equipe PetCare Hub</h3>
        <dl className="ficha">
          <dt>Plano</dt><dd>{PLANO_ROTULO[petshop.plano_codigo] ?? petshop.plano_codigo}</dd>
          <dt>WhatsApp do bot</dt><dd>{petshop.telefone_wp ? telefone(petshop.telefone_wp) : <span className="mudo">não conectado</span>}</dd>
          <dt>Endereço da página</dt><dd>{petshop.slug ?? <span className="mudo">não definido</span>}</dd>
          <dt>Situação</dt><dd>{petshop.ativo ? 'Ativo' : 'Suspenso'}</dd>
        </dl>
        <p className="nota">Para mudar algum desses itens, escreva para suporte@petcarehub.com.br.</p>
      </section>
    </div>
  );
}
