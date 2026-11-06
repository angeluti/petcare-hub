// CF-03 · Feriados e dias fechados · AG-07 · Bloqueios por profissional.
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePetshop } from '../../contexto/PetshopAtual';
import { useBloqueiosFuturos } from '../../lib/consultas';
import { supabase, dado } from '../../lib/supabase';
import { mensagemDeErro } from '../../lib/erros';
import { proximosFeriados } from '../../lib/feriados';
import { diaDe, ehMeiaNoite, hoje, instante, rotuloDia, rotuloPeriodo, somarDias } from '../../lib/tempo';
import { TIPO_BLOQUEIO_ROTULO, type Bloqueio } from '../../lib/tipos';
import { Carregando, Modal, Vazio, useAvisos } from '../../componentes/ui';
import { FormBloqueio, invalidarBloqueios } from '../../componentes/Bloqueios';

export function AbaBloqueios() {
  const { petshop } = usePetshop();
  const q = useBloqueiosFuturos(petshop.id);
  const qc = useQueryClient();
  const avisar = useAvisos();
  const [novo, setNovo] = useState(false);
  const [nacionais, setNacionais] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const lista = q.data ?? [];
  const doPetshop = lista.filter((b) => !b.recurso_id);
  const porProfissional = lista.filter((b) => b.recurso_id);

  async function remover(b: Bloqueio) {
    if (!window.confirm(`Remover ${TIPO_BLOQUEIO_ROTULO[b.tipo].toLowerCase()} de ${rotuloPeriodo(b.inicio, b.fim, petshop.fuso)}? Os horários voltam a ser oferecidos.`)) return;
    setRemovendo(b.id);
    try {
      dado(await supabase.from('bloqueios').delete().eq('id', b.id));
      await invalidarBloqueios(qc, petshop.id);
      avisar('Bloqueio removido.');
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro');
    } finally {
      setRemovendo(null);
    }
  }

  const linha = (b: Bloqueio) => (
    <div key={b.id} className="linha-item">
      <span className={`chip ${b.tipo === 'feriado' ? 'chip-bloqueio' : ''}`}>{TIPO_BLOQUEIO_ROTULO[b.tipo]}</span>
      <b>{rotuloPeriodo(b.inicio, b.fim, petshop.fuso)}</b>
      {b.recursos?.nome && <span>{b.recursos.nome}</span>}
      {b.motivo && <span className="mudo">{b.motivo}</span>}
      <button className="btn-link" disabled={removendo === b.id} onClick={() => remover(b)}>remover</button>
    </div>
  );

  return (
    <div className="aba-corpo">
      <p className="mudo">
        Bot e painel deixam de oferecer horários nos períodos bloqueados. Agendamentos que já existem não são cancelados:
        o painel avisa antes de salvar e marca cada um com ⚠ na agenda, para você remarcar ou cancelar e avisar o tutor.
      </p>
      <div className="acoes-linha inicio">
        <button className="btn primario" onClick={() => setNovo(true)}>+ Novo bloqueio</button>
        <button className="btn" onClick={() => setNacionais(true)}>Adicionar feriados nacionais</button>
      </div>

      {q.isLoading ? <Carregando /> : (
        <>
          <section className="grupo-bloqueios">
            <h3>Feriados e dias fechados</h3>
            {doPetshop.length ? doPetshop.map(linha) : <Vazio>Nenhum feriado cadastrado. Lembre dos feriados municipais.</Vazio>}
          </section>
          <section className="grupo-bloqueios">
            <h3>Folgas e bloqueios por profissional</h3>
            {porProfissional.length ? porProfissional.map(linha) : <Vazio>Nenhum bloqueio de profissional à frente.</Vazio>}
          </section>
        </>
      )}

      {novo && <FormBloqueio aoFechar={() => setNovo(false)} />}
      {nacionais && <FeriadosNacionais existentes={doPetshop} aoFechar={() => setNacionais(false)} />}
    </div>
  );
}

/** Lista os feriados nacionais dos próximos 12 meses para marcar e criar de uma vez. */
function FeriadosNacionais({ existentes, aoFechar }: { existentes: Bloqueio[]; aoFechar: () => void }) {
  const { petshop } = usePetshop();
  const fuso = petshop.fuso;
  const qc = useQueryClient();
  const avisar = useAvisos();

  // Dias que já têm bloqueio de dia inteiro do pet shop
  const jaFechados = useMemo(() => {
    const s = new Set<string>();
    for (const b of existentes) {
      if (!ehMeiaNoite(b.inicio, fuso) || !ehMeiaNoite(b.fim, fuso)) continue;
      for (let d = diaDe(b.inicio, fuso); d < diaDe(b.fim, fuso); d = somarDias(d, 1)) s.add(d);
    }
    return s;
  }, [existentes, fuso]);

  const feriados = proximosFeriados(hoje(fuso));
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(feriados.filter((f) => !f.facultativo && !jaFechados.has(f.dia)).map((f) => f.dia)),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    const escolhidos = feriados.filter((f) => marcados.has(f.dia) && !jaFechados.has(f.dia));
    if (!escolhidos.length) return aoFechar();
    setSalvando(true);
    try {
      dado(await supabase.from('bloqueios').insert(escolhidos.map((f) => ({
        petshop_id: petshop.id,
        recurso_id: null,
        tipo: 'feriado',
        inicio: instante(f.dia, '00:00', fuso),
        fim: instante(somarDias(f.dia, 1), '00:00', fuso),
        motivo: f.nome,
      }))));
      await invalidarBloqueios(qc, petshop.id);
      avisar(`${escolhidos.length} feriado(s) adicionado(s).`);
      aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Feriados nacionais"
      aberto
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Adicionar marcados'}</button>
        </>
      }
    >
      <p className="nota">Próximos 12 meses. Pontos facultativos vêm desmarcados. Feriados do estado e da cidade entram em "+ Novo bloqueio".</p>
      <div className="lista-feriados">
        {feriados.map((f) => {
          const existe = jaFechados.has(f.dia);
          return (
            <label key={f.dia} className={`check${existe ? ' mudo' : ''}`}>
              <input
                type="checkbox"
                disabled={existe}
                checked={existe || marcados.has(f.dia)}
                onChange={(e) => {
                  const n = new Set(marcados);
                  if (e.target.checked) n.add(f.dia); else n.delete(f.dia);
                  setMarcados(n);
                }}
              />
              <span className="feriado-data">{rotuloDia(f.dia, fuso, 'EEE, dd/MM/yyyy')}</span>
              {f.nome}{f.facultativo && <span className="tag">facultativo</span>}{existe && <span className="tag">já cadastrado</span>}
            </label>
          );
        })}
      </div>
      {erro && <p className="erro-texto">{erro}</p>}
    </Modal>
  );
}
