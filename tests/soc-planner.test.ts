import { describe, expect, it } from 'vitest';
import { cycle25To26, scheduleDateHeader } from '../src/lib/dates';
import { buildSchedulePersistencePayload } from '../src/lib/persistence';
import { moveSocAssignment, removeSocAssignment, updateSocAssignment } from '../src/lib/socPlanner';
import type { ScheduleState } from '../src/types';

const state = (): ScheduleState => ({
  monthKey: { year: 2026, month: 7 }, dates: cycle25To26({ year: 2026, month: 7 }).dates,
  technicians: [{ id: 'tech-1', login: 'lvergani', name: 'Leonardo Vergani' }],
  cells: { 'tech-1': { 1: { shift: 'manha' } } }, visualGrouping: 'operational-shift',
});

describe('datas SOC', () => {
  it('mostra DD/MM e dia completo em duas informações', () => expect(scheduleDateHeader('2026-06-25')).toEqual({ date: '25/06', weekday: 'Qui' }));
  it('usa todas as abreviações sem deslocamento UTC', () => expect(['2026-06-28','2026-06-29','2026-06-30','2026-07-01','2026-07-02','2026-07-03','2026-07-04'].map((d) => scheduleDateHeader(d).weekday)).toEqual(['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']));
  it('preserva o ciclo 25–26', () => { const cycle = cycle25To26({ year: 2026, month: 7 }); expect([cycle.start, cycle.end, cycle.dates.length]).toEqual(['2026-06-25','2026-07-26',32]); });
});

describe('operações compartilhadas do Planejador', () => {
  it('aloca e move entre datas e turnos', () => { const moved = moveSocAssignment(state(), { technicianId:'tech-1', fromDay:1, toDay:2, shift:'noite' }); expect(moved.cells['tech-1'][1]).toBeUndefined(); expect(moved.cells['tech-1'][2]?.shift).toBe('noite'); });
  it('não duplica a mesma pessoa/data/turno', () => { const original = state(); expect(moveSocAssignment(original, { technicianId:'tech-1', toDay:1, shift:'manha' })).toBe(original); });
  it('remove e edita situações especiais', () => { const edited = updateSocAssignment(state(), 'tech-1', 1, { shift:'ferias' }); expect(edited.cells['tech-1'][1]?.shift).toBe('ferias'); expect(removeSocAssignment(edited, 'tech-1', 1).cells['tech-1'][1]).toBeUndefined(); });
});

describe('payload futuro', () => {
  it('é estável, serializável, sem Date e independente de preferências visuais', () => { const input = state(); const a = buildSchedulePersistencePayload(input); const b = buildSchedulePersistencePayload({ ...input }); expect(a).toEqual(b); expect(JSON.parse(JSON.stringify(a))).toEqual(a); expect(a.assignments[0].id).toContain('tech-1:2026-06-25'); expect(JSON.stringify(a)).not.toContain('firebase'); });
});
