import type { CellValue, MonthKey, ScheduleState } from '../types';
import { daysInMonth, fold } from './normalize';
import { WEEKDAY_ABBREVIATIONS } from '../constants';

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseIsoDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(value: string, amount: number): string {
  const d = parseIsoDate(value);
  d.setDate(d.getDate() + amount);
  return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function dateRange(start: string, end: string): string[] {
  const result: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) result.push(cursor);
  return result;
}

/**
 * Ciclo operacional usado pelo SOC e pelo Plantão COSI.
 *
 * `monthKey` representa o mês em que o ciclo termina. Exemplo: julho/2026
 * produz 25/06/2026 → 26/07/2026. Os inícios programáveis vão até 25/07;
 * o dia 26 permanece visível para mostrar a saída do último plantão.
 */
export function cycle25To26(monthKey: MonthKey): {
  start: string;
  lastStart: string;
  end: string;
  dates: string[];
  startDates: string[];
} {
  const previous = new Date(monthKey.year, monthKey.month - 2, 25);
  const start = isoDate(previous.getFullYear(), previous.getMonth() + 1, 25);
  const lastStart = isoDate(monthKey.year, monthKey.month, 25);
  const end = isoDate(monthKey.year, monthKey.month, 26);
  return {
    start,
    lastStart,
    end,
    dates: dateRange(start, end),
    startDates: dateRange(start, lastStart),
  };
}

export function scheduleDates(state: ScheduleState): string[] {
  if (state.dates?.length) return state.dates;
  const { year, month } = state.monthKey;
  return Array.from({ length: daysInMonth(year, month) }, (_, i) => isoDate(year, month, i + 1));
}

export function formatBrDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Cabeçalho local e estável; não interpreta meia-noite como UTC. */
export function scheduleDateHeader(value: string): { date: string; weekday: string } {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return {
    date: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`,
    weekday: WEEKDAY_ABBREVIATIONS[new Date(year, month - 1, day).getDay()],
  };
}

export function periodLabel(state: ScheduleState): string {
  const dates = scheduleDates(state);
  if (!dates.length) return '';
  return dates.length === 1 ? formatBrDate(dates[0]) : `${formatBrDate(dates[0])} a ${formatBrDate(dates[dates.length - 1])}`;
}

export function localDateTime(dateIso: string, hour: number, minute = 0, nextDay = false): Date {
  const base = parseIsoDate(nextDay ? addDays(dateIso, 1) : dateIso);
  base.setHours(hour, minute, 0, 0);
  return base;
}

interface WorkInterval {
  start: Date;
  end: Date;
}

function timeRangeFromText(dateIso: string, text: string): WorkInterval | null {
  const m = fold(text).match(/(\d{1,2})(?::(\d{2}))?\s*(?:-|–|—|a|as|ate)\s*(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  const sh = Number(m[1]);
  const sm = Number(m[2] ?? 0);
  const eh = Number(m[3]);
  const em = Number(m[4] ?? 0);
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;
  const start = localDateTime(dateIso, sh, sm);
  const end = localDateTime(dateIso, eh, em, eh < sh || (eh === sh && em <= sm));
  return { start, end };
}

/** Retorna o intervalo real de trabalho conhecido para uma célula. */
export function workInterval(dateIso: string, value: CellValue | undefined): WorkInterval | null {
  if (!value || ['folga', 'ferias', 'afastamento'].includes(value.shift)) return null;
  if (value.text) {
    const parsed = timeRangeFromText(dateIso, value.text);
    if (parsed) return parsed;
  }
  switch (value.shift) {
    case 'madrugada': return { start: localDateTime(dateIso, 1), end: localDateTime(dateIso, 7) };
    case 'manha': return { start: localDateTime(dateIso, 7), end: localDateTime(dateIso, 13) };
    case 'tarde': return { start: localDateTime(dateIso, 13), end: localDateTime(dateIso, 19) };
    case 'noite': return { start: localDateTime(dateIso, 19), end: localDateTime(dateIso, 1, 0, true) };
    case 'comercial': return { start: localDateTime(dateIso, 8), end: localDateTime(dateIso, 18) };
    case 'plantao': return { start: localDateTime(dateIso, 7), end: localDateTime(dateIso, 19) };
    case 'extra':
    case 'custom':
      return null;
    default:
      return null;
  }
}
