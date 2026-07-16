import type {
  CellValue,
  Conflict,
  ScheduleState,
  ServiceDeskN1Layer,
  ServiceDeskN1Row,
  Technician,
} from '../types';

export type CellMatrix = ScheduleState['cells'];

export function n1CellValue(code: string): CellValue {
  const text = code.trim().toUpperCase();
  if (text === 'F') return { shift: 'folga', text };
  if (text === 'X') return { shift: 'ferias', text };
  if (text === 'AUS') return { shift: 'afastamento', text };
  return { shift: 'custom', text };
}

export function n1Rows(state: ScheduleState, layer: ServiceDeskN1Layer): ServiceDeskN1Row[] {
  const data = state.serviceDeskN1;
  if (!data) return [];
  return layer === 'principal' ? data.principalRows : data.emailGuaranteeRows;
}

export function n1VisibleState(state: ScheduleState, layer: ServiceDeskN1Layer): ScheduleState {
  if (!state.serviceDeskN1) return state;
  const rows = n1Rows(state, layer);
  const technicians: Technician[] = rows.map((row) => ({
    id: row.id,
    name: row.displayName,
    login: row.employeeCode,
  }));
  const cells: CellMatrix = Object.fromEntries(rows.map((row) => [row.id, row.cells]));
  return { ...state, technicians, cells };
}

function replaceRows(
  state: ScheduleState,
  layer: ServiceDeskN1Layer,
  rows: ServiceDeskN1Row[],
): ScheduleState {
  if (!state.serviceDeskN1) return state;
  const serviceDeskN1 = {
    ...state.serviceDeskN1,
    ...(layer === 'principal' ? { principalRows: rows } : { emailGuaranteeRows: rows }),
  };
  return syncN1Aggregate({ ...state, serviceDeskN1 });
}

export function updateN1Cells(
  state: ScheduleState,
  layer: ServiceDeskN1Layer,
  updater: (cells: CellMatrix) => CellMatrix,
): ScheduleState {
  const rows = n1Rows(state, layer);
  const current: CellMatrix = Object.fromEntries(rows.map((row) => [row.id, row.cells]));
  const next = updater(current);
  return replaceRows(
    state,
    layer,
    rows.map((row) => ({ ...row, cells: next[row.id] ?? {} })),
  );
}

export function updateN1Rows(
  state: ScheduleState,
  layer: ServiceDeskN1Layer,
  updater: (rows: ServiceDeskN1Row[]) => ServiceDeskN1Row[],
): ScheduleState {
  return replaceRows(state, layer, updater(n1Rows(state, layer)));
}

export function syncN1Aggregate(state: ScheduleState): ScheduleState {
  const data = state.serviceDeskN1;
  if (!data) return state;

  const previousById = new Map(state.technicians.map((technician) => [technician.id, technician]));
  const existing = new Map<string, Technician>();
  for (const row of [...data.principalRows, ...data.emailGuaranteeRows]) {
    const previous = previousById.get(row.technicianId);
    existing.set(row.technicianId, {
      id: row.technicianId,
      name: row.fullName || previous?.name,
      login: previous?.login,
    });
  }

  const cells: CellMatrix = {};
  for (const row of data.principalRows) {
    const target = (cells[row.technicianId] ??= {});
    for (const [day, value] of Object.entries(row.cells)) {
      if (value) target[Number(day)] = value;
    }
  }

  return { ...state, technicians: [...existing.values()], cells };
}

export function mapN1Conflicts(
  conflicts: Conflict[],
  state: ScheduleState,
  layer: ServiceDeskN1Layer,
): Conflict[] {
  if (!state.serviceDeskN1) return conflicts;
  const rows = n1Rows(state, layer);
  const result: Conflict[] = [];
  for (const conflict of conflicts) {
    const matching = rows.filter((row) => row.technicianId === conflict.techId);
    const chosen = conflict.day
      ? matching.find((row) => Boolean(row.cells[conflict.day!])) ?? matching[0]
      : matching[0];
    if (chosen) result.push({ ...conflict, techId: chosen.id });
  }
  return result;
}
