import { describe, expect, it } from 'vitest';
import { cycle25To26, scheduleDateHeader } from '../src/lib/dates';
import { buildSchedulePersistencePayload } from '../src/lib/persistence';
import { moveSocAssignment, removeSocAssignment, updateSocAssignment } from '../src/lib/socPlanner';
import type { ScheduleState } from '../src/types';
import { calculateConsecutiveWorkdayCounters, isShiftAssignment, isSpecialStatusAssignment } from '../src/lib/assignments';

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
  it('preserva Férias ao mover entre datas', () => { const input = updateSocAssignment(state(), 'tech-1', 1, { shift:'ferias' }); const moved = moveSocAssignment(input, { technicianId:'tech-1', fromDay:1, toDay:2, shift:'noite', value:{ shift:'ferias' } }); expect(moved.cells['tech-1'][2]?.shift).toBe('ferias'); });
});

describe('classificação e sequência', () => {
  it('separa quatro turnos de situações especiais sem depender do texto', () => { expect(isShiftAssignment({ shift:'noite', text:'qualquer' })).toBe(true); for (const shift of ['folga','ferias','afastamento','extra','comercial','plantao','custom'] as const) expect(isSpecialStatusAssignment({ shift })).toBe(true); });
  it('conta mudança de turno e atravessa o mês', () => { const input=state(); input.cells['tech-1']={1:{shift:'manha'},2:{shift:'noite'},3:{shift:'tarde'},4:{shift:'manha'},5:{shift:'manha'},6:{shift:'manha'},7:{shift:'manha'},8:{shift:'manha'}}; expect(calculateConsecutiveWorkdayCounters(input)['tech-1']).toMatchObject({1:1,2:2,6:6,7:7,8:8}); });
  it('reinicia em Folga, Férias, Afastamento ou vazio', () => { for (const stop of ['folga','ferias','afastamento'] as const) { const input=state(); input.cells['tech-1']={1:{shift:'manha'},2:{shift:stop},3:{shift:'noite'},5:{shift:'tarde'}}; expect(calculateConsecutiveWorkdayCounters(input)['tech-1']).toEqual({1:1,3:1,5:1}); } });
  it('não altera estado, exportação ou payload com badges derivados', () => { const input=state(); calculateConsecutiveWorkdayCounters(input); expect(input.cells['tech-1'][1]).toEqual({shift:'manha'}); expect(JSON.stringify(buildSchedulePersistencePayload(input))).not.toMatch(/counter|consecutive|badge/i); });
});

describe('payload futuro', () => {
  it('é estável, serializável, sem Date e independente de preferências visuais', () => { const input = state(); const a = buildSchedulePersistencePayload(input); const b = buildSchedulePersistencePayload({ ...input }); expect(a).toEqual(b); expect(JSON.parse(JSON.stringify(a))).toEqual(a); expect(a.assignments[0].id).toContain('tech-1:2026-06-25'); expect(JSON.stringify(a)).not.toContain('firebase'); });
});
