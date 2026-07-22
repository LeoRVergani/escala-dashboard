import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.mjs';
import { loadConfig } from '../server/config.mjs';
import { createFakeFirebaseAdmin } from './fakeFirebaseAdmin';
import { dispatchExpress, responseJson } from './serverTestHelpers';

function adminApp() {
  const fake = createFakeFirebaseAdmin({
    tokens: {
      root: { uid: 'uid-root' },
      schedule: { uid: 'uid-schedule' },
    },
    data: {
      user_links: {
        'uid-root': { firebaseUid: 'uid-root', active: true, login: 'root@ici.test', role: 'USER' },
        'uid-schedule': { firebaseUid: 'uid-schedule', active: true, login: 'schedule@ici.test', role: 'SCHEDULE_ADMIN', teamIds: ['team-a'] },
        'uid-target': { firebaseUid: 'uid-target', active: true, login: 'target@ici.test', role: 'USER', teamIds: [] },
      },
      system_admins: {
        'uid-root': { active: true, login: 'root@ici.test' },
      },
    },
  });
  return { app: createApp(loadConfig({}), { getFirebaseAdmin: fake.getFirebaseAdmin }), fake };
}

function adminFetch(app: ReturnType<typeof createApp>, path: string, token: string, body?: Record<string, unknown>, method = 'POST') {
  return dispatchExpress(app, path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/admin/users', () => {
  it('SYSTEM_ADMIN cadastra administrador', async () => {
    const { app, fake } = adminApp();
    const result = await responseJson(await adminFetch(app, '/api/admin/users', 'root', {
      login: 'Novo.Admin@ICI.TEST',
      role: 'SYSTEM_ADMIN',
      active: true,
    }));

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: 'novo.admin@ici.test', login: 'novo.admin@ici.test', role: 'SYSTEM_ADMIN', active: true });
    expect(fake.data.system_admins['novo.admin@ici.test']).toMatchObject({
      active: true,
      login: 'novo.admin@ici.test',
      grantedBy: 'root@ici.test',
    });
  });

  it('SCHEDULE_ADMIN não consegue administrar usuários', async () => {
    const { app } = adminApp();
    const result = await responseJson(await adminFetch(app, '/api/admin/users', 'schedule', {
      login: 'blocked@ici.test',
      role: 'SYSTEM_ADMIN',
    }));

    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('não desativa o último system_admin ativo', async () => {
    const { app } = adminApp();
    const result = await responseJson(await adminFetch(app, '/api/admin/users/uid-root', 'root', {
      role: 'SYSTEM_ADMIN',
      active: false,
    }, 'PATCH'));

    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('LAST_SYSTEM_ADMIN');
  });

  it('PATCH grava papel e times corretamente', async () => {
    const { app, fake } = adminApp();
    const result = await responseJson(await adminFetch(app, '/api/admin/users/uid-target', 'root', {
      role: 'SCHEDULE_ADMIN',
      teamIds: ['team-a', 'team-b'],
      active: true,
    }, 'PATCH'));

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: 'uid-target', role: 'SCHEDULE_ADMIN', teamIds: ['team-a', 'team-b'], active: true });
    expect(fake.data.user_links['uid-target']).toMatchObject({
      role: 'SCHEDULE_ADMIN',
      teamIds: ['team-a', 'team-b'],
      active: true,
      grantedBy: 'root@ici.test',
    });
    expect(fake.data.system_admins['uid-target']).toMatchObject({ active: false });
  });
});
