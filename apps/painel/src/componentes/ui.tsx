import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// ---------------------------------------------------------------- Modal
export function Modal(props: {
  titulo: string;
  aberto: boolean;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largo?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.aberto && !d.open) d.showModal();
    if (!props.aberto && d.open) d.close();
  }, [props.aberto]);
  return (
    <dialog
      ref={ref}
      className={props.largo ? 'modal largo' : 'modal'}
      onCancel={(e) => { e.preventDefault(); props.aoFechar(); }}
      onClick={(e) => { if (e.target === ref.current) props.aoFechar(); }}
    >
      {props.aberto && (
        <div className="modal-caixa">
          <header className="modal-topo">
            <h2>{props.titulo}</h2>
            <button className="btn-icone" aria-label="Fechar" onClick={props.aoFechar}>×</button>
          </header>
          <div className="modal-corpo">{props.children}</div>
          {props.rodape && <footer className="modal-rodape">{props.rodape}</footer>}
        </div>
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------- Avisos (toast)
type TipoAviso = 'ok' | 'erro' | 'info';
interface Aviso { id: number; texto: string; tipo: TipoAviso }
const AvisoCtx = createContext<(texto: string, tipo?: TipoAviso) => void>(() => {});

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((texto: string, tipo: TipoAviso = 'ok') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'erro' ? 7000 : 3500);
  }, []);
  return (
    <AvisoCtx.Provider value={avisar}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso aviso-${a.tipo}`}>{a.texto}</div>
        ))}
      </div>
    </AvisoCtx.Provider>
  );
}

export function useAvisos() {
  return useContext(AvisoCtx);
}

// ---------------------------------------------------------------- Pequenos
export function Campo(props: { rotulo: string; dica?: string; children: ReactNode; largo?: boolean }) {
  return (
    <label className={props.largo ? 'campo largo' : 'campo'}>
      <span className="campo-rotulo">{props.rotulo}</span>
      {props.children}
      {props.dica && <span className="campo-dica">{props.dica}</span>}
    </label>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="vazio">{children}</div>;
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="carregando">{texto}</div>;
}
