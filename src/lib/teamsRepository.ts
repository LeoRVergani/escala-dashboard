import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { firebaseServices } from './firebase';
import { normalizeLogin } from './authRepository';
import type { AuthenticatedDashboardUser, Team } from '../types';

export function canManageTeamWithRole(user: AuthenticatedDashboardUser | null, teamId: string | null | undefined): boolean {
  return Boolean(
    user
    && teamId
    && (
      user.isSystemAdmin
      || (user.role === 'SCHEDULE_ADMIN' && user.teamIds.includes(teamId))
    ),
  );
}

export function canManageTeam(user: AuthenticatedDashboardUser | null, team: Team | null): boolean {
  return Boolean(
    user
    && team
    && (
      canManageTeamWithRole(user, team.id)
      || normalizeLogin(team.responsibleLogin) === user.login
    ),
  );
}

export function filterManagedTeams(user: AuthenticatedDashboardUser, teams: Team[]): Team[] {
  return teams.filter((team) => team.active && canManageTeam(user, team));
}

export async function loadManagedTeams(user: AuthenticatedDashboardUser): Promise<Team[]> {
  const services = firebaseServices();
  if (!services) return [];
  const base = collection(services.db, 'teams');
  const snapshot = await getDocs(user.isSystemAdmin || user.role === 'SCHEDULE_ADMIN' ? query(base, where('active', '==', true)) : query(base, where('responsibleLogin', '==', user.login), where('active', '==', true)));
  return filterManagedTeams(user, snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Team))).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function saveTeam(user: AuthenticatedDashboardUser, team: Team): Promise<void> {
  if (!user.isSystemAdmin) throw new Error('Somente system_admin pode cadastrar times.');
  const services = firebaseServices();
  if (!services) throw new Error('Firebase não configurado.');
  const id = team.id.trim().toLocaleLowerCase('pt-BR').replace(/[^a-z0-9-]+/g, '-');
  await setDoc(doc(services.db, 'teams', id), {
    ...team,
    id,
    teamId: id,
    teamName: team.name,
    responsibleLogin: normalizeLogin(team.responsibleLogin),
    schemaVersion: 2,
    updatedAt: serverTimestamp(),
    createdAt: team.createdAt ?? serverTimestamp(),
  }, { merge: true });
}
