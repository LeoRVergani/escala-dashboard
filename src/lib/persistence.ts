import { SHIFT_BY_ID } from '../constants';
import { isShiftAssignment } from './assignments';
import { scheduleDates } from './dates';
import { normalizeLogin } from './authRepository';
import type { AuthenticatedDashboardUser, ScheduleState, Team, Technician } from '../types';

export interface MemberDocument {
  id: string; memberId: string; teamId: string; login?: string; fullName?: string;
  displayName: string; scaleName: string; active: true; source: 'dashboard'; schemaVersion: 2;
}
export interface PeriodDocument {
  id: string; periodId: string; teamId: string; name: string; startDate: string; endDate: string;
  scheduleType?: string; sourceType: 'FIREBASE_DASHBOARD'; status: 'PUBLISHED'; active: true; sourceFileName?: string;
  sourceSheet?: string; sourceLayout?: string; publishedBy: string; publishedByLogin: string; publishedByUid: string; schemaVersion: 2;
}
export interface AssignmentDocument {
  id: string; assignmentId: string; teamId: string; periodId: string; memberId: string; scaleName: string;
  date: string; assignmentType: 'WORK_SHIFT' | 'OFF' | 'VACATION'; shiftCode?: string;
  shiftId?: string; shiftName?: string; statusCode?: string; customText?: string; source: 'DASHBOARD';
  updatedByLogin: string; schemaVersion: 2;
}
export interface OnCallAssignmentDocument {
  id: string; onCallId: string; teamId: string; periodId: string; memberId: string; scaleName: string;
  start: string; end: string; startDateTime: string; endDateTime: string; durationMinutes: number;
  category: 'ON_CALL'; label: string; notes: string; active: true; source: 'DASHBOARD'; updatedByLogin: string; schemaVersion: 2;
}
export interface StructuredPublicationPayload {
  kind: 'REGULAR' | 'ON_CALL'; period: PeriodDocument; members: MemberDocument[];
  assignments: AssignmentDocument[]; onCallAssignments: OnCallAssignmentDocument[];
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

export function deterministicMemberId(teamId: string, member: Pick<Technician, 'login' | 'name' | 'id'>): string {
  const login = normalizeLogin(member.login ?? '');
  const name = normalizeLogin(member.name ?? '');
  const identity = login ? `login:${login}` : `name:${name || normalizeLogin(member.id)}`;
  return `${teamId}-member-${stableHash(identity)}`;
}

export function deterministicPeriodId(teamId: string, startDate: string, endDate: string, kind: 'REGULAR' | 'ON_CALL'): string {
  return `${teamId}-${kind === 'ON_CALL' ? 'oncall' : 'schedule'}-${startDate}-${endDate}`;
}

function scheduleType(state: ScheduleState): string {
  if (state.serviceDeskN1) return 'SERVICE_DESK_N1';
  if (state.visualGrouping === 'operational-shift') return 'SOC';
  return 'REGULAR';
}

function memberDocuments(state: ScheduleState, team: Team): { documents: MemberDocument[]; byLocalId: Map<string, MemberDocument> } {
  const byId = new Map<string, MemberDocument>();
  const byLocalId = new Map<string, MemberDocument>();
  for (const member of state.technicians) {
    const login = normalizeLogin(member.login ?? '');
    const fullName = member.name?.trim();
    if (!login && !fullName) continue;
    const id = deterministicMemberId(team.id, member);
    const document: MemberDocument = {
      id, memberId: id, teamId: team.id, ...(login ? { login } : {}), ...(fullName ? { fullName } : {}),
      displayName: fullName ?? login, scaleName: fullName ?? login, active: true, source: 'dashboard', schemaVersion: 2,
    };
    byId.set(id, document);
    byLocalId.set(member.id, document);
  }
  return { documents: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)), byLocalId };
}

export function buildStructuredPublicationPayload(
  state: ScheduleState,
  team: Team,
  actor: Pick<AuthenticatedDashboardUser, 'uid' | 'login'>,
): StructuredPublicationPayload {
  const dates = scheduleDates(state);
  if (!dates.length) throw new Error('A escala não possui período.');
  const kind = state.viewType === 'oncall' ? 'ON_CALL' : 'REGULAR';
  if (team.scheduleKind !== kind) throw new Error(`O time ${team.name} aceita somente escalas ${team.scheduleKind}.`);
  const periodId = deterministicPeriodId(team.id, dates[0], dates[dates.length - 1], kind);
  const members = memberDocuments(state, team);
  const period: PeriodDocument = {
    id: periodId, periodId, teamId: team.id, name: `${team.name} · ${dates[0]} a ${dates[dates.length - 1]}`,
    startDate: dates[0], endDate: dates[dates.length - 1], ...(kind === 'REGULAR' ? { scheduleType: scheduleType(state) } : {}),
    sourceType: 'FIREBASE_DASHBOARD', status: 'PUBLISHED', active: true, sourceFileName: state.sourceFileName,
    sourceSheet: state.sourceSheet, sourceLayout: state.sourceLayout, publishedByLogin: actor.login,
    publishedBy: actor.login, publishedByUid: actor.uid, schemaVersion: 2,
  };
  const assignments: AssignmentDocument[] = [];
  const onCallAssignments: OnCallAssignmentDocument[] = [];
  if (kind === 'REGULAR') {
    for (const technician of state.technicians) {
      const member = members.byLocalId.get(technician.id);
      if (!member) continue;
      for (let index = 0; index < dates.length; index++) {
        const value = state.cells[technician.id]?.[index + 1];
        if (!value) continue;
        const shift = SHIFT_BY_ID[value.shift];
        const work = isShiftAssignment(value);
        // O leitor KMP atual aceita somente WORK_SHIFT, OFF e VACATION.
        // Outros status continuam preservados em statusCode/customText e usam
        // OFF como fallback legado não trabalhado até o KMP ampliar o enum.
        const assignmentType = work ? 'WORK_SHIFT' : value.shift === 'ferias' ? 'VACATION' : 'OFF';
        const id = `${periodId}-${member.id}-${dates[index]}`;
        assignments.push({
          id, assignmentId: id, teamId: team.id, periodId, memberId: member.id, scaleName: member.displayName,
          date: dates[index], assignmentType, ...(work ? { shiftCode: shift.code, shiftId: value.shift, shiftName: shift.label } : { statusCode: shift.code }),
          ...(value.text ? { customText: value.text } : {}), source: 'DASHBOARD', updatedByLogin: actor.login, schemaVersion: 2,
        });
      }
    }
  } else {
    for (const record of state.onCallRecords ?? []) {
      const local = state.technicians.find((item) => item.id === record.technician || item.login === record.technician || item.name === record.technician);
      const member = local ? members.byLocalId.get(local.id) : undefined;
      if (!member) continue;
      const id = `${periodId}-${member.id}-${stableHash(`${record.start}:${record.end}`)}`;
      onCallAssignments.push({
        id, onCallId: id, teamId: team.id, periodId, memberId: member.id, scaleName: member.displayName,
        start: record.start, end: record.end, startDateTime: record.start, endDateTime: record.end,
        durationMinutes: record.durationMinutes, category: 'ON_CALL', label: member.displayName, notes: '', active: true,
        source: 'DASHBOARD', updatedByLogin: actor.login, schemaVersion: 2,
      });
    }
  }
  return {
    kind,
    period,
    members: members.documents,
    assignments: [...new Map(assignments.map((assignment) => [assignment.id, assignment])).values()],
    onCallAssignments: [...new Map(onCallAssignments.map((assignment) => [assignment.id, assignment])).values()],
  };
}

/** Compatibilidade do adaptador puro introduzido na 1.6.0. */
export function buildSchedulePersistencePayload(state: ScheduleState) {
  const dates = scheduleDates(state);
  const periodId = `soc-${dates[0]}-${dates[dates.length - 1]}`;
  const members = state.technicians.map((member) => ({ id: member.id, login: member.login ?? '', displayName: member.name ?? member.login ?? member.id, fullName: member.name, active: true as const })).sort((a, b) => a.id.localeCompare(b.id));
  const assignments = state.technicians.flatMap((member) => dates.flatMap((date, index) => {
    const value = state.cells[member.id]?.[index + 1];
    if (!value) return [];
    const shift = isShiftAssignment(value);
    return [{ id: `${periodId}:${member.id}:${date}`, periodId, memberId: member.id, date, assignmentType: shift ? 'shift' as const : 'status' as const, ...(shift ? { shiftCode: SHIFT_BY_ID[value.shift].code } : { statusCode: value.text ?? SHIFT_BY_ID[value.shift].code }), source: 'import' as const }];
  })).sort((a, b) => a.id.localeCompare(b.id));
  return { schemaVersion: 1 as const, period: { id: periodId, type: 'SOC' as const, startDate: dates[0], endDate: dates[dates.length - 1], schemaVersion: 1 as const }, members, assignments };
}
