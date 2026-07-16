import type { CellValue, ScheduleState, ShiftId } from '../types';

export const OPERATIONAL_SHIFT_IDS = ['madrugada', 'manha', 'tarde', 'noite'] as const;
export type OperationalShiftId = typeof OPERATIONAL_SHIFT_IDS[number];

const WORK_ASSIGNMENTS: ReadonlySet<ShiftId> = new Set([
  'madrugada', 'manha', 'tarde', 'noite', 'plantao', 'comercial', 'extra', 'custom',
]);

export function isShiftAssignment(value: CellValue | undefined): value is CellValue & { shift: OperationalShiftId } {
  return Boolean(value && OPERATIONAL_SHIFT_IDS.includes(value.shift as OperationalShiftId));
}

export function isSpecialStatusAssignment(value: CellValue | undefined): boolean {
  return Boolean(value && !isShiftAssignment(value));
}

/** Definição canônica de trabalho, compartilhada com alertas e badges. */
export function isWorkAssignment(value: CellValue | undefined): boolean {
  return Boolean(value && WORK_ASSIGNMENTS.has(value.shift));
}

export type ConsecutiveWorkdayCounters = Record<string, Record<number, number>>;

export function calculateConsecutiveWorkdayCounters(state: ScheduleState): ConsecutiveWorkdayCounters {
  const result: ConsecutiveWorkdayCounters = {};
  for (const technician of state.technicians) {
    const counters: Record<number, number> = {};
    let streak = 0;
    for (let day = 1; day <= (state.dates?.length ?? 31); day++) {
      if (isWorkAssignment(state.cells[technician.id]?.[day])) counters[day] = ++streak;
      else streak = 0;
    }
    result[technician.id] = counters;
  }
  return result;
}
