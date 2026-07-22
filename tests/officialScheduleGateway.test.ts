import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadOfficialSchedule } from '../src/lib/officialWorkspace/officialScheduleGateway';
import type { DemoPublicationPackage } from '../src/lib/demoWorkspace/dto';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fetchMock() {
  return global.fetch as ReturnType<typeof vi.fn>;
}

function officialPackage(): DemoPublicationPackage {
  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: 'ici-dev',
      workspaceType: 'PRODUCTION',
      scenarioId: null,
      seedVersion: null,
      publicationRevision: 3,
      externalEffectsAllowed: false,
      notificationsEnabled: false,
    },
    teams: [{ id: 'team-soc', workspaceId: 'ici-dev', name: 'SOC', acronym: 'SOC', active: true, schemaVersion: 1 }],
    members: [{
      id: 'member-a',
      workspaceId: 'ici-dev',
      displayName: 'Analista A',
      corporateLogin: 'analista.a',
      emailNormalized: 'analista.a@example.invalid',
      active: true,
      schemaVersion: 1,
    }],
    memberTeamMemberships: [{
      id: 'membership-a',
      workspaceId: 'ici-dev',
      memberId: 'member-a',
      teamId: 'team-soc',
      startDate: '2026-07-01',
      endDate: null,
      active: true,
      isPrimary: true,
      schemaVersion: 1,
    }],
    teamManagerAssignments: [],
    scheduleChangeRequests: [],
    schedulePeriods: [{
      id: 'period-soc',
      workspaceId: 'ici-dev',
      teamId: 'team-soc',
      name: 'Julho',
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      active: true,
      publicationRevision: 3,
      schemaVersion: 1,
    }],
    scheduleAssignments: [
      {
        id: 'assignment-1',
        workspaceId: 'ici-dev',
        periodId: 'period-soc',
        teamId: 'team-soc',
        memberId: 'member-a',
        date: '2026-07-01',
        assignmentType: 'WORK_SHIFT',
        shiftName: 'Manhã',
        startTime: '07:00',
        endTime: '13:00',
        schemaVersion: 1,
      },
      {
        id: 'assignment-2',
        workspaceId: 'ici-dev',
        periodId: 'period-soc',
        teamId: 'team-soc',
        memberId: 'member-a',
        date: '2026-07-02',
        assignmentType: 'OFF',
        shiftName: null,
        startTime: null,
        endTime: null,
        schemaVersion: 1,
      },
    ],
    publicationRecords: [],
  };
}

describe('loadOfficialSchedule', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('converte pacote OK em ScheduleState usando o adapter real', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({
      status: 'OK',
      workspaceId: 'ici-dev',
      revision: 3,
      package: officialPackage(),
    }));

    const result = await loadOfficialSchedule('team-soc');

    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;
    expect(result.revision).toBe(3);
    expect(result.schedule.origin).toBe('official-firebase');
    expect(result.schedule.officialTeamId).toBe('team-soc');
    expect(result.schedule.technicians).toEqual([{ id: 'member-a', name: 'Analista A', login: 'analista.a' }]);
    expect(result.schedule.cells['member-a'][1]?.shift).toBe('manha');
    expect(result.schedule.cells['member-a'][2]?.shift).toBe('folga');
    expect(fetchMock().mock.calls[0][0]).toBe('http://127.0.0.1:3001/api/official/schedule?teamId=team-soc');
  });

  it('trata EMPTY sem lançar exceção', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({ status: 'EMPTY', workspaceId: 'ici-dev' }));
    await expect(loadOfficialSchedule('team-soc')).resolves.toEqual({ status: 'EMPTY', workspaceId: 'ici-dev' });
  });

  it('trata TEAM_NOT_FOUND sem lançar exceção', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({ status: 'TEAM_NOT_FOUND', workspaceId: 'ici-dev', revision: 4 }));
    await expect(loadOfficialSchedule('team-missing')).resolves.toEqual({
      status: 'TEAM_NOT_FOUND',
      workspaceId: 'ici-dev',
      teamId: 'team-missing',
      revision: 4,
    });
  });

  it('trata OFFLINE sem afetar estado local existente', async () => {
    const localState = { marker: 'preserve-me' };
    fetchMock().mockRejectedValueOnce(new Error('network'));

    const result = await loadOfficialSchedule('team-soc');

    expect(result.status).toBe('OFFLINE');
    expect(localState).toEqual({ marker: 'preserve-me' });
  });
});
