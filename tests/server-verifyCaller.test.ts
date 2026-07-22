import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.mjs';
import { loadConfig } from '../server/config.mjs';
import { createInMemoryPublicationStore } from '../server/domain/publicationStore.mjs';
import { createFakeFirebaseAdmin } from './fakeFirebaseAdmin';
import { dispatchExpress, responseJson } from './serverTestHelpers';

const ARRAY_KEYS = [
  'teams',
  'members',
  'memberTeamMemberships',
  'teamManagerAssignments',
  'scheduleChangeRequests',
  'schedulePeriods',
  'scheduleAssignments',
  'publicationRecords',
] as const;

function basePackage() {
  return {
    schemaVersion: 1,
    workspace: { workspaceId: 'ici-dev', workspaceType: 'PRODUCTION', publicationRevision: 1, externalEffectsAllowed: false, notificationsEnabled: false },
    teams: [{ id: 'team-ici', workspaceId: 'ici-dev', schemaVersion: 1 }],
    members: [{ id: 'member-ici', workspaceId: 'ici-dev', active: true, schemaVersion: 1 }],
    memberTeamMemberships: [{ id: 'membership-ici', workspaceId: 'ici-dev', memberId: 'member-ici', teamId: 'team-ici', active: true, schemaVersion: 1 }],
    teamManagerAssignments: [],
    scheduleChangeRequests: [],
    schedulePeriods: [{ id: 'period-ici', workspaceId: 'ici-dev', teamId: 'team-ici', schemaVersion: 1 }],
    scheduleAssignments: [{ id: 'assignment-ici', workspaceId: 'ici-dev', periodId: 'period-ici', teamId: 'team-ici', memberId: 'member-ici', schemaVersion: 1 }],
    publicationRecords: [],
  };
}

function publishBody() {
  const pkg = basePackage();
  const packageRaw = JSON.stringify(pkg);
  return {
    workspaceId: 'ici-dev',
    mode: 'DRY_RUN',
    expectedActiveRevision: 0,
    corporateLink: { memberId: 'member-ici', teamId: 'team-ici' },
    packageRaw,
    manifestRaw: JSON.stringify({
      workspaceId: 'ici-dev',
      sha256: createHash('sha256').update(packageRaw, 'utf8').digest('hex'),
      counts: Object.fromEntries(ARRAY_KEYS.map((key) => [key, pkg[key].length])),
      schemaVersion: 1,
    }),
  };
}

function appFor(data: Parameters<typeof createFakeFirebaseAdmin>[0]) {
  const fake = createFakeFirebaseAdmin(data);
  return createApp(loadConfig({}), {
    store: createInMemoryPublicationStore(),
    getFirebaseAdmin: fake.getFirebaseAdmin,
  });
}

async function postOfficial(app: ReturnType<typeof createApp>, token?: string) {
  return dispatchExpress(app, '/api/publish/official', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(publishBody()),
  });
}

describe('verifyCaller middleware', () => {
  it('token ausente retorna 401', async () => {
    const app = appFor({});
    const result = await responseJson(await postOfficial(app));
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('token inválido retorna 401', async () => {
    const app = appFor({ tokens: {} });
    const result = await responseJson(await postOfficial(app, 'invalid'));
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('token válido sem vínculo retorna 403 UNLINKED_ACCOUNT', async () => {
    const app = appFor({ tokens: { valid: { uid: 'uid-unlinked' } } });
    const result = await responseJson(await postOfficial(app, 'valid'));
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('UNLINKED_ACCOUNT');
  });

  it('SCHEDULE_ADMIN de outro time retorna 403 FORBIDDEN_TEAM', async () => {
    const app = appFor({
      tokens: { valid: { uid: 'uid-schedule' } },
      data: { user_links: { 'uid-schedule': { active: true, login: 'schedule@ici.test', role: 'SCHEDULE_ADMIN', teamIds: ['other-team'] } } },
    });
    const result = await responseJson(await postOfficial(app, 'valid'));
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('FORBIDDEN_TEAM');
  });

  it('SCHEDULE_ADMIN do time certo passa', async () => {
    const app = appFor({
      tokens: { valid: { uid: 'uid-schedule' } },
      data: { user_links: { 'uid-schedule': { active: true, login: 'schedule@ici.test', role: 'SCHEDULE_ADMIN', teamIds: ['team-ici'] } } },
    });
    const result = await responseJson(await postOfficial(app, 'valid'));
    expect(result.status).toBe(200);
    expect(result.body.status).toBe('VALIDATED');
  });

  it('SYSTEM_ADMIN passa para qualquer time', async () => {
    const app = appFor({
      tokens: { valid: { uid: 'uid-system' } },
      data: { system_admins: { 'uid-system': { active: true, login: 'system@ici.test' } } },
    });
    const result = await responseJson(await postOfficial(app, 'valid'));
    expect(result.status).toBe(200);
    expect(result.body.status).toBe('VALIDATED');
  });
});
