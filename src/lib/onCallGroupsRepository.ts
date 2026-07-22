import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { firebaseServices } from './firebase';
import { canManageTeamWithRole } from './teamsRepository';
import type { AuthenticatedDashboardUser, OnCallGroup, Team } from '../types';
import { onCallGroupsWithDevelopmentFixtures } from './onCallGroups';

const USE_DEVELOPMENT_FIXTURES = import.meta.env.DEV || import.meta.env.MODE === 'test';

function withDevelopmentFixtures(teams: Team[], groups: OnCallGroup[]): OnCallGroup[] {
  return USE_DEVELOPMENT_FIXTURES ? onCallGroupsWithDevelopmentFixtures(teams, groups) : groups;
}

function normalizeId(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function loadOnCallGroups(user: AuthenticatedDashboardUser | null, teams: Team[]): Promise<OnCallGroup[]> {
  const services = firebaseServices();
  if (!services || !user) return withDevelopmentFixtures(teams, []);

  const base = collection(services.db, 'oncall_groups');
  const visibleTeamIds = teams.filter((team) => canManageTeamWithRole(user, team.id)).map((team) => team.id);
  if (!visibleTeamIds.length) return withDevelopmentFixtures(teams, []);

  const groups: OnCallGroup[] = [];
  for (let offset = 0; offset < visibleTeamIds.length; offset += 10) {
    const ids = visibleTeamIds.slice(offset, offset + 10);
    const snapshot = await getDocs(query(base, where('teamId', 'in', ids)));
    groups.push(...snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as OnCallGroup)));
  }
  return withDevelopmentFixtures(teams, groups);
}

export async function saveOnCallGroup(
  user: AuthenticatedDashboardUser,
  group: Pick<OnCallGroup, 'teamId' | 'name' | 'active'> & { id?: string },
): Promise<void> {
  if (!canManageTeamWithRole(user, group.teamId)) throw new Error('Usuário não autorizado para administrar grupos deste time.');
  const services = firebaseServices();
  if (!services) throw new Error('Firebase não configurado.');

  const name = group.name.trim();
  if (!name) throw new Error('Informe o nome do grupo de plantão.');
  const id = group.id?.trim() || `${group.teamId}-${normalizeId(name)}`;
  await setDoc(doc(services.db, 'oncall_groups', id), {
    id,
    teamId: group.teamId,
    name,
    active: group.active,
    schemaVersion: 1,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true });
}
