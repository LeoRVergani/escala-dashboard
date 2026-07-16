import type { CellValue, ScheduleState } from '../types';

export const SOC_SHIFT_IDS = ['madrugada', 'manha', 'tarde', 'noite'] as const;
export type SocShiftId = typeof SOC_SHIFT_IDS[number];

export interface PlannerMove {
  technicianId: string;
  fromDay?: number;
  toDay: number;
  shift: SocShiftId;
  value?: CellValue;
}

export function moveSocAssignment(state: ScheduleState, move: PlannerMove): ScheduleState {
  const row = { ...(state.cells[move.technicianId] ?? {}) };
  if (move.fromDay !== undefined && move.fromDay !== move.toDay) delete row[move.fromDay];
  const current = row[move.toDay];
  if (current?.shift === move.shift && move.fromDay === undefined) return state;
  row[move.toDay] = move.value && !SOC_SHIFT_IDS.includes(move.value.shift as SocShiftId)
    ? move.value
    : { shift: move.shift };
  return { ...state, cells: { ...state.cells, [move.technicianId]: row } };
}

export function removeSocAssignment(state: ScheduleState, technicianId: string, day: number): ScheduleState {
  if (!state.cells[technicianId]?.[day]) return state;
  const row = { ...state.cells[technicianId] };
  delete row[day];
  return { ...state, cells: { ...state.cells, [technicianId]: row } };
}

export function updateSocAssignment(state: ScheduleState, technicianId: string, day: number, value: CellValue): ScheduleState {
  return { ...state, cells: { ...state.cells, [technicianId]: { ...(state.cells[technicianId] ?? {}), [day]: value } } };
}
