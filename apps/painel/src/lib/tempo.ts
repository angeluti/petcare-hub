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

/** true se o instante cai exatamente às 00:00 no fuso do pet shop. */
export function ehMeiaNoite(iso: string, fuso: string): boolean {
  return formatInTimeZone(new Date(iso), fuso, 'HH:mm') === '00:00';
}

/** Texto curto de um período: "seg, 09/11", "09/11 a 12/11" ou "10/11, 08:00–12:00". */
export function rotuloPeriodo(inicio: string, fim: string, fuso: string): string {
  const d1 = diaDe(inicio, fuso);
  if (ehMeiaNoite(inicio, fuso) && ehMeiaNoite(fim, fuso)) {
    const ultimo = somarDias(diaDe(fim, fuso), -1);
    return ultimo === d1
      ? rotuloDia(d1, fuso, "EEE, dd/MM")
      : `${rotuloDia(d1, fuso, 'dd/MM')} a ${rotuloDia(ultimo, fuso, 'dd/MM')}`;
  }
  const d2 = diaDe(fim, fuso);
  return d2 === d1
    ? `${rotuloDia(d1, fuso, "EEE, dd/MM")}, ${hora(inicio, fuso)}–${hora(fim, fuso)}`
    : `${rotuloDia(d1, fuso, 'dd/MM')} ${hora(inicio, fuso)} a ${rotuloDia(d2, fuso, 'dd/MM')} ${hora(fim, fuso)}`;
}

/** Intervalos se sobrepõem (meio-aberto [ini, fim)). */
export function sobrepoe(aIni: string, aFim: string, bIni: string, bFim: string): boolean {
  return new Date(aIni) < new Date(bFim) && new Date(aFim) > new Date(bIni);
}
