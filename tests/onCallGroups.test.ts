import { describe, expect, it } from 'vitest';
import { activeGroupsForTeam, onCallGroupsWithDevelopmentFixtures } from '../src/lib/onCallGroups';
import type { Team } from '../src/types';

const teams: Team[] = [
  {
    id: 'cosi-plantao-plantao-cosi',
    code: 'SOC-PLANTAO',
    name: 'SOC Plantão',
    responsibleLogin: 'admin@ici.test',
    scheduleKind: 'ON_CALL',
    active: true,
    allowedImportLayouts: ['oncall'],
  },
  {
    id: 'cosi-plantao-noc',
    code: 'NOC-PLANTAO',
    name: 'NOC Plantão',
    responsibleLogin: 'admin@ici.test',
    scheduleKind: 'ON_CALL',
    active: true,
    allowedImportLayouts: ['oncall'],
  },
];

describe('onCallGroupsWithDevelopmentFixtures', () => {
  it('mantém SOC com exatamente um grupo COSI e NOC com múltiplos grupos de exemplo', () => {
    const groups = onCallGroupsWithDevelopmentFixtures(teams, []);

    expect(activeGroupsForTeam(groups, 'cosi-plantao-plantao-cosi').map((group) => group.name)).toEqual(['COSI']);
    expect(activeGroupsForTeam(groups, 'cosi-plantao-noc').map((group) => group.name)).toEqual(['Grupo A', 'Grupo B']);
  });
});
