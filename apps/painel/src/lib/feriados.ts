// Feriados nacionais do Brasil (Lei 662/1949, Lei 6.802/1980, Lei 14.759/2023)
// e pontos facultativos usuais. Feriados estaduais e municipais entram à mão.
import { somarDias, type Dia } from './tempo';

export interface FeriadoNacional { dia: Dia; nome: string; facultativo: boolean }

/** Domingo de Páscoa (algoritmo anônimo gregoriano). */
function pascoa(ano: number): Dia {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function feriadosDoAno(ano: number): FeriadoNacional[] {
  const p = pascoa(ano);
  const fixo = (mmdd: string, nome: string): FeriadoNacional => ({ dia: `${ano}-${mmdd}`, nome, facultativo: false });
  return [
    fixo('01-01', 'Confraternização Universal'),
    { dia: somarDias(p, -48), nome: 'Carnaval (segunda)', facultativo: true },
    { dia: somarDias(p, -47), nome: 'Carnaval (terça)', facultativo: true },
    { dia: somarDias(p, -2), nome: 'Sexta-feira Santa', facultativo: false },
    fixo('04-21', 'Tiradentes'),
    fixo('05-01', 'Dia do Trabalho'),
    { dia: somarDias(p, 60), nome: 'Corpus Christi', facultativo: true },
    fixo('09-07', 'Independência'),
    fixo('10-12', 'Nossa Senhora Aparecida'),
    fixo('11-02', 'Finados'),
    fixo('11-15', 'Proclamação da República'),
    fixo('11-20', 'Consciência Negra'),
    fixo('12-25', 'Natal'),
  ].sort((x, y) => x.dia.localeCompare(y.dia));
}

/** Feriados de hoje até 12 meses à frente. */
export function proximosFeriados(hoje: Dia): FeriadoNacional[] {
  const ano = Number(hoje.slice(0, 4));
  const limite = somarDias(hoje, 365);
  return [...feriadosDoAno(ano), ...feriadosDoAno(ano + 1)].filter((f) => f.dia >= hoje && f.dia <= limite);
}
