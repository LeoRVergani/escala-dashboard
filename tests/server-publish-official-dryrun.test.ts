import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import http, { type Server } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.mjs';
import { loadConfig } from '../server/config.mjs';
import {
  createInMemoryPublicationStore,
  type InMemoryPublicationStore,
} from '../server/domain/publicationStore.mjs';

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

type ArrayKey = (typeof ARRAY_KEYS)[number];
type OfficialPackage = Record<ArrayKey, Array<Record<string, unknown>>> & {
  schemaVersion: number;
  workspace: Record<string, unknown>;
};

type TestServer = {
  app: ReturnType<typeof createApp>;
  baseUrl: string;
  close: () => Promise<void>;
};

let currentServer: TestServer | undefined;

function fakeGetFirebaseAdmin() {
  return {
    configured: true,
    auth: { verifyIdToken: async () => ({ uid: 'uid-system-admin', email: 'system.admin@ici.test' }) },
    db: {
      collection(name: string) {
        return {
          doc(id: string) {
            return {
              async get() {
                if (name === 'system_admins' && id === 'uid-system-admin') {
                  return { exists: true, data: () => ({ active: true, login: 'system.admin@ici.test' }) };
                }
                if (name === 'user_links' && id === 'uid-system-admin') {
                  return { exists: true, data: () => ({ active: true, login: 'system.admin@ici.test', role: 'USER' }) };
                }
                return { exists: false, data: () => undefined };
              },
            };
          },
        };
      },
    },
  };
}

function basePackage(): OfficialPackage {
  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: 'ici-dev',
      workspaceType: 'PRODUCTION',
      scenarioId: null,
      seedVersion: null,
      publicationRevision: 1,
      externalEffectsAllowed: false,
      notificationsEnabled: false,
    },
    teams: [{ id: 'team-ici', workspaceId: 'ici-dev', schemaVersion: 1 }],
    members: [
      { id: 'member-ici-analista', workspaceId: 'ici-dev', active: true, schemaVersion: 1 },
      { id: 'member-ici-lvergani', workspaceId: 'ici-dev', active: true, schemaVersion: 1 },
    ],
    memberTeamMemberships: [{
      id: 'membership-ici',
      workspaceId: 'ici-dev',
      memberId: 'member-ici-analista',
      teamId: 'team-ici',
      active: true,
      schemaVersion: 1,
    }],
    teamManagerAssignments: [{
      id: 'manager-assignment-ici',
      workspaceId: 'ici-dev',
      managerMemberId: 'member-ici-lvergani',
      teamId: 'team-ici',
      schemaVersion: 1,
    }],
    scheduleChangeRequests: [],
    schedulePeriods: [{
      id: 'period-ici',
      workspaceId: 'ici-dev',
      teamId: 'team-ici',
      schemaVersion: 1,
    }],
    scheduleAssignments: [{
      id: 'assignment-ici',
      workspaceId: 'ici-dev',
      periodId: 'period-ici',
      teamId: 'team-ici',
      memberId: 'member-ici-analista',
      schemaVersion: 1,
    }],
    publicationRecords: [],
  };
}

function manifestFor(packageRaw: string, overrides: Record<string, unknown> = {}) {
  const pkg = JSON.parse(packageRaw) as OfficialPackage;
  return JSON.stringify({
    workspaceId: 'ici-dev',
    sha256: createHash('sha256').update(packageRaw, 'utf8').digest('hex'),
    counts: Object.fromEntries(ARRAY_KEYS.map((key) => [key, pkg[key].length])),
    schemaVersion: 1,
    ...overrides,
  });
}

function publishBody(overrides: Record<string, unknown> = {}) {
  const pkg = basePackage();
  const packageRaw = JSON.stringify(pkg);

  return {
    workspaceId: 'ici-dev',
    mode: 'DRY_RUN',
    expectedActiveRevision: 0,
    idempotencyKey: 'idem-official-test',
    confirmation: '',
    corporateLink: { memberId: 'member-ici-analista', teamId: 'team-ici' },
    packageRaw,
    manifestRaw: manifestFor(packageRaw),
    ...overrides,
  };
}

async function startTestServer(
  store: InMemoryPublicationStore,
  options: { allowOfficialFirestoreWrite?: boolean } = {},
): Promise<TestServer> {
  const config = loadConfig({
    ALLOW_OFFICIAL_FIRESTORE_WRITE: options.allowOfficialFirestoreWrite ? 'true' : 'false',
  });
  const app = createApp(config, { store, getFirebaseAdmin: fakeGetFirebaseAdmin });
  const server = http.createServer(app);

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (err) {
    server.close();
    if ((err as NodeJS.ErrnoException).code !== 'EPERM') {
      throw err;
    }

    currentServer = { app, baseUrl: 'app://local', close: async () => undefined };
    return currentServer;
  }

  server.removeAllListeners('error');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Servidor de teste sem porta TCP.');
  }

  currentServer = {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeHttpServer(server),
  };
  return currentServer;
}

async function closeHttpServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) { reject(err); return; }
      resolve();
    });
  });
}

async function closeCurrentServer() {
  if (!currentServer) return;
  const testServer = currentServer;
  currentServer = undefined;
  await testServer.close();
}

function lowerCaseHeaders(headers: HeadersInit = {}) {
  const normalized: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => { normalized[key.toLowerCase()] = value; });
  return normalized;
}

async function dispatchExpress(app: ReturnType<typeof createApp>, path: string, init: RequestInit = {}) {
  const body = typeof init.body === 'string' ? init.body : undefined;
  const headers = lowerCaseHeaders(init.headers);
  if (body !== undefined && !headers['content-length']) {
    headers['content-length'] = String(Buffer.byteLength(body));
  }

  const req = Readable.from(body === undefined ? [] : [body]) as Readable & {
    headers?: Record<string, string>;
    method?: string;
    url?: string;
  };

  const mutableReq = req as unknown as Record<string, unknown>;
  for (const key of ['on', 'once', 'emit', 'pipe', 'unpipe', 'pause', 'resume', 'read', 'setEncoding', 'destroy'] as const) {
    mutableReq[key] = req[key].bind(req);
  }

  req.method = init.method ?? 'GET';
  req.url = path;
  req.headers = headers;

  const events = new EventEmitter();
  const chunks: Buffer[] = [];
  const responseHeaders = new Headers();

  const res = {
    statusCode: 200,
    headersSent: false,
    locals: {},
    setHeader(name: string, value: string | number | readonly string[]) {
      responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : String(value));
    },
    getHeader(name: string) { return responseHeaders.get(name) ?? undefined; },
    removeHeader(name: string) { responseHeaders.delete(name); },
    writeHead(statusCode: number, headers?: Record<string, string>) {
      this.statusCode = statusCode;
      if (headers) Object.entries(headers).forEach(([name, value]) => this.setHeader(name, value));
      this.headersSent = true;
    },
    write(chunk: string | Buffer) { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); },
    end(chunk?: string | Buffer) {
      if (chunk) this.write(chunk);
      this.headersSent = true;
      events.emit('finish');
    },
    on: events.on.bind(events),
    once: events.once.bind(events),
    emit: events.emit.bind(events),
  };

  await new Promise<void>((resolve, reject) => {
    events.once('finish', resolve);
    events.once('error', reject);
    app(req as never, res as never);
  });

  return new Response(Buffer.concat(chunks), { status: res.statusCode, headers: responseHeaders });
}

async function appFetch(testServer: TestServer, path: string, init?: RequestInit) {
  if (testServer.baseUrl === 'app://local') {
    return dispatchExpress(testServer.app, path, init);
  }
  return fetch(`${testServer.baseUrl}${path}`, init);
}

async function postOfficialPublish(testServer: TestServer, body: Record<string, unknown>) {
  return appFetch(testServer, '/api/publish/official', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  await closeCurrentServer();
});

describe('POST /api/publish/official DRY_RUN', () => {
  it('ignora/rejeita workspaceId enviado pelo cliente diferente de ici-dev', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const response = await postOfficialPublish(testServer, publishBody({ workspaceId: 'algum-outro' }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
  });

  it('rejeita pacote com checksum errado', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);
    const requestBody = publishBody();

    const response = await postOfficialPublish(testServer, {
      ...requestBody,
      manifestRaw: manifestFor(requestBody.packageRaw as string, { sha256: '0'.repeat(64) }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('CHECKSUM_MISMATCH');
  });

  it('rejeita pacote com workspaceId misturado dentro de um item', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);
    const pkg = basePackage();
    pkg.members[0].workspaceId = 'demo-v1';
    const packageRaw = JSON.stringify(pkg);

    const response = await postOfficialPublish(testServer, publishBody({
      packageRaw,
      manifestRaw: manifestFor(packageRaw),
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
  });

  it('bloqueia DRY_RUN com trabalho sem turno localizado', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);
    const pkg = basePackage();
    pkg.scheduleAssignments[0].assignmentType = 'OTHER';
    pkg.scheduleAssignments[0].shiftName = 'Trabalho sem turno localizado (1)';
    const packageRaw = JSON.stringify(pkg);

    const response = await postOfficialPublish(testServer, publishBody({
      packageRaw,
      manifestRaw: manifestFor(packageRaw),
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('SCHEDULE_WORK_SHIFT_NOT_LOCATED');
  });

  it('rejeita vinculo corporativo ausente antes de validar revisao', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const response = await postOfficialPublish(testServer, publishBody({ corporateLink: undefined }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('CORPORATE_LINK_INVALID');
  });

  it('rejeita vinculo corporativo apontando para membro inexistente no pacote', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const response = await postOfficialPublish(testServer, publishBody({
      corporateLink: { memberId: 'nao-existe', teamId: 'team-ici' },
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('CORPORATE_LINK_MEMBER_NOT_FOUND');
  });

  it('rejeita DRY_RUN com expectedActiveRevision divergente da revisao real', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const response = await postOfficialPublish(testServer, publishBody({ expectedActiveRevision: 1 }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('PUBLICATION_REVISION_CONFLICT');
  });

  it('valida DRY_RUN sem escrever dados no store', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const response = await postOfficialPublish(testServer, publishBody({ expectedActiveRevision: 0 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'VALIDATED',
      workspaceId: 'ici-dev',
      currentActiveRevision: 0,
      nextPublicationRevision: 1,
      writesPerformed: 0,
      checksumStatus: 'MATCH',
    });
    await expect(store.getWorkspaceStatus('ici-dev')).resolves.toEqual({
      exists: false,
      publicationRevision: 0,
    });
  });

  it('bloqueia mode COMMIT quando a escrita oficial nao esta habilitada', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const response = await postOfficialPublish(testServer, publishBody({ mode: 'COMMIT', confirmation: 'PUBLISH OFFICIAL ici-dev' }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('OFFICIAL_WRITE_DISABLED');
  });

  it('rejeita mode invalido ou ausente', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const invalidModeResponse = await postOfficialPublish(testServer, publishBody({ mode: 'INVALID' }));
    expect(invalidModeResponse.status).toBe(400);
    expect((await invalidModeResponse.json()).error.code).toBe('INVALID_PACKAGE');

    const missingModeResponse = await postOfficialPublish(testServer, publishBody({ mode: undefined }));
    expect(missingModeResponse.status).toBe(400);
    expect((await missingModeResponse.json()).error.code).toBe('INVALID_PACKAGE');
  });

  it('demo-v1 continua funcionando normalmente no mesmo store usado pelo ici-dev', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const demoPackage = {
      schemaVersion: 1,
      workspace: {
        workspaceId: 'demo-v1',
        workspaceType: 'DEMO',
        scenarioId: 'still-works',
        seedVersion: 1,
        publicationRevision: 1,
        externalEffectsAllowed: false,
        notificationsEnabled: false,
      },
      teams: [{ id: 'team-demo', workspaceId: 'demo-v1', schemaVersion: 1 }],
      members: [{ id: 'member-demo', workspaceId: 'demo-v1', schemaVersion: 1 }],
      memberTeamMemberships: [],
      teamManagerAssignments: [],
      scheduleChangeRequests: [],
      schedulePeriods: [],
      scheduleAssignments: [],
      publicationRecords: [],
    };
    const demoPackageRaw = JSON.stringify(demoPackage);
    const demoManifestRaw = JSON.stringify({
      workspaceId: 'demo-v1',
      sha256: createHash('sha256').update(demoPackageRaw, 'utf8').digest('hex'),
      counts: Object.fromEntries(ARRAY_KEYS.map((key) => [key, (demoPackage as any)[key].length])),
      schemaVersion: 1,
    });

    const response = await appFetch(testServer, '/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'demo-v1',
        mode: 'DRY_RUN',
        expectedActiveRevision: 0,
        packageRaw: demoPackageRaw,
        manifestRaw: demoManifestRaw,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: 'VALIDATED', workspaceId: 'demo-v1' });
  });
});
