import { describe, expect, it } from 'vitest';
import { folgaAccounting } from '../src/lib/folgaAccounting';
import type { ScheduleState } from '../src/types';

describe('folgaAccounting', () => {
  it('conta apenas tokens countsAsOff e classifica pela data real', () => {
    const state: ScheduleState = {
      monthKey: { year: 2026, month: 7 },
      visualGrouping: 'operational-shift',
      dates: [
        '2026-07-05',
        '2026-07-06',
        '2026-07-07',
        '2026-07-08',
        '2026-07-09',
        '2026-07-10',
        '2026-07-11',
        '2026-07-12',
      ],
      technicians: [
        { id: 'ana', name: 'Ana' },
        { id: 'beto', name: 'Beto' },
        { id: 'caio', login: 'caio.login' },
        { id: 'dina', name: 'Dina' },
      ],
      cells: {
        ana: {
          1: { shift: 'folga', text: 'DU' },
          2: { shift: 'folga', text: 'DF' },
          7: { shift: 'folga', text: 'Folga' },
          8: { shift: 'folga' },
        },
        beto: {
          1: { shift: 'folga', text: 'AN' },
          2: { shift: 'folga', text: 'BH' },
          3: { shift: 'ferias', text: 'X' },
          4: { shift: 'afastamento', text: '#' },
          5: { shift: 'manha' },
        },
        caio: {
          6: { shift: 'folga', text: 'DU' },
          7: { shift: 'folga', text: 'DF' },
          8: { shift: 'noite' },
        },
        dina: {},
      },
    };

    const rows = folgaAccounting(state);

    expect(rows).toEqual([
      { technicianId: 'ana', technicianName: 'Ana', sunday: 2, saturday: 1, week: 1, total: 4 },
      { technicianId: 'beto', technicianName: 'Beto', sunday: 0, saturday: 0, week: 0, total: 0 },
      { technicianId: 'caio', technicianName: 'caio.login', sunday: 0, saturday: 1, week: 1, total: 2 },
      { technicianId: 'dina', technicianName: 'Dina', sunday: 0, saturday: 0, week: 0, total: 0 },
    ]);
    expect(rows.every((row) => row.total === row.sunday + row.saturday + row.week)).toBe(true);
  });
});
