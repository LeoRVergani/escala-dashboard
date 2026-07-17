import { describe, expect, it } from 'vitest';
import { createDemoScheduleFromCatalog, createEmptyScheduleFromCatalog } from '../src/lib/scheduleFactories';
import { groupTechniciansByOperationalShift } from '../src/lib/scheduleGrouping';
import { defaultOnCallRange } from '../src/lib/onCall';
import type { ScheduleState, ScheduleTemplateKind, ServiceDeskN1Shift } from '../src/types';

const kinds: ScheduleTemplateKind[] = ['plantao-cosi', 'soc-noc-6x1', 'service-desk-n1-6x1'];
const referenceIso = '2026-07-16';

function allDemoIds(state: ScheduleState): string[] {
  return [
    ...state.technicians.map((technician) => technician.id),
    ...(state.onCallRecords ?? []).map((record) => record.id),
    ...(state.serviceDeskN1?.principalRows ?? []).map((row) => row.id),
    ...(state.serviceDeskN1?.principalRows ?? []).map((row) => row.technicianId),
    ...(state.serviceDeskN1?.emailGuaranteeRows ?? []).map((row) => row.id),
    ...(state.serviceDeskN1?.emailGuaranteeRows ?? []).map((row) => row.technicianId),
  ];
}

function countN1Shifts(rows: { shift: ServiceDeskN1Shift }[]): Record<ServiceDeskN1Shift, number> {
  return rows.reduce<Record<ServiceDeskN1Shift, number>>(
    (counts, row) => ({ ...counts, [row.shift]: counts[row.shift] + 1 }),
    { madrugada: 0, manha: 0, tarde: 0, noite: 0 },
  );
}

describe('scheduleFactories', () => {
  it('cria escalas vazias com a estrutura correta do catálogo', () => {
    const cosi = createEmptyScheduleFromCatalog('plantao-cosi', referenceIso);
    expect(cosi.technicians).toEqual([]);
    expect(cosi.origin).toBe('empty-template');
    expect(cosi.viewType).toBe('oncall');
    expect(cosi.onCallRecords).toEqual([]);
    expect(cosi.visualGrouping).toBeUndefined();
    expect(cosi.serviceDeskN1).toBeUndefined();

    const soc = createEmptyScheduleFromCatalog('soc-noc-6x1', referenceIso);
    expect(soc.technicians).toEqual([]);
    expect(soc.origin).toBe('empty-template');
    expect(soc.viewType).toBe('schedule');
    expect(soc.visualGrouping).toBe('operational-shift');
    expect(soc.serviceDeskN1).toBeUndefined();
    expect(soc.cells).toEqual({});

    const n1 = createEmptyScheduleFromCatalog('service-desk-n1-6x1', referenceIso);
    expect(n1.technicians).toEqual([]);
    expect(n1.origin).toBe('empty-template');
    expect(n1.viewType).toBe('schedule');
    expect(n1.visualGrouping).toBeUndefined();
    expect(n1.serviceDeskN1).toEqual({
      principalRows: [],
      emailGuaranteeRows: [],
      principalLegend: [],
      emailGuaranteeLegend: [],
    });
  });

  it.each(kinds)('gera demo determinística para %s', (kind) => {
    expect(createDemoScheduleFromCatalog(kind, referenceIso)).toEqual(
      createDemoScheduleFromCatalog(kind, referenceIso),
    );
  });

  it('gera demo COSI com plantões pela regra operacional', () => {
    const state = createDemoScheduleFromCatalog('plantao-cosi', referenceIso);
    expect(state.technicians.length).toBeGreaterThanOrEqual(3);
    expect(state.onCallRecords?.length).toBeGreaterThan(0);
    expect(allDemoIds(state).every((id) => /^demo-/.test(id))).toBe(true);

    for (const record of state.onCallRecords ?? []) {
      expect(record).toMatchObject(defaultOnCallRange(record.start.slice(0, 10)));
      const weekday = new Date(`${record.start.slice(0, 10)}T00:00:00`).getDay();
      if (weekday >= 1 && weekday <= 4) {
        expect(record.start.endsWith('T07:00')).toBe(false);
        expect(record.end.endsWith('T19:00')).toBe(false);
      }
    }
  });

  it('gera demo SOC com 9 colaboradores e agrupamento operacional esperado', () => {
    const state = createDemoScheduleFromCatalog('soc-noc-6x1', referenceIso);
    expect(state.technicians).toHaveLength(9);

    const groups = Object.fromEntries(
      groupTechniciansByOperationalShift(state).map((group) => [group.id, group.technicians.length]),
    );
    expect(groups).toMatchObject({ madrugada: 2, manha: 3, tarde: 2, noite: 2 });

    const forbidden = new Set(['M1', 'M2', 'M3', 'M4']);
    for (const row of Object.values(state.cells)) {
      for (const cell of Object.values(row)) {
        expect(cell?.text && forbidden.has(cell.text)).not.toBe(true);
      }
    }
  });

  it('gera demo N1 com linhas, distribuição e códigos próprios', () => {
    const state = createDemoScheduleFromCatalog('service-desk-n1-6x1', referenceIso);
    const n1 = state.serviceDeskN1;
    expect(n1).toBeDefined();
    expect(n1?.principalRows).toHaveLength(21);
    expect(countN1Shifts(n1?.principalRows ?? [])).toEqual({
      madrugada: 2,
      manha: 9,
      tarde: 8,
      noite: 2,
    });
    expect(n1?.emailGuaranteeRows.length).toBeGreaterThanOrEqual(4);

    const hasMVariant = n1?.principalRows.some((row) =>
      Object.values(row.cells).some((cell) => ['M1', 'M2', 'M3', 'M4'].includes(cell?.text ?? '')),
    );
    expect(hasMVariant).toBe(true);
  });

  it.each(kinds)('gera somente ids demo em %s', (kind) => {
    const state = createDemoScheduleFromCatalog(kind, referenceIso);
    expect(allDemoIds(state).every((id) => /^demo-/.test(id))).toBe(true);
  });
});
