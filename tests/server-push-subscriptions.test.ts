import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.mjs';
import { loadConfig } from '../server/config.mjs';
import { createFakeFirebaseAdmin } from './fakeFirebaseAdmin';
import { dispatchExpress, responseJson } from './serverTestHelpers';

const SECRET_ANDROID_TOKEN = 'android-token-secret-abcdef';
const SECRET_WEB_ENDPOINT = 'https://push.example.test/subscriptions/full-secret-endpoint';

function pushApp() {
  const fake = createFakeFirebaseAdmin({
    tokens: {
      caller: { uid: 'uid-caller' },
      other: { uid: 'uid-other' },
      root: { uid: 'uid-root' },
    },
    data: {
      user_links: {
        'uid-caller': { firebaseUid: 'uid-caller', active: true, login: 'caller@ici.test', role: 'USER', teamIds: ['team-a'] },
        'uid-other': { firebaseUid: 'uid-other', active: true, login: 'other@ici.test', role: 'USER', teamIds: ['team-a'] },
      },
      system_admins: {
        'uid-root': { active: true, login: 'root@ici.test' },
      },
    },
  });
  return { app: createApp(loadConfig({}), { getFirebaseAdmin: fake.getFirebaseAdmin }), fake };
}

function pushFetch(
  app: ReturnType<typeof createApp>,
  path: string,
  token: string,
  body?: Record<string, unknown>,
  method = 'POST',
) {
  return dispatchExpress(app, path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function activePushDocs(fake: ReturnType<typeof createFakeFirebaseAdmin>) {
  return Object.values(fake.data.push_subscriptions ?? {}).filter((doc) => doc.active === true);
}

describe('/api/push/subscriptions', () => {
  it('registra assinatura sempre para o caller verificado e não expõe token ou endpoint completo', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, fake } = pushApp();

    try {
      const result = await responseJson(await pushFetch(app, '/api/push/subscriptions', 'caller', {
        platform: 'android',
        token: SECRET_ANDROID_TOKEN,
        endpoint: SECRET_WEB_ENDPOINT,
        memberId: 'attacker@ici.test',
      }));

      expect(result.status).toBe(201);
      expect(result.body).toMatchObject({
        memberId: 'caller@ici.test',
        uid: 'uid-caller',
        platform: 'android',
        active: true,
      });
      expect(JSON.stringify(result.body)).not.toContain(SECRET_ANDROID_TOKEN);
      expect(JSON.stringify(result.body)).not.toContain(SECRET_WEB_ENDPOINT);

      const docs = activePushDocs(fake);
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({
        memberId: 'caller@ici.test',
        uid: 'uid-caller',
        platform: 'android',
        token: SECRET_ANDROID_TOKEN,
        endpoint: SECRET_WEB_ENDPOINT,
        active: true,
      });

      const capturedLogs = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().map(String).join('\n');
      expect(capturedLogs).not.toContain(SECRET_ANDROID_TOKEN);
      expect(capturedLogs).not.toContain(SECRET_WEB_ENDPOINT);
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('não duplica assinatura ativa para mesmo memberId, platform e token', async () => {
    const { app, fake } = pushApp();
    const body = { platform: 'web', token: { endpoint: SECRET_WEB_ENDPOINT, keys: { p256dh: 'p256dh-secret', auth: 'auth-secret' } } };

    const first = await responseJson(await pushFetch(app, '/api/push/subscriptions', 'caller', body));
    const second = await responseJson(await pushFetch(app, '/api/push/subscriptions', 'caller', body));

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(first.body.id).toBe(second.body.id);
    expect(activePushDocs(fake)).toHaveLength(1);
  });

  it('revogação só funciona para o dono ou isSystemAdmin', async () => {
    const { app, fake } = pushApp();
    const created = await responseJson(await pushFetch(app, '/api/push/subscriptions', 'caller', {
      platform: 'android',
      token: SECRET_ANDROID_TOKEN,
    }));

    const blocked = await responseJson(await pushFetch(app, `/api/push/subscriptions/${created.body.id}`, 'other', undefined, 'DELETE'));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('FORBIDDEN_ROLE');
    expect(fake.data.push_subscriptions[created.body.id].active).toBe(true);

    const ownerRevoked = await responseJson(await pushFetch(app, `/api/push/subscriptions/${created.body.id}`, 'caller', undefined, 'DELETE'));
    expect(ownerRevoked.status).toBe(200);
    expect(ownerRevoked.body.active).toBe(false);
    expect(fake.data.push_subscriptions[created.body.id].active).toBe(false);

    const recreated = await responseJson(await pushFetch(app, '/api/push/subscriptions', 'caller', {
      platform: 'android',
      token: 'another-android-token-secret',
    }));
    const adminRevoked = await responseJson(await pushFetch(app, `/api/push/subscriptions/${recreated.body.id}`, 'root', undefined, 'DELETE'));
    expect(adminRevoked.status).toBe(200);
    expect(fake.data.push_subscriptions[recreated.body.id].active).toBe(false);
  });
});
