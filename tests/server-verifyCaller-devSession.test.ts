import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../server/config.mjs';
import { createDevSessionToken } from '../server/infra/devSession.mjs';
import { createVerifyCallerMiddleware } from '../server/infra/verifyCaller.mjs';
import { createFakeFirebaseAdmin } from './fakeFirebaseAdmin';

function reqWithCookie(cookie: string) {
  return {
    headers: { cookie },
    get(name: string) {
      return name.toLowerCase() === 'cookie' ? cookie : undefined;
    },
  } as never;
}

describe('verifyCaller com sessão local de desenvolvimento', () => {
  it('cookie válido concede req.caller quando dev local está habilitado', async () => {
    const secret = 'test-secret';
    const token = createDevSessionToken('Admin@ICI.TEST', secret);
    const fake = createFakeFirebaseAdmin({
      data: {
        user_links: {
          'admin@ici.test': { active: true, login: 'admin@ici.test', role: 'SCHEDULE_ADMIN', teamIds: ['team-a'] },
        },
        system_admins: {
          'admin@ici.test': { active: true, login: 'admin@ici.test' },
        },
      },
    });
    const middleware = createVerifyCallerMiddleware({
      getFirebaseAdmin: fake.getFirebaseAdmin,
      config: loadConfig({
        NODE_ENV: 'development',
        DASHBOARD_DEV_LOCAL_AUTH: 'true',
        DEV_SESSION_SECRET: secret,
      }),
    });
    const req = reqWithCookie(`escala_dev_session=${token}`) as { caller?: Record<string, unknown> };
    const next = vi.fn();

    await middleware(req as never, {} as never, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.caller).toMatchObject({
      uid: 'admin@ici.test',
      login: 'admin@ici.test',
      role: 'SCHEDULE_ADMIN',
      teamIds: ['team-a'],
      isSystemAdmin: true,
      isDevSession: true,
    });
  });

  it('cookie idêntico é ignorado em production', async () => {
    const secret = 'test-secret';
    const token = createDevSessionToken('admin@ici.test', secret);
    const fake = createFakeFirebaseAdmin({
      data: {
        system_admins: {
          'admin@ici.test': { active: true, login: 'admin@ici.test' },
        },
      },
    });
    const middleware = createVerifyCallerMiddleware({
      getFirebaseAdmin: fake.getFirebaseAdmin,
      config: loadConfig({
        NODE_ENV: 'production',
        DASHBOARD_DEV_LOCAL_AUTH: 'true',
        DEV_SESSION_SECRET: secret,
      }),
    });
    const req = reqWithCookie(`escala_dev_session=${token}`) as { caller?: Record<string, unknown> };
    const next = vi.fn();

    await middleware(req as never, {} as never, next);

    expect(req.caller).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
