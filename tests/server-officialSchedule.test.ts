import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.mjs';
import { loadConfig } from '../server/config.mjs';
import { buildOfficialPublicationPlan } from '../server/domain/officialPublicationPlanner.mjs';
import { createInMemoryPublicationStore, type InMemoryPublicationStore } from '../server/domain/publicationStore.mjs';
import type { DemoPublicationPackage } from '../src/lib/demoWorkspace/dto';
import { createFakeFirebaseAdmin } from './fakeFirebaseAdmin';
import { dispatchExpress, responseJson } from './serverTestHelpers';

const WORKSPACE_ID = 'ici-dev';
const TEAM_ID = 'team-soc';
const OTHER_TEAM_ID = 'team-n1';

function packageFor(label: string): DemoPublicationPackage {
  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: WORKSPACE_ID,
      workspaceType: 'PRODUCTION',
      scenarioId: null,
      seedVersion: null,
      publicationRevision: 0,
      externalEffectsAllowed: false,
      notificationsEnabled: false,
    },
    teams: [
      { id: TEAM_ID, workspaceId: WORKSPACE_ID, name: `SOC ${label}`, acronym: 'SOC', active: true, schemaVersion: 1 },
      { id: OTHER_TEAM_ID, workspaceId: WORKSPACE_ID, name: `N1 ${label}`, acronym: 'N1', active: true, schemaVersion: 1 },
    ],
    members: [
      {
        id: 'member-soc',
        workspaceId: WORKSPACE_ID,
        displayName: `Analista SOC ${label}`,
        corporateLogin: 'soc.login',
        emailNormalized: 'soc.login@example.invalid',
        active: true,
        schemaVersion: 1,
      },
      {
        id: 'member-n1',
        workspaceId: WORKSPACE_ID,
        displayName: `Analista N1 ${label}`,
        corporateLogin: 'n1.login',
        emailNormalized: 'n1.login@example.invalid',
        active: true,
        schemaVersion: 1,
      },
    ],
    memberTeamMemberships: [
      {
        id: 'membership-soc',
        workspaceId: WORKSPACE_ID,
        memberId: 'member-soc',
        teamId: TEAM_ID,
        startDate: '2026-07-01',
        endDate: null,
        active: true,
        isPrimary: true,
        schemaVersion: 1,
      },
      {
        id: 'membership-n1',
        workspaceId: WORKSPACE_ID,
        memberId: 'member-n1',
        teamId: OTHER_TEAM_ID,
        startDate: '2026-07-01',
        endDate: null,
        active: true,
        isPrimary: true,
        schemaVersion: 1,
      },
    ],
    teamManagerAssignments: [
      {
        id: 'manager-soc',
        workspaceId: WORKSPACE_ID,
        managerMemberId: 'member-soc',
        teamId: TEAM_ID,
        role: 'PUBLISHER',
        permissions: {
          viewTeamSchedule: true,
          viewTeamMembers: true,
          editTeamSchedule: true,
          approveScheduleChanges: true,
          publishSchedule: true,
          manageTeamAssignments: true,
        },
        active: true,
        validFrom: '2026-07-01',
        validTo: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
        createdBy: 'test',
        schemaVersion: 1,
      },
    ],
    scheduleChangeRequests: [
      {
        id: 'change-soc',
        workspaceId: WORKSPACE_ID,
        requesterMemberId: 'member-soc',
        requesterTeamId: TEAM_ID,
        assignedManagerMemberId: 'member-soc',
        schedulePeriodId: 'period-soc',
        assignmentId: 'assignment-soc-01',
        requestType: 'SCHEDULE_CORRECTION',
        status: 'PENDING',
        reason: 'teste',
        createdAt: '2026-07-01T00:00:00.000Z',
        resolvedAt: null,
        resolvedByMemberId: null,
        resolutionNote: null,
        schemaVersion: 1,
      },
    ],
    schedulePeriods: [
      {
        id: 'period-soc',
        workspaceId: WORKSPACE_ID,
        teamId: TEAM_ID,
        name: `Julho ${label}`,
        startDate: '2026-07-01',
        endDate: '2026-07-02',
        active: true,
        publicationRevision: 0,
        schemaVersion: 1,
      },
      {
        id: 'period-n1',
        workspaceId: WORKSPACE_ID,
        teamId: OTHER_TEAM_ID,
        name: `Julho N1 ${label}`,
        startDate: '2026-07-01',
        endDate: '2026-07-02',
        active: true,
        publicationRevision: 0,
        schemaVersion: 1,
      },
    ],
    scheduleAssignments: [
      {
        id: 'assignment-soc-01',
        workspaceId: WORKSPACE_ID,
        periodId: 'period-soc',
        teamId: TEAM_ID,
        memberId: 'member-soc',
        date: '2026-07-01',
        assignmentType: 'WORK_SHIFT',
        shiftName: label === 'v1' ? 'Manhã' : 'Tarde',
        startTime: null,
        endTime: null,
        schemaVersion: 1,
      },
      {
        id: 'assignment-soc-02',
        workspaceId: WORKSPACE_ID,
        periodId: 'period-soc',
        teamId: TEAM_ID,
        memberId: 'member-soc',
        date: '2026-07-02',
        assignmentType: 'OFF',
        shiftName: null,
        startTime: null,
        endTime: null,
        schemaVersion: 1,
      },
      {
        id: 'assignment-n1-01',
        workspaceId: WORKSPACE_ID,
        periodId: 'period-n1',
        teamId: OTHER_TEAM_ID,
        memberId: 'member-n1',
        date: '2026-07-01',
        assignmentType: 'WORK_SHIFT',
        shiftName: 'Comercial',
        startTime: null,
        endTime: null,
        schemaVersion: 1,
      },
    ],
    publicationRecords: [],
  };
}

async function activate(store: InMemoryPublicationStore, pkg: DemoPublicationPackage) {
  const status = await store.getWorkspaceStatus(WORKSPACE_ID);
  const plan = buildOfficialPublicationPlan({ package: pkg, currentActiveRevision: status.publicationRevision });
  await store.writeRevisionDocuments(plan);
  await store.activateRevision(WORKSPACE_ID, plan.expectedNextRevision, plan.workspaceActivationWrite.data, {
    countsCreated: plan.entityWrites.length,
    countsUpdated: 0,
  });
}

function appFor(store = createInMemoryPublicationStore(), teamIds = [TEAM_ID]) {
  const fake = createFakeFirebaseAdmin({
    tokens: { valid: { uid: 'uid-schedule', email: 'schedule@ici.test' } },
    data: {
      user_links: {
        'uid-schedule': {
          active: true,
          login: 'schedule@ici.test',
          role: 'SCHEDULE_ADMIN',
          teamIds,
        },
      },
    },
  });
  return createApp(loadConfig({}), { store, getFirebaseAdmin: fake.getFirebaseAdmin });
}

function getSchedule(app: ReturnType<typeof createApp>, path: string, token = 'valid') {
  return dispatchExpress(app, path, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('GET /api/official/schedule', () => {
  it('sem teamId retorna 400', async () => {
    const result = await responseJson(await getSchedule(appFor(), '/api/official/schedule'));
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('INVALID_PACKAGE');
  });

  it('sem revisão publicada retorna EMPTY', async () => {
    const result = await responseJson(await getSchedule(appFor(), `/api/official/schedule?teamId=${TEAM_ID}`));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: 'EMPTY', workspaceId: WORKSPACE_ID });
  });

  it('time inexistente na revisão retorna TEAM_NOT_FOUND', async () => {
    const store = createInMemoryPublicationStore();
    await activate(store, packageFor('v1'));
    const result = await responseJson(await getSchedule(appFor(store, ['team-missing']), '/api/official/schedule?teamId=team-missing'));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: 'TEAM_NOT_FOUND', workspaceId: WORKSPACE_ID, revision: 1 });
  });

  it('revisão ativa carrega só dados do time pedido', async () => {
    const store = createInMemoryPublicationStore();
    await activate(store, packageFor('v1'));
    const result = await responseJson(await getSchedule(appFor(store), `/api/official/schedule?teamId=${TEAM_ID}`));

    expect(result.status).toBe(200);
    expect(result.body.status).toBe('OK');
    expect(result.body.revision).toBe(1);
    expect(result.body.package.teams.map((item: { id: string }) => item.id)).toEqual([TEAM_ID]);
    expect(result.body.package.members.map((item: { id: string }) => item.id)).toEqual(['member-soc']);
    expect(result.body.package.scheduleAssignments.map((item: { teamId: string }) => item.teamId)).toEqual([TEAM_ID, TEAM_ID]);
    expect(JSON.stringify(result.body.package)).not.toContain(OTHER_TEAM_ID);
    expect(JSON.stringify(result.body.package)).not.toContain('member-n1');
  });

  it('?revision=N consulta revisão anterior sem alterar o pointer ativo', async () => {
    const store = createInMemoryPublicationStore();
    await activate(store, packageFor('v1'));
    await activate(store, packageFor('v2'));

    const result = await responseJson(await getSchedule(appFor(store), `/api/official/schedule?teamId=${TEAM_ID}&revision=1`));
    const status = await store.getWorkspaceStatus(WORKSPACE_ID);

    expect(result.status).toBe(200);
    expect(result.body.status).toBe('OK');
    expect(result.body.revision).toBe(1);
    expect(result.body.package.teams[0].name).toBe('SOC v1');
    expect(status.publicationRevision).toBe(2);
  });

  it('sem autenticação retorna 401', async () => {
    const result = await responseJson(await getSchedule(appFor(), `/api/official/schedule?teamId=${TEAM_ID}`, ''));
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('SCHEDULE_ADMIN de outro time retorna 403', async () => {
    const result = await responseJson(await getSchedule(appFor(createInMemoryPublicationStore(), ['other-team']), `/api/official/schedule?teamId=${TEAM_ID}`));
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('FORBIDDEN_TEAM');
  });
});
