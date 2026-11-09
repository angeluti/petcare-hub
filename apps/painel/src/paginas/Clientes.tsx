// Tutores e pets do pet shop. Cadastro SÓ por RPC; edição direta nas
// tabelas de vínculo (tutor_petshop, pet_petshop) e nos dados básicos do pet.
// Nome, e-mail e observações do tutor são deste pet shop: nunca aparecem para outro.
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../contexto/PetshopAtual';
import { usePets, useTutores } from '../lib/consultas';
import { supabase, dado } from '../lib/supabase';
import { mensagemDeErro } from '../lib/erros';
import { ESPECIES, PORTES, linkWhatsApp, normalizar, telefone } from '../lib/formato';
import type { PetVinculo, TutorVinculo } from '../lib/tipos';
import { Campo, Carregando, Modal, Vazio, useAvisos } from '../componentes/ui';
import { FormPet, FormTutor } from '../componentes/Cadastro';
import { WhatsappTutor } from '../componentes/WhatsappTutor';

export function Clientes() {
  const { petshop } = usePetshop();
  const tutoresQ = useTutores(petshop.id);
  const petsQ = usePets(petshop.id);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);

  const tutores = tutoresQ.data ?? [];
  const pets = petsQ.data ?? [];
  const petsPorTutor = useMemo(() => {
    const m = new Map<string, PetVinculo[]>();
    for (const p of pets) {
      const t = p.pets?.tutor_id;
      if (!t) continue;
      m.set(t, [...(m.get(t) ?? []), p]);
    }
    return m;
  }, [pets]);

  const filtrados = useMemo(() => {
    const q = normalizar(busca.trim());
    const dig = busca.replace(/\D/g, '');
    if (!q) return tutores;
    return tutores.filter((t) =>
      normalizar(t.nome).includes(q)
      || (dig.length >= 3 && (t.tutores?.telefone ?? '').includes(dig))
      || (petsPorTutor.get(t.tutor_id) ?? []).some((p) => normalizar(p.pets?.nome ?? '').includes(q)));
  }, [busca, tutores, petsPorTutor]);

  const tutorAberto = tutores.find((t) => t.tutor_id === aberto) ?? null;

  return (
    <div className="pagina">
      <header className="pagina-topo">
        <div>
          <h1>Tutores e pets</h1>
          <p className="mudo">{tutores.length} tutores · {pets.length} pets</p>
        </div>
        <button className="btn primario" onClick={() => setNovo(true)}>+ Novo tutor</button>
      </header>

      <input className="busca larga" placeholder="Buscar por tutor, telefone ou pet…" value={busca} onChange={(e) => setBusca(e.target.value)} />

      {tutoresQ.isLoading || petsQ.isLoading ? <Carregando /> : filtrados.length === 0 ? (
        <Vazio>{busca ? 'Nada encontrado.' : 'Nenhum tutor cadastrado ainda.'}</Vazio>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>Tutor</th><th>WhatsApp</th><th>Pets</th><th>Origem</th></tr>
            </thead>
            <tbody>
              {filtrados.map((t) => (
                <tr key={t.id} onClick={() => setAberto(t.tutor_id)} className="clicavel">
                  <td><b>{t.nome}</b>{!t.aceita_mensagens && <span className="tag">sem msgs</span>}</td>
                  <td>{telefone(t.tutores?.telefone)}</td>
                  <td>
                    {(petsPorTutor.get(t.tutor_id) ?? []).map((p) => (
                      <span key={p.id} className="pet-tag">{p.pets?.nome} <span className="porte">{p.pets?.porte}</span></span>
                    ))}
                  </td>
                  <td className="mudo">{t.origem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {novo && (
        <Modal titulo="Novo tutor" aberto aoFechar={() => setNovo(false)}>
          <FormTutor
            petshopId={petshop.id}
            tutores={tutores}
            aoSalvar={(id) => { setNovo(false); setAberto(id); }}
            aoCancelar={() => setNovo(false)}
          />
        </Modal>
      )}
      {tutorAberto && (
        <FichaTutor tutor={tutorAberto} pets={petsPorTutor.get(tutorAberto.tutor_id) ?? []} aoFechar={() => setAberto(null)} />
      )}
    </div>
  );
}

function FichaTutor({ tutor, pets, aoFechar }: { tutor: TutorVinculo; pets: PetVinculo[]; aoFechar: () => void }) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [f, setF] = useState({
    nome: tutor.nome, email: tutor.email ?? '', endereco: tutor.endereco ?? '',
    observacoes: tutor.observacoes ?? '',
  });
  const [petEditando, setPetEditando] = useState<string | null>(null);
  const [novoPet, setNovoPet] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    if (!f.nome.trim()) return setErro('O nome é obrigatório.');
    setSalvando(true);
    try {
      dado(await supabase.from('tutor_petshop').update({
        nome: f.nome.trim(),
        email: f.email.trim() || null,
        endereco: f.endereco.trim() || null,
        observacoes: f.observacoes.trim() || null,
      }).eq('id', tutor.id));
      await qc.invalidateQueries({ queryKey: [petshop.id, 'tutores'] });
      avisar('Tutor atualizado.');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  const tel = tutor.tutores?.telefone;
  return (
    <Modal titulo={tutor.nome} aberto largo aoFechar={aoFechar}>
      <div className="ficha-tutor">
        <section>
          <h3>Dados do tutor <span className="mudo">· visíveis só para {petshop.nome}</span></h3>
          <div className="linha-campos">
            <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
            <Campo rotulo="WhatsApp" dica="O telefone identifica o tutor no Hub e não é editável.">
              <div className="valor-fixo">{telefone(tel)} {tel && <a href={linkWhatsApp(tel)} target="_blank" rel="noreferrer">abrir</a>}</div>
            </Campo>
          </div>
          <div className="linha-campos">
            <Campo rotulo="E-mail"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
            <Campo rotulo="Endereço" largo><input value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} /></Campo>
          </div>
          <Campo rotulo="Observações (internas)" largo>
            <textarea rows={2} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
          </Campo>
          {erro && <p className="erro-texto">{erro}</p>}
          <div className="acoes-linha">
            <button className="btn primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar tutor'}</button>
          </div>
        </section>

        <WhatsappTutor tutor={tutor} />

        <section>
          <h3>Pets</h3>
          {pets.length === 0 && !novoPet && <p className="mudo">Nenhum pet cadastrado.</p>}
          {pets.map((p) => (
            petEditando === p.pet_id
              ? <EditarPet key={p.id} pet={p} aoFechar={() => setPetEditando(null)} />
              : (
                <div key={p.id} className="pet-linha">
                  <div>
                    <b>{p.pets?.nome}</b> <span className="porte">{p.pets?.porte ?? '?'}</span>{' '}
                    <span className="mudo">{ESPECIES[p.pets?.especie ?? 'cao']}{p.pets?.raca ? ` · ${p.pets.raca}` : ''}</span>
                    {p.temperamento && <div className="alerta pequeno">⚠ {p.temperamento}</div>}
                  </div>
                  <button className="btn-link" onClick={() => setPetEditando(p.pet_id)}>editar</button>
                </div>
              )
          ))}
          {novoPet ? (
            <FormPet petshopId={petshop.id} tutorId={tutor.tutor_id} aoSalvar={() => setNovoPet(false)} aoCancelar={() => setNovoPet(false)} />
          ) : (
            <button className="btn" onClick={() => setNovoPet(true)}>+ Novo pet</button>
          )}
        </section>
      </div>
    </Modal>
  );
}

function EditarPet({ pet, aoFechar }: { pet: PetVinculo; aoFechar: () => void }) {
  const { petshop } = usePetshop();
  const qc = useQueryClient();
  const avisar = useAvisos();
  const p = pet.pets!;
  const [f, setF] = useState({
    nome: p.nome, porte: p.porte ?? '', especie: p.especie, raca: p.raca ?? '', nascimento: p.nascimento ?? '',
    alergias: p.alergias ?? '',
    temperamento: pet.temperamento ?? '', preferencias: pet.preferencias ?? '', observacoes: pet.observacoes ?? '',
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    if (!f.nome.trim() || !f.porte) return setErro('Nome e porte são obrigatórios.');
    setSalvando(true);
    try {
      // Dados básicos do pet (globais: valem em todo o Hub)
      dado(await supabase.from('pets').update({
        nome: f.nome.trim(), porte: f.porte, especie: f.especie,
        raca: f.raca.trim() || null, nascimento: f.nascimento || null, alergias: f.alergias.trim() || null,
      }).eq('id', p.id));
      // Dados operacionais deste pet shop (privados)
      dado(await supabase.from('pet_petshop').update({
        temperamento: f.temperamento.trim() || null,
        preferencias: f.preferencias.trim() || null,
        observacoes: f.observacoes.trim() || null,
      }).eq('id', pet.id));
      await qc.invalidateQueries({ queryKey: [petshop.id, 'pets'] });
      avisar('Pet atualizado.');
      aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="subform">
      <div className="linha-campos">
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="Porte">
          <div className="segmentado pequeno">
            {PORTES.map((x) => (
              <button type="button" key={x} className={f.porte === x ? 'ativo' : ''} onClick={() => setF({ ...f, porte: x })}>{x}</button>
            ))}
          </div>
        </Campo>
        <Campo rotulo="Espécie">
          <select value={f.especie} onChange={(e) => setF({ ...f, especie: e.target.value })}>
            {Object.entries(ESPECIES).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Raça"><input value={f.raca} onChange={(e) => setF({ ...f, raca: e.target.value })} /></Campo>
        <Campo rotulo="Nascimento"><input type="date" value={f.nascimento} onChange={(e) => setF({ ...f, nascimento: e.target.value })} /></Campo>
        <Campo rotulo="Alergias"><input value={f.alergias} onChange={(e) => setF({ ...f, alergias: e.target.value })} /></Campo>
      </div>
      <p className="nota">Nome, porte, raça e alergias são dados do pet no Hub. Os campos abaixo ficam só com {petshop.nome}.</p>
      <div className="linha-campos">
        <Campo rotulo="Temperamento" dica="Aparece em destaque na agenda">
          <input value={f.temperamento} onChange={(e) => setF({ ...f, temperamento: e.target.value })} placeholder="Ex.: morde na tosa" />
        </Campo>
        <Campo rotulo="Preferências"><input value={f.preferencias} onChange={(e) => setF({ ...f, preferencias: e.target.value })} placeholder="Ex.: sem laço" /></Campo>
      </div>
      <Campo rotulo="Observações" largo><input value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></Campo>
      {erro && <p className="erro-texto">{erro}</p>}
      <div className="acoes-linha">
        <button className="btn" onClick={aoFechar}>Cancelar</button>
        <button className="btn primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar pet'}</button>
      </div>
    </div>
  );
}
