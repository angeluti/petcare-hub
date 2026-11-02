// Formulários de cadastro de tutor e pet, usados na agenda e em Tutores e pets.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cadastrarPet, cadastrarTutor } from '../lib/acoes';
import { mensagemDeErro } from '../lib/erros';
import { ESPECIES, PORTES, normalizarTelefone, telefone as fmtTel } from '../lib/formato';
import type { TutorVinculo } from '../lib/tipos';
import { Campo, useAvisos } from './ui';

export function FormTutor(props: {
  petshopId: string;
  tutores: TutorVinculo[];
  aoSalvar: (tutorId: string) => void;
  aoCancelar?: () => void;
}) {
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    const e164 = normalizarTelefone(tel);
    if (!nome.trim()) return setErro('Informe o nome.');
    if (!e164 || !/^\+[1-9]\d{7,14}$/.test(e164)) return setErro('Telefone inválido. Use DDD + número, ex.: (19) 99123-4567.');

    // Já é cliente deste pet shop? Usa o cadastro existente (a RPC não renomeia).
    const existente = props.tutores.find((t) => t.tutores?.telefone === e164);
    if (existente) {
      avisar(`Este telefone já está cadastrado como ${existente.nome}.`, 'info');
      return props.aoSalvar(existente.tutor_id);
    }
    setSalvando(true);
    try {
      const id = await cadastrarTutor(props.petshopId, e164, nome);
      await qc.invalidateQueries({ queryKey: [props.petshopId, 'tutores'] });
      avisar(`Tutor ${nome.trim()} cadastrado.`);
      props.aoSalvar(id);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="subform">
      <div className="linha-campos">
        <Campo rotulo="Nome do tutor">
          <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        </Campo>
        <Campo rotulo="WhatsApp" dica={tel && normalizarTelefone(tel) ? fmtTel(normalizarTelefone(tel)) : 'DDD + número'}>
          <input inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="(19) 99123-4567" />
        </Campo>
      </div>
      {erro && <p className="erro-texto">{erro}</p>}
      <div className="acoes-linha">
        {props.aoCancelar && <button type="button" className="btn" onClick={props.aoCancelar}>Cancelar</button>}
        <button type="button" className="btn primario" disabled={salvando} onClick={salvar}>
          {salvando ? 'Salvando…' : 'Cadastrar tutor'}
        </button>
      </div>
    </div>
  );
}

export function FormPet(props: {
  petshopId: string;
  tutorId: string;
  aoSalvar: (petId: string) => void;
  aoCancelar?: () => void;
}) {
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [nome, setNome] = useState('');
  const [porte, setPorte] = useState('');
  const [especie, setEspecie] = useState('cao');
  const [raca, setRaca] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro('Informe o nome do pet.');
    if (!porte) return setErro('Escolha o porte: ele define preço e duração.');
    setSalvando(true);
    try {
      const id = await cadastrarPet(props.petshopId, props.tutorId, { nome, porte, especie, raca, nascimento });
      await qc.invalidateQueries({ queryKey: [props.petshopId, 'pets'] });
      avisar(`${nome.trim()} cadastrado.`);
      props.aoSalvar(id);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="subform">
      <div className="linha-campos">
        <Campo rotulo="Nome do pet">
          <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        </Campo>
        <Campo rotulo="Porte">
          <div className="segmentado pequeno">
            {PORTES.map((p) => (
              <button type="button" key={p} className={porte === p ? 'ativo' : ''} onClick={() => setPorte(p)}>{p}</button>
            ))}
          </div>
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Espécie">
          <select value={especie} onChange={(e) => setEspecie(e.target.value)}>
            {Object.entries(ESPECIES).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Raça (opcional)">
          <input value={raca} onChange={(e) => setRaca(e.target.value)} />
        </Campo>
        <Campo rotulo="Nascimento (opcional)">
          <input type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
        </Campo>
      </div>
      {erro && <p className="erro-texto">{erro}</p>}
      <div className="acoes-linha">
        {props.aoCancelar && <button type="button" className="btn" onClick={props.aoCancelar}>Cancelar</button>}
        <button type="button" className="btn primario" disabled={salvando} onClick={salvar}>
          {salvando ? 'Salvando…' : 'Cadastrar pet'}
        </button>
      </div>
    </div>
  );
}
