import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.mjs';
import { loadConfig } from '../server/config.mjs';
import { createFakeFirebaseAdmin } from './fakeFirebaseAdmin';
import { dispatchExpress, responseJson } from './serverTestHelpers';

function devConfig(env: Record<string, string | undefined> = {}) {
  return loadConfig({
    NODE_ENV: 'development',
    DASHBOARD_DEV_LOCAL_AUTH: 'true',
    DEV_LOCAL_ADMIN_LOGINS: 'admin@ici.test',
    DEV_SESSION_SECRET: 'test-secret',
    ...env,
  });
}

function devApp(env: Record<string, string | undefined> = {}) {
  const fake = createFakeFirebaseAdmin();
  return { app: createApp(devConfig(env), { getFirebaseAdmin: fake.getFirebaseAdmin }), fake };
}

function cookieFrom(response: Response) {
  const setCookie = response.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0];
}

describe('/api/dev/login', () => {
  it('login não listado retorna 403', async () => {
    const { app } = devApp();
    const result = await responseJson(await dispatchExpress(app, '/api/dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'outro@ici.test' }),
    }));

    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('DEV_LOGIN_NOT_ALLOWED');
  });

  it('flag desligada deixa a rota inexistente', async () => {
    const app = createApp(devConfig({ DASHBOARD_DEV_LOCAL_AUTH: 'false' }));
    const result = await responseJson(await dispatchExpress(app, '/api/dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'admin@ici.test' }),
    }));

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe('API_UNAVAILABLE');
  });

  it('NODE_ENV production deixa a rota inexistente mesmo com flag ligada', async () => {
    const app = createApp(devConfig({ NODE_ENV: 'production' }));
    const result = await responseJson(await dispatchExpress(app, '/api/dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'admin@ici.test' }),
    }));

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe('API_UNAVAILABLE');
  });

  it('login válido gera cookie, grava vínculo pendente e sessão ativa', async () => {
    const { app, fake } = devApp();
    const loginResponse = await dispatchExpress(app, '/api/dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: ' ADMIN@ICI.TEST ' }),
    });
    const loginResult = await responseJson(loginResponse);
    const cookie = cookieFrom(loginResponse);

    expect(loginResult.status).toBe(200);
    expect(loginResult.body).toMatchObject({ active: true, login: 'admin@ici.test' });
    expect(cookie).toMatch(/^escala_dev_session=.+/);
    expect(fake.data.user_links['admin@ici.test']).toMatchObject({
      active: true,
      login: 'admin@ici.test',
      pendingRealLink: true,
    });

    const sessionResult = await responseJson(await dispatchExpress(app, '/api/dev/session', {
      headers: { Cookie: cookie },
    }));
    expect(sessionResult.status).toBe(200);
    expect(sessionResult.body).toEqual({ enabled: true, active: true, login: 'admin@ici.test' });
  });

  it('logout limpa a sessão', async () => {
    const { app } = devApp();
    const loginResponse = await dispatchExpress(app, '/api/dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'admin@ici.test' }),
    });
    const cookie = cookieFrom(loginResponse);

    const logoutResponse = await dispatchExpress(app, '/api/dev/logout', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    const logoutResult = await responseJson(logoutResponse);

    expect(logoutResult.status).toBe(200);
    expect(logoutResult.body).toEqual({ active: false });
    expect(logoutResponse.headers.get('set-cookie')).toContain('escala_dev_session=');
  });
});
