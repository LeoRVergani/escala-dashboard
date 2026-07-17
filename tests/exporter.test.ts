import { describe, expect, it } from 'vitest';
import { scheduleToWorkbook } from '../src/lib/exporter';
import { createDemoScheduleFromCatalog } from '../src/lib/scheduleFactories';
import type { ScheduleState } from '../src/types';

const referenceIso = '2026-07-16';

function withoutOrigin(state: ScheduleState): ScheduleState {
  const { origin: _origin, ...rest } = state;
  return rest;
}

describe('exporter', () => {
  it('adiciona Aviso como primeira aba para Test Drive de plantões', () => {
    const state = createDemoScheduleFromCatalog('plantao-cosi', referenceIso);
    const wb = scheduleToWorkbook(state);

    expect(state.viewType).toBe('oncall');
    expect(wb.SheetNames[0]).toBe('Aviso');
  });

  it('adiciona Aviso como primeira aba para Test Drive de grade', () => {
    const state = createDemoScheduleFromCatalog('soc-noc-6x1', referenceIso);
    const wb = scheduleToWorkbook(state);

    expect(state.viewType).toBe('schedule');
    expect(wb.SheetNames[0]).toBe('Aviso');
  });

  it('não adiciona Aviso para escalas importadas ou sem origem demo', () => {
    const imported: ScheduleState = {
      ...createDemoScheduleFromCatalog('soc-noc-6x1', referenceIso),
      origin: 'import',
    };
    const noOrigin = withoutOrigin(createDemoScheduleFromCatalog('plantao-cosi', referenceIso));

    expect(scheduleToWorkbook(imported).SheetNames).not.toContain('Aviso');
    expect(scheduleToWorkbook(noOrigin).SheetNames).not.toContain('Aviso');
  });
});
