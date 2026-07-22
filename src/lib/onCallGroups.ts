import type { OnCallGroup, Team } from '../types';

export const FALLBACK_SOC_ON_CALL_TEAM_ID = 'cosi-plantao-plantao-cosi';
export const FALLBACK_NOC_ON_CALL_TEAM_ID = 'cosi-plantao-noc';

export const DEV_ON_CALL_GROUP_FIXTURES: OnCallGroup[] = [
  { id: `${FALLBACK_SOC_ON_CALL_TEAM_ID}-cosi`, teamId: FALLBACK_SOC_ON_CALL_TEAM_ID, name: 'COSI', active: true },
  { id: `${FALLBACK_NOC_ON_CALL_TEAM_ID}-grupo-a`, teamId: FALLBACK_NOC_ON_CALL_TEAM_ID, name: 'Grupo A', active: true },
  { id: `${FALLBACK_NOC_ON_CALL_TEAM_ID}-grupo-b`, teamId: FALLBACK_NOC_ON_CALL_TEAM_ID, name: 'Grupo B', active: true },
];

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

function groupId(teamId: string, name: string): string {
  const slug = fold(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${teamId}-${slug || 'grupo'}`;
}

function inferredFixturesForTeam(team: Pick<Team, 'id' | 'code' | 'name' | 'scheduleKind'>): OnCallGroup[] {
  if (team.scheduleKind !== 'ON_CALL') return [];
  const label = fold(`${team.code} ${team.name}`);
  if (label.includes('noc')) {
    return [
      { id: groupId(team.id, 'Grupo A'), teamId: team.id, name: 'Grupo A', active: true },
      { id: groupId(team.id, 'Grupo B'), teamId: team.id, name: 'Grupo B', active: true },
    ];
  }
  if (label.includes('soc') || label.includes('cosi') || label.includes('plantao')) {
    return [{ id: groupId(team.id, 'COSI'), teamId: team.id, name: 'COSI', active: true }];
  }
  return [];
}

export function onCallGroupsWithDevelopmentFixtures(teams: Pick<Team, 'id' | 'code' | 'name' | 'scheduleKind'>[], storedGroups: OnCallGroup[]): OnCallGroup[] {
  const byId = new Map(storedGroups.map((group) => [group.id, group]));
  for (const team of teams) {
    const hasStoredGroup = storedGroups.some((group) => group.teamId === team.id);
    if (hasStoredGroup) continue;
    for (const fixture of inferredFixturesForTeam(team)) byId.set(fixture.id, fixture);
  }
  if (!teams.some((team) => team.id === FALLBACK_SOC_ON_CALL_TEAM_ID)) {
    for (const fixture of DEV_ON_CALL_GROUP_FIXTURES) byId.set(fixture.id, fixture);
  }
  return [...byId.values()].sort((a, b) => a.teamId.localeCompare(b.teamId) || a.name.localeCompare(b.name, 'pt-BR'));
}

export function activeGroupsForTeam(groups: OnCallGroup[], teamId: string): OnCallGroup[] {
  return groups
    .filter((group) => group.teamId === teamId && group.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function resolveOnCallGroupForImport(
  groups: OnCallGroup[],
  teamId: string,
  selectedGroupId: string,
): { ok: true; group: OnCallGroup; autoSelected: boolean } | { ok: false; message: string } {
  if (!teamId) return { ok: false, message: 'Selecione a equipe de plantão antes de importar.' };
  const activeGroups = activeGroupsForTeam(groups, teamId);
  if (activeGroups.length === 0) return { ok: false, message: 'Cadastre ao menos um grupo ativo para a equipe de plantão.' };
  if (activeGroups.length === 1) return { ok: true, group: activeGroups[0], autoSelected: true };
  const group = activeGroups.find((item) => item.id === selectedGroupId);
  if (!group) return { ok: false, message: 'Selecione explicitamente o grupo de plantão antes de importar.' };
  return { ok: true, group, autoSelected: false };
}
