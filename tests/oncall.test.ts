import { describe, expect, it } from 'vitest';
import {
  autoFillMonth,
  autoFillOperationalCycle,
  createOnCallRecord,
  defaultOnCallRange,
  duplicateStartDates,
  missingCycleStartDates,
  missingStartDates,
  moveOnCallRecord,
  normalizeOnCallRecordToRule,
  onCallCycleAccounting,
  onCallAccounting,
  segmentsForDay,
} from '../src/lib/onCall';
import { cycle25To26 } from '../src/lib/dates';
import type { OnCallRecord, Technician } from '../src/types';

const month = { year: 2026, month: 7 };

describe('planejamento de plantões', () => {
  it('usa 12h nos dias úteis e 24h nas noites de sexta e sábado', () => {
    expect(defaultOnCallRange('2026-07-02')).toMatchObject({ start: '2026-07-02T19:00', end: '2026-07-03T07:00', durationMinutes: 720 });
    expect(defaultOnCallRange('2026-07-03')).toMatchObject({ start: '2026-07-03T19:00', end: '2026-07-04T19:00', durationMinutes: 1440 });
    expect(defaultOnCallRange('2026-07-04')).toMatchObject({ start: '2026-07-04T19:00', end: '2026-07-05T19:00', durationMinutes: 1440 });
  });

  it('contabiliza corretamente os sábados informados no ciclo 25–26', () => {
    expect(createOnCallRecord('Jean Carlo Machado Ribeiro', '2026-06-27', 'jean')).toMatchObject({
      start: '2026-06-27T19:00', end: '2026-06-28T19:00', durationMinutes: 1440,
    });
    expect(createOnCallRecord('Caroline Ribeiro de Freitas', '2026-07-04', 'caroline')).toMatchObject({
      start: '2026-07-04T19:00', end: '2026-07-05T19:00', durationMinutes: 1440,
    });
  });

  it('mostra o mesmo plantonista em todos os dias realmente cobertos no modo dividido', () => {
    const record = createOnCallRecord('Bruno Bueno', '2026-07-03', 'p1');
    expect(segmentsForDay([record], '2026-07-03')[0]).toMatchObject({ startTime: '19:00', endTime: '24:00', startsHere: true });
    expect(segmentsForDay([record], '2026-07-04')[0]).toMatchObject({ startTime: '00:00', endTime: '19:00', startsHere: false, endsHere: true });
  });

  it('separa duração completa do plantão e horas civis quando atravessa o limite do mês', () => {
    const records: OnCallRecord[] = [{ id: 'p1', technician: 'Jean Ribeiro', start: '2026-06-30T19:00', end: '2026-07-01T07:00', durationMinutes: 720 }];
    expect(onCallAccounting(records, month)[0]).toMatchObject({ shifts: 0, minutes: 0, calendarMinutes: 420 });
  });

  it('contabiliza integralmente o plantão iniciado no último dia do mês', () => {
    const august = { year: 2026, month: 8 };
    const technicians: Technician[] = [
      { id: 't1', name: 'Bruno Bueno' },
      { id: 't2', name: 'Caroline Freitas' },
      { id: 't3', name: 'Jean Ribeiro' },
    ];
    let id = 0;
    const result = autoFillMonth([], technicians, august, () => `aug-${++id}`);
    const accounting = onCallAccounting(result, august, technicians);
    expect(accounting.reduce((sum, row) => sum + row.shifts, 0)).toBe(31);
    expect(accounting.reduce((sum, row) => sum + row.minutes, 0)).toBe(480 * 60);
    expect(accounting.reduce((sum, row) => sum + row.calendarMinutes, 0)).toBe(473 * 60);
  });

  it('autocompleta somente dias vazios e distribui de forma equilibrada', () => {
    const technicians: Technician[] = [
      { id: 't1', name: 'Bruno Bueno' },
      { id: 't2', name: 'Caroline Freitas' },
      { id: 't3', name: 'Jean Ribeiro' },
    ];
    const existing = [createOnCallRecord('Bruno Bueno', '2026-07-01', 'existing')];
    let id = 0;
    const result = autoFillMonth(existing, technicians, month, () => `new-${++id}`);
    expect(result).toHaveLength(31);
    expect(result.filter((record) => record.id === 'existing')).toHaveLength(1);
    const counts = onCallAccounting(result, month, technicians).map((row) => row.shifts).sort((a, b) => a - b);
    expect(counts[counts.length - 1] - counts[0]).toBeLessThanOrEqual(1);
  });

  it('move um plantão preservando horário inicial e duração', () => {
    const original = createOnCallRecord('Caroline Freitas', '2026-07-03', 'p1');
    const moved = moveOnCallRecord(original, '2026-07-10');
    expect(moved.start).toBe('2026-07-10T19:00');
    expect(moved.end).toBe('2026-07-11T19:00');
    expect(moved.durationMinutes).toBe(1440);
  });

  it('identifica dias sem plantão e dias com mais de um início', () => {
    const records = [createOnCallRecord('Bruno Bueno', '2026-07-01', 'p1'), createOnCallRecord('Jean Ribeiro', '2026-07-01', 'p2')];
    expect(duplicateStartDates(records, month)).toEqual(['2026-07-01']);
    expect(missingStartDates(records, month)).toHaveLength(30);
  });

  it('monta o ciclo completo de 25 do mês anterior até 26 do mês selecionado', () => {
    const cycle = cycle25To26(month);
    expect(cycle.start).toBe('2026-06-25');
    expect(cycle.lastStart).toBe('2026-07-25');
    expect(cycle.end).toBe('2026-07-26');
    expect(cycle.dates).toHaveLength(32);
    expect(cycle.startDates).toHaveLength(31);
  });

  it('normaliza horários de borda importados pela regra operacional COSI', () => {
    const first = normalizeOnCallRecordToRule({
      id: 'edge-1', technician: 'Jean Ribeiro', start: '2026-06-25T00:00', end: '2026-06-26T07:00', durationMinutes: 1860,
    });
    expect(first).toMatchObject({ start: '2026-06-25T19:00', end: '2026-06-26T07:00', durationMinutes: 720 });

    const last = normalizeOnCallRecordToRule({
      id: 'edge-2', technician: 'Caroline Freitas', start: '2026-07-25T19:00', end: '2026-07-26T00:00', durationMinutes: 300,
    });
    expect(last).toMatchObject({ start: '2026-07-25T19:00', end: '2026-07-26T19:00', durationMinutes: 1440 });
  });

  it('autocompleta apenas os inícios de 25 a 25 e contabiliza 492h no ciclo real', () => {
    const technicians: Technician[] = [
      { id: 't1', name: 'Bruno Bueno' },
      { id: 't2', name: 'Caroline Freitas' },
      { id: 't3', name: 'Jean Ribeiro' },
    ];
    let id = 0;
    const result = autoFillOperationalCycle([], technicians, month, () => `cycle-${++id}`);
    expect(result).toHaveLength(31);
    expect(missingCycleStartDates(result, month)).toEqual([]);
    expect(result.some((record) => record.start.startsWith('2026-07-26'))).toBe(false);
    const rows = onCallCycleAccounting(result, month, technicians);
    expect(rows.reduce((sum, row) => sum + row.minutes, 0)).toBe(492 * 60);
  });

  it('ao mover para uma sexta-feira reaplica 24h conforme o dia de destino', () => {
    const weekday = createOnCallRecord('Bruno Bueno', '2026-07-02', 'move-rule');
    const moved = moveOnCallRecord(weekday, '2026-07-03');
    expect(moved).toMatchObject({ start: '2026-07-03T19:00', end: '2026-07-04T19:00', durationMinutes: 1440 });
  });

});
