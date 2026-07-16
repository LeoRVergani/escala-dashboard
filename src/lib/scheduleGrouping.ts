import { N1_SHIFT_LABELS } from '../constants';
import type { ScheduleState, ShiftId, Technician } from '../types';

export const OPERATIONAL_SHIFT_ORDER = ['madrugada', 'manha', 'tarde', 'noite'] as const;
export type OperationalShift = (typeof OPERATIONAL_SHIFT_ORDER)[number];
export type OperationalShiftGroup = OperationalShift | 'sem-turno';

export interface OperationalShiftGroupInfo {
  id: OperationalShiftGroup;
  label: string;
  hours?: string;
  technicians: Technician[];
}

const ALL_OPERATIONAL_GROUPS: readonly OperationalShiftGroup[] = [
  ...OPERATIONAL_SHIFT_ORDER,
  'sem-turno',
];

const ORDER_INDEX: Record<OperationalShiftGroup, number> = {
  madrugada: 0,
  manha: 1,
  tarde: 2,
  noite: 3,
  'sem-turno': 4,
};

function isOperationalShift(shift: ShiftId): shift is OperationalShift {
  return OPERATIONAL_SHIFT_ORDER.includes(shift as OperationalShift);
}

/**
 * Obtém o turno que melhor representa o colaborador no período exibido.
 *
 * Folgas, férias, afastamentos e demais situações não participam da contagem.
 * Em empate, prevalece o turno que aparece primeiro cronologicamente no ciclo;
 * se ainda houver empate, usa-se a ordem operacional Madrugada → Manhã → Tarde → Noite.
 */
export function predominantOperationalShift(
  state: ScheduleState,
  technicianId: string,
): OperationalShiftGroup {
  const counts = new Map<OperationalShift, number>();
  const firstOccurrence = new Map<OperationalShift, number>();
  const row = state.cells[technicianId] ?? {};

  for (const day of Object.keys(row).map(Number).sort((a, b) => a - b)) {
    const shift = row[day]?.shift;
    if (!shift || !isOperationalShift(shift)) continue;
    counts.set(shift, (counts.get(shift) ?? 0) + 1);
    if (!firstOccurrence.has(shift)) firstOccurrence.set(shift, day);
  }

  if (counts.size === 0) return 'sem-turno';

  return [...counts.keys()].sort((a, b) => {
    const byCount = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    if (byCount !== 0) return byCount;
    const byFirstOccurrence = (firstOccurrence.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (firstOccurrence.get(b) ?? Number.MAX_SAFE_INTEGER);
    if (byFirstOccurrence !== 0) return byFirstOccurrence;
    return ORDER_INDEX[a] - ORDER_INDEX[b];
  })[0];
}

export function operationalShiftLabel(group: OperationalShiftGroup): { label: string; hours?: string } {
  if (group === 'sem-turno') return { label: 'Sem turno definido' };
  return N1_SHIFT_LABELS[group];
}

/** Agrupa e ordena os colaboradores sem alterar a ordem original dentro de cada turno. */
export function groupTechniciansByOperationalShift(state: ScheduleState): OperationalShiftGroupInfo[] {
  const buckets = new Map<OperationalShiftGroup, Technician[]>(
    ALL_OPERATIONAL_GROUPS.map((group) => [group, [] as Technician[]]),
  );

  for (const technician of state.technicians) {
    buckets.get(predominantOperationalShift(state, technician.id))!.push(technician);
  }

  return ALL_OPERATIONAL_GROUPS
    .map((id) => {
      const definition = operationalShiftLabel(id);
      return {
        id,
        label: definition.label,
        hours: definition.hours,
        technicians: buckets.get(id) ?? [],
      };
    })
    .filter((group) => group.technicians.length > 0);
}

export function operationalShiftGroupOrder(group: OperationalShiftGroup): number {
  return ORDER_INDEX[group];
}
