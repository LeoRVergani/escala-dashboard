import { SHIFT_BY_ID } from '../constants';
import { scheduleDates } from './dates';
import type { ScheduleState } from '../types';
import { isShiftAssignment } from './assignments';

export interface SchedulePersistencePayload {
  schemaVersion: 1;
  period: { id: string; type: 'SOC'; startDate: string; endDate: string; schemaVersion: 1 };
  members: Array<{ id: string; login: string; displayName: string; fullName?: string; active: true }>;
  assignments: Array<{ id: string; periodId: string; memberId: string; date: string; assignmentType: 'shift' | 'status'; shiftCode?: string; statusCode?: string; source: 'import' }>;
}

export function buildSchedulePersistencePayload(state: ScheduleState): SchedulePersistencePayload {
  const dates = scheduleDates(state);
  const periodId = `soc-${dates[0]}-${dates[dates.length - 1]}`;
  const members = state.technicians.map((member) => ({
    id: member.id,
    login: member.login ?? '',
    displayName: member.name ?? member.login ?? member.id,
    fullName: member.name,
    active: true as const,
  })).sort((a, b) => a.id.localeCompare(b.id));
  const assignments = state.technicians.flatMap((member) => dates.flatMap((date, index) => {
    const value = state.cells[member.id]?.[index + 1];
    if (!value) return [];
    const isShift = isShiftAssignment(value);
    return [{
      id: `${periodId}:${member.id}:${date}`,
      periodId,
      memberId: member.id,
      date,
      assignmentType: isShift ? 'shift' as const : 'status' as const,
      ...(isShift ? { shiftCode: SHIFT_BY_ID[value.shift].code } : { statusCode: value.text ?? SHIFT_BY_ID[value.shift].code }),
      source: 'import' as const,
    }];
  })).sort((a, b) => a.id.localeCompare(b.id));
  return { schemaVersion: 1, period: { id: periodId, type: 'SOC', startDate: dates[0], endDate: dates[dates.length - 1], schemaVersion: 1 }, members, assignments };
}
