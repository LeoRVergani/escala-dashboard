import type { ScheduleState } from '../types';
import { parseIsoDate, scheduleDates } from './dates';
import { situationForAssignment } from './scheduleTokens';

export interface FolgaAccountingRow {
  technicianId: string;
  technicianName: string;
  sunday: number;
  saturday: number;
  week: number;
  total: number;
}

export function folgaAccounting(state: ScheduleState): FolgaAccountingRow[] {
  const dates = scheduleDates(state);

  return state.technicians.map((technician) => {
    let sunday = 0;
    let saturday = 0;
    let week = 0;

    dates.forEach((dateIso, index) => {
      const cell = state.cells[technician.id]?.[index + 1];
      if (!cell) return;

      const token = situationForAssignment(cell.shift, cell.text);
      if (!token.countsAsOff) return;

      const day = parseIsoDate(dateIso).getDay();
      if (day === 0) sunday += 1;
      else if (day === 6) saturday += 1;
      else week += 1;
    });

    return {
      technicianId: technician.id,
      technicianName: technician.name?.trim() || technician.login?.trim() || technician.id,
      sunday,
      saturday,
      week,
      total: sunday + saturday + week,
    };
  });
}
