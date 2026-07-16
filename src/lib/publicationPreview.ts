import { collection, getCountFromServer, getDoc, doc, query, where } from 'firebase/firestore';
import { firebaseServices } from './firebase';
import { buildStructuredPublicationPayload } from './persistence';
import { canManageTeam } from './teamsRepository';
import type { AuthenticatedDashboardUser, Conflict, ScheduleState, Team } from '../types';

export interface PublicationPreview {
  payload: ReturnType<typeof buildStructuredPublicationPayload>;
  existingPeriod: boolean;
  existingAssignments: number;
  alerts: number;
  criticalErrors: string[];
  layoutWarning?: string;
}

export function publicationCriticalErrors(state: ScheduleState, team: Team, user: AuthenticatedDashboardUser, payload: ReturnType<typeof buildStructuredPublicationPayload>): string[] {
  const errors: string[] = [];
  if (!canManageTeam(user, team)) errors.push('Usuário não autorizado para este time.');
  if (state.isDemo) errors.push('Escalas de demonstração não podem ser publicadas.');
  if (!state.technicians.length) errors.push('A escala não possui técnicos.');
  if (!payload.assignments.length && !payload.onCallAssignments.length) errors.push('A escala não possui registros publicáveis.');
  return errors;
}

export async function buildPublicationPreview(state: ScheduleState, team: Team, user: AuthenticatedDashboardUser, conflicts: Conflict[]): Promise<PublicationPreview> {
  const payload = buildStructuredPublicationPayload(state, team, user);
  const criticalErrors = publicationCriticalErrors(state, team, user, payload);
  const layoutWarning = state.sourceLayout && !team.allowedImportLayouts.includes(state.sourceLayout) ? `O layout ${state.sourceLayout} não está entre os layouts permitidos para ${team.name}.` : undefined;
  const services = firebaseServices();
  if (!services) throw new Error('Firebase não configurado.');
  const periodCollection = payload.kind === 'ON_CALL' ? 'oncall_periods' : 'schedule_periods';
  const assignmentCollection = payload.kind === 'ON_CALL' ? 'oncall_assignments' : 'schedule_assignments';
  const [period, assignmentCount] = await Promise.all([
    getDoc(doc(services.db, periodCollection, payload.period.id)),
    getCountFromServer(query(collection(services.db, assignmentCollection), where('teamId', '==', team.id), where('periodId', '==', payload.period.id))),
  ]);
  return { payload, existingPeriod: period.exists(), existingAssignments: assignmentCount.data().count, alerts: conflicts.length, criticalErrors, layoutWarning };
}
