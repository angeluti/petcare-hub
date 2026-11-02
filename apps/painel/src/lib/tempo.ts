// Datas e horas SEMPRE no fuso do pet shop (petshops.fuso), não no do navegador.
// "Dia" no painel é uma string ISO 'yyyy-MM-dd' para evitar confusão de fuso.
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';

export type Dia = string; // 'yyyy-MM-dd'

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function hoje(fuso: string): Dia {
  return formatInTimeZone(new Date(), fuso, 'yyyy-MM-dd');
}

export function somarDias(dia: Dia, n: number): Dia {
  const [a, m, d] = dia.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado (igual a horarios_funcionamento.dia_semana). */
export function diaDaSemana(dia: Dia): number {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Segunda-feira da semana do dia. */
export function inicioDaSemana(dia: Dia): Dia {
  const dow = diaDaSemana(dia);
  return somarDias(dia, dow === 0 ? -6 : 1 - dow);
}

/** Instante UTC (ISO) de "dia hh:mm" no fuso do pet shop. */
export function instante(dia: Dia, hora: string, fuso: string): string {
  return fromZonedTime(`${dia}T${hora.length === 5 ? hora + ':00' : hora}`, fuso).toISOString();
}

/** Intervalo [início do dia, início do dia seguinte) em UTC, para filtrar agendamentos. */
export function faixaDoDia(dia: Dia, fuso: string, dias = 1): { de: string; ate: string } {
  return { de: instante(dia, '00:00', fuso), ate: instante(somarDias(dia, dias), '00:00', fuso) };
}

export function hora(iso: string, fuso: string): string {
  return formatInTimeZone(new Date(iso), fuso, 'HH:mm');
}

export function diaDe(iso: string, fuso: string): Dia {
  return formatInTimeZone(new Date(iso), fuso, 'yyyy-MM-dd');
}

/** Minutos desde 00:00 no fuso do pet shop (para posicionar na grade). */
export function minutosDoDia(iso: string, fuso: string): number {
  const [h, m] = formatInTimeZone(new Date(iso), fuso, 'HH:mm').split(':').map(Number);
  return h * 60 + m;
}

export function minutosDeHora(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function rotuloDia(dia: Dia, fuso: string, formato = "EEEE, d 'de' MMMM"): string {
  return formatInTimeZone(fromZonedTime(`${dia}T12:00:00`, fuso), fuso, formato, { locale: ptBR });
}

export function duracaoMin(inicioIso: string, fimIso: string): number {
  return Math.round((new Date(fimIso).getTime() - new Date(inicioIso).getTime()) / 60000);
}

export function somarMinutos(iso: string, min: number): string {
  return new Date(new Date(iso).getTime() + min * 60000).toISOString();
}
