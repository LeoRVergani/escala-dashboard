import type { MonthKey, OnCallRecord, Technician } from '../types';
import { cycle25To26 } from './dates';

export interface OnCallDaySegment {
  record: OnCallRecord;
  startTime: string;
  endTime: string;
  startsHere: boolean;
  endsHere: boolean;
  minutes: number;
}

export interface OnCallAccountingRow {
  technician: string;
  shifts: number;
  /** Duração integral dos plantões iniciados no período selecionado. */
  minutes: number;
  /** Parcela dos plantões que cai dentro dos limites visuais do período. */
  calendarMinutes: number;
  weekendStarts: number;
  weekendMinutes: number;
}

function parseLocal(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return new Date(Number.NaN);
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    0,
  );
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatLocalDateTime(date: Date): string {
  return `${formatLocalDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function monthValue(monthKey: MonthKey): string {
  return `${monthKey.year}-${pad(monthKey.month)}`;
}

export function monthFromValue(value: string): MonthKey {
  const [year, month] = value.split('-').map(Number);
  return { year, month };
}

export function addMonths(monthKey: MonthKey, amount: number): MonthKey {
  const date = new Date(monthKey.year, monthKey.month - 1 + amount, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function monthDates(monthKey: MonthKey): string[] {
  const total = new Date(monthKey.year, monthKey.month, 0).getDate();
  return Array.from({ length: total }, (_item, index) => `${monthValue(monthKey)}-${pad(index + 1)}`);
}

/** Calendário civil preenchido até semanas completas. Mantido para compatibilidade. */
export function calendarDates(monthKey: MonthKey): string[] {
  const first = new Date(monthKey.year, monthKey.month - 1, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const last = new Date(monthKey.year, monthKey.month, 0);
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));
  const result: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    result.push(formatLocalDate(cursor));
  }
  return result;
}

/**
 * Regra operacional COSI:
 * - domingo a quinta: 19:00 até 07:00 do dia seguinte;
 * - sexta e sábado: 19:00 até 19:00 do dia seguinte.
 *
 * Portanto, em dias úteis o intervalo 07:00–19:00 não é contabilizado como
 * plantão, pois há equipe presencial no local.
 */
export function defaultOnCallRange(dateIso: string): { start: string; end: string; durationMinutes: number } {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!dateIso.match(/^\d{4}-\d{2}-\d{2}$/) || Number.isNaN(date.getTime())) throw new Error(`Data de plantão inválida: ${dateIso}`);
  const weekday = date.getUTCDay();
  const isContinuousWeekendEntry = weekday === 5 || weekday === 6;
  date.setUTCDate(date.getUTCDate() + 1);
  const nextDate = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return {
    start: `${dateIso}T19:00`,
    end: `${nextDate}T${isContinuousWeekendEntry ? '19:00' : '07:00'}`,
    durationMinutes: isContinuousWeekendEntry ? 24 * 60 : 12 * 60,
  };
}

export function createOnCallRecord(technician: string, dateIso: string, id: string): OnCallRecord {
  return { id, technician, ...defaultOnCallRange(dateIso) };
}

/** Ajusta um registro importado à regra operacional, preservando pessoa e data de início. */
export function normalizeOnCallRecordToRule(record: OnCallRecord): OnCallRecord {
  const expected = defaultOnCallRange(record.start.slice(0, 10));
  return { ...record, ...expected };
}

export function followsDefaultOnCallRule(record: OnCallRecord): boolean {
  const expected = defaultOnCallRange(record.start.slice(0, 10));
  return record.start === expected.start && record.end === expected.end && record.durationMinutes === expected.durationMinutes;
}

/** Ao mover, aplica a regra do novo dia (12h ou 24h), em vez de carregar duração incorreta. */
export function moveOnCallRecord(record: OnCallRecord, dateIso: string): OnCallRecord {
  return { ...record, ...defaultOnCallRange(dateIso) };
}

function dayBounds(dateIso: string): [number, number] {
  const [year, month, day] = dateIso.split('-').map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  return [start, new Date(year, month - 1, day + 1, 0, 0, 0, 0).getTime()];
}

export function recordOverlapsDay(record: OnCallRecord, dateIso: string): boolean {
  const [dayStart, dayEnd] = dayBounds(dateIso);
  const start = parseLocal(record.start).getTime();
  const end = parseLocal(record.end).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start < dayEnd && end > dayStart;
}

export function segmentsForDay(records: OnCallRecord[], dateIso: string): OnCallDaySegment[] {
  const [dayStart, dayEnd] = dayBounds(dateIso);
  return records
    .filter((record) => recordOverlapsDay(record, dateIso))
    .map((record) => {
      const start = parseLocal(record.start).getTime();
      const end = parseLocal(record.end).getTime();
      const segmentStart = Math.max(start, dayStart);
      const segmentEnd = Math.min(end, dayEnd);
      const startDate = new Date(segmentStart);
      const endDate = new Date(segmentEnd);
      return {
        record,
        startTime: segmentStart === dayStart && start < dayStart ? '00:00' : `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`,
        endTime: segmentEnd === dayEnd && end >= dayEnd ? '24:00' : `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`,
        startsHere: start >= dayStart && start < dayEnd,
        endsHere: end > dayStart && end <= dayEnd,
        minutes: Math.max(0, Math.round((segmentEnd - segmentStart) / 60000)),
      };
    })
    .sort((a, b) => a.record.start.localeCompare(b.record.start) || a.record.technician.localeCompare(b.record.technician));
}

function monthBounds(monthKey: MonthKey): [number, number] {
  return [
    new Date(monthKey.year, monthKey.month - 1, 1, 0, 0, 0, 0).getTime(),
    new Date(monthKey.year, monthKey.month, 1, 0, 0, 0, 0).getTime(),
  ];
}

export function overlapsMonth(record: OnCallRecord, monthKey: MonthKey): boolean {
  const [startMonth, endMonth] = monthBounds(monthKey);
  const start = parseLocal(record.start).getTime();
  const end = parseLocal(record.end).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start < endMonth && end > startMonth;
}

export function startsInMonth(record: OnCallRecord, monthKey: MonthKey): boolean {
  return record.start.startsWith(`${monthValue(monthKey)}-`);
}

export function minutesInsideMonth(record: OnCallRecord, monthKey: MonthKey): number {
  const [monthStart, monthEnd] = monthBounds(monthKey);
  const start = parseLocal(record.start).getTime();
  const end = parseLocal(record.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((Math.min(end, monthEnd) - Math.max(start, monthStart)) / 60000));
}

function cycleBounds(monthKey: MonthKey): [number, number] {
  const cycle = cycle25To26(monthKey);
  const [startYear, startMonth, startDay] = cycle.start.split('-').map(Number);
  const [endYear, endMonth, endDay] = cycle.end.split('-').map(Number);
  return [
    new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0).getTime(),
    new Date(endYear, endMonth - 1, endDay + 1, 0, 0, 0, 0).getTime(),
  ];
}

export function overlapsOperationalCycle(record: OnCallRecord, monthKey: MonthKey): boolean {
  const [cycleStart, cycleEnd] = cycleBounds(monthKey);
  const start = parseLocal(record.start).getTime();
  const end = parseLocal(record.end).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start < cycleEnd && end > cycleStart;
}

export function startsInOperationalCycle(record: OnCallRecord, monthKey: MonthKey): boolean {
  const { start, lastStart } = cycle25To26(monthKey);
  const date = record.start.slice(0, 10);
  return date >= start && date <= lastStart;
}

export function minutesInsideOperationalCycle(record: OnCallRecord, monthKey: MonthKey): number {
  const [cycleStart, cycleEnd] = cycleBounds(monthKey);
  const start = parseLocal(record.start).getTime();
  const end = parseLocal(record.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((Math.min(end, cycleEnd) - Math.max(start, cycleStart)) / 60000));
}

function minutesOnWeekendDates(record: OnCallRecord, dates: string[]): number {
  let total = 0;
  for (const date of dates) {
    const [year, month, day] = date.split('-').map(Number);
    const weekday = new Date(year, month - 1, day).getDay();
    if (weekday === 0 || weekday === 6) total += segmentsForDay([record], date)[0]?.minutes ?? 0;
  }
  return total;
}

function accountingForRange(
  records: OnCallRecord[],
  technicians: Technician[],
  overlaps: (record: OnCallRecord) => boolean,
  starts: (record: OnCallRecord) => boolean,
  insideMinutes: (record: OnCallRecord) => number,
  weekendDates: string[],
): OnCallAccountingRow[] {
  const names = new Set<string>();
  for (const technician of technicians) if (technician.name?.trim()) names.add(technician.name.trim());
  for (const record of records) if (overlaps(record)) names.add(record.technician.trim());
  return [...names]
    .filter(Boolean)
    .map((technician) => {
      const own = records.filter((record) => record.technician === technician && overlaps(record));
      const started = own.filter(starts);
      return {
        technician,
        shifts: started.length,
        minutes: started.reduce((sum, record) => sum + record.durationMinutes, 0),
        calendarMinutes: own.reduce((sum, record) => sum + insideMinutes(record), 0),
        weekendStarts: started.filter((record) => {
          const start = parseLocal(record.start);
          return start.getDay() === 0 || start.getDay() === 6;
        }).length,
        weekendMinutes: own.reduce((sum, record) => sum + minutesOnWeekendDates(record, weekendDates), 0),
      };
    })
    .sort((a, b) => b.shifts - a.shifts || b.minutes - a.minutes || a.technician.localeCompare(b.technician, 'pt-BR'));
}

/** Contabilidade civil mensal, mantida para compatibilidade e diagnóstico. */
export function onCallAccounting(
  records: OnCallRecord[],
  monthKey: MonthKey,
  technicians: Technician[] = [],
): OnCallAccountingRow[] {
  return accountingForRange(
    records,
    technicians,
    (record) => overlapsMonth(record, monthKey),
    (record) => startsInMonth(record, monthKey),
    (record) => minutesInsideMonth(record, monthKey),
    monthDates(monthKey),
  );
}

/** Contabilidade oficial do dashboard: ciclo de 25 do mês anterior até 26. */
export function onCallCycleAccounting(
  records: OnCallRecord[],
  monthKey: MonthKey,
  technicians: Technician[] = [],
): OnCallAccountingRow[] {
  const cycle = cycle25To26(monthKey);
  return accountingForRange(
    records,
    technicians,
    (record) => overlapsOperationalCycle(record, monthKey),
    (record) => startsInOperationalCycle(record, monthKey),
    (record) => minutesInsideOperationalCycle(record, monthKey),
    cycle.dates,
  );
}

export function missingStartDates(records: OnCallRecord[], monthKey: MonthKey): string[] {
  const occupied = new Set(records.filter((record) => startsInMonth(record, monthKey)).map((record) => record.start.slice(0, 10)));
  return monthDates(monthKey).filter((date) => !occupied.has(date));
}

export function duplicateStartDates(records: OnCallRecord[], monthKey: MonthKey): string[] {
  const counts = new Map<string, number>();
  for (const record of records.filter((candidate) => startsInMonth(candidate, monthKey))) {
    const date = record.start.slice(0, 10);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([date]) => date).sort();
}

export function missingCycleStartDates(records: OnCallRecord[], monthKey: MonthKey): string[] {
  const cycle = cycle25To26(monthKey);
  const occupied = new Set(records.filter((record) => startsInOperationalCycle(record, monthKey)).map((record) => record.start.slice(0, 10)));
  return cycle.startDates.filter((date) => !occupied.has(date));
}

export function duplicateCycleStartDates(records: OnCallRecord[], monthKey: MonthKey): string[] {
  const counts = new Map<string, number>();
  for (const record of records.filter((candidate) => startsInOperationalCycle(candidate, monthKey))) {
    const date = record.start.slice(0, 10);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([date]) => date).sort();
}

export function autoFillMonth(
  records: OnCallRecord[],
  technicians: Technician[],
  monthKey: MonthKey,
  makeId: () => string,
): OnCallRecord[] {
  const names = technicians.map((technician) => technician.name?.trim()).filter((name): name is string => Boolean(name));
  if (!names.length) return records;
  const current = [...records];
  const monthCounts = new Map(names.map((name) => [name, current.filter((record) => record.technician === name && startsInMonth(record, monthKey)).length]));
  for (const date of missingStartDates(current, monthKey)) {
    const selected = names.reduce((best, name) => {
      const bestCount = monthCounts.get(best) ?? 0;
      const count = monthCounts.get(name) ?? 0;
      return count < bestCount ? name : best;
    }, names[0]);
    current.push(createOnCallRecord(selected, date, makeId()));
    monthCounts.set(selected, (monthCounts.get(selected) ?? 0) + 1);
  }
  return current.sort((a, b) => a.start.localeCompare(b.start) || a.technician.localeCompare(b.technician, 'pt-BR'));
}

export function autoFillOperationalCycle(
  records: OnCallRecord[],
  technicians: Technician[],
  monthKey: MonthKey,
  makeId: () => string,
): OnCallRecord[] {
  const names = technicians.map((technician) => technician.name?.trim()).filter((name): name is string => Boolean(name));
  if (!names.length) return records;
  const current = [...records];
  const counts = new Map(names.map((name) => [name, current.filter((record) => record.technician === name && startsInOperationalCycle(record, monthKey)).length]));
  for (const date of missingCycleStartDates(current, monthKey)) {
    const selected = names.reduce((best, name) => {
      const bestCount = counts.get(best) ?? 0;
      const count = counts.get(name) ?? 0;
      return count < bestCount ? name : best;
    }, names[0]);
    current.push(createOnCallRecord(selected, date, makeId()));
    counts.set(selected, (counts.get(selected) ?? 0) + 1);
  }
  return current.sort((a, b) => a.start.localeCompare(b.start) || a.technician.localeCompare(b.technician, 'pt-BR'));
}
