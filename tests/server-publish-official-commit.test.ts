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

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
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

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
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

function totalEntities(pkg: OfficialPackage) {
  return ARRAY_KEYS
    .filter((key) => key !== 'publicationRecords')
    .reduce((total, key) => total + pkg[key].length, 0);
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
    mode: 'COMMIT',
    expectedActiveRevision: 0,
    idempotencyKey: 'idem-official-commit-test',
    confirmation: 'PUBLISH OFFICIAL ici-dev',
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

async function responseResult(response: Response) {
  return { status: response.status, body: await response.json() };
}

afterEach(async () => {
  await closeCurrentServer();
});

describe('POST /api/publish/official COMMIT', () => {
  it('bloqueia COMMIT sem ALLOW_OFFICIAL_FIRESTORE_WRITE e nao escreve no store', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const response = await postOfficialPublish(testServer, publishBody());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('OFFICIAL_WRITE_DISABLED');
    await expect(store.getWorkspaceStatus('ici-dev')).resolves.toEqual({
      exists: false,
      publicationRevision: 0,
    });
  });

  it.each([
    'publish official ici-dev',
    'PUBLISH OFFICIAL demo-v1',
    undefined,
  ])('rejeita confirmation invalida sem escrever no store', async (confirmation) => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store, { allowOfficialFirestoreWrite: true });

    const response = await postOfficialPublish(testServer, publishBody({ confirmation }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_CONFIRMATION');
    await expect(store.getWorkspaceStatus('ici-dev')).resolves.toEqual({
      exists: false,
      publicationRevision: 0,
    });
  });

  it('rejeita confirmation certa sem idempotencyKey', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store, { allowOfficialFirestoreWrite: true });

    const response = await postOfficialPublish(testServer, publishBody({ idempotencyKey: '' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_PACKAGE');
    await expect(store.getWorkspaceStatus('ici-dev')).resolves.toEqual({
      exists: false,
      publicationRevision: 0,
    });
  });

  it('rejeita COMMIT sem vinculo corporativo valido, mesmo com a flag ligada e confirmation certa', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store, { allowOfficialFirestoreWrite: true });

    const response = await postOfficialPublish(testServer, publishBody({
      corporateLink: { memberId: 'nao-existe', teamId: 'team-ici' },
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('CORPORATE_LINK_MEMBER_NOT_FOUND');
    await expect(store.getWorkspaceStatus('ici-dev')).resolves.toEqual({
      exists: false,
      publicationRevision: 0,
    });
  });

  it('bloqueia COMMIT com trabalho sem turno localizado antes de escrever no store', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store, { allowOfficialFirestoreWrite: true });
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
    await expect(store.getWorkspaceStatus('ici-dev')).resolves.toEqual({
      exists: false,
      publicationRevision: 0,
    });
  });

  it('publica uma primeira revisao valida e marca o publication_record como ACTIVE', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store, { allowOfficialFirestoreWrite: true });
    const requestBody = publishBody();
    const expectedTotal = totalEntities(JSON.parse(requestBody.packageRaw as string) as OfficialPackage);

    const response = await postOfficialPublish(testServer, requestBody);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'PUBLISHED',
      workspaceId: 'ici-dev',
      publicationRevision: 1,
      idempotencyKey: 'idem-official-commit-test',
    });
    expect(body.counts).toEqual({ countsCreated: expectedTotal, countsUpdated: 0 });
    await expect(store.getWorkspaceStatus('ici-dev')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 1,
    });
    await expect(store.findByIdempotencyKey('ici-dev', 'idem-official-commit-test')).resolves.toMatchObject({
      status: 'ACTIVE',
      publicationRevision: 1,
    });
  });

  it('repete o mesmo COMMIT com idempotencyKey ativa sem criar revisao nova', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store, { allowOfficialFirestoreWrite: true });
    const requestBody = publishBody();

    const firstResponse = await postOfficialPublish(testServer, requestBody);
    const firstBody = await firstResponse.json();
    const secondResponse = await postOfficialPublish(testServer, requestBody);
    const secondBody = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstBody.publicationRevision).toBe(1);
    expect(secondBody.publicationRevision).toBe(1);
    expect(secondBody.counts).toEqual(firstBody.counts);
  });

  it('cria uma segunda publicacao real com revisao monotonicamente maior', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store, { allowOfficialFirestoreWrite: true });
    const firstRequest = publishBody({ idempotencyKey: 'idem-official-1' });

    const firstResponse = await postOfficialPublish(testServer, firstRequest);
    const firstBody = await firstResponse.json();
    const secondResponse = await postOfficialPublish(testServer, publishBody({
      expectedActiveRevision: 1,
      idempotencyKey: 'idem-official-2',
    }));
    const secondBody = await secondResponse.json();

    expect(firstBody.publicationRevision).toBe(1);
    expect(secondResponse.status).toBe(200);
    expect(secondBody.publicationRevision).toBe(2);
    await expect(store.getWorkspaceStatus('ici-dev')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 2,
    });
  });

  it('rejeita COMMIT com expectedActiveRevision desatualizado', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store, { allowOfficialFirestoreWrite: true });

    await postOfficialPublish(testServer, publishBody({ idempotencyKey: 'idem-official-1' }));
    const response = await postOfficialPublish(testServer, publishBody({
      expectedActiveRevision: 0,
      idempotencyKey: 'idem-official-2',
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('PUBLICATION_REVISION_CONFLICT');
  });

  it('mantem a revisao ativa anterior quando a escrita de entidades falha (nao promove o ponteiro)', async () => {
    const baseStore = createInMemoryPublicationStore();
    let shouldFailWrites = false;
    const failingStore: InMemoryPublicationStore = {
      ...baseStore,
      async writeRevisionDocuments(plan) {
        if (shouldFailWrites) {
          throw new Error('forced write failure');
        }
        return baseStore.writeRevisionDocuments(plan);
      },
    };
    const testServer = await startTestServer(failingStore, { allowOfficialFirestoreWrite: true });

    const firstResponse = await postOfficialPublish(testServer, publishBody({ idempotencyKey: 'idem-before-failure' }));
    expect(firstResponse.status).toBe(200);
    await expect(failingStore.getWorkspaceStatus('ici-dev')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 1,
    });

    shouldFailWrites = true;
    const failedResponse = await postOfficialPublish(testServer, publishBody({
      expectedActiveRevision: 1,
      idempotencyKey: 'idem-failing-2',
    }));
    const failedBody = await failedResponse.json();

    expect(failedResponse.status).toBe(500);
    expect(failedBody.error.code).toBe('FIRESTORE_WRITE_FAILED');
    // A revisao anterior (1) continua ativa - o ponteiro nunca avancou para a 2 que falhou.
    await expect(failingStore.getWorkspaceStatus('ici-dev')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 1,
    });
    await expect(failingStore.findByIdempotencyKey('ici-dev', 'idem-failing-2')).resolves.toMatchObject({
      status: 'FAILED',
      publicationRevision: 2,
    });
  });

  it('retry com a mesma idempotencyKey de uma publicacao falha reutiliza a revisao candidata', async () => {
    const baseStore = createInMemoryPublicationStore();
    let shouldFailWrites = true;
    const failingStore: InMemoryPublicationStore = {
      ...baseStore,
      async writeRevisionDocuments(plan) {
        if (shouldFailWrites) {
          throw new Error('forced write failure');
        }
        return baseStore.writeRevisionDocuments(plan);
      },
    };
    const testServer = await startTestServer(failingStore, { allowOfficialFirestoreWrite: true });

    const failedResponse = await postOfficialPublish(testServer, publishBody({ idempotencyKey: 'idem-retry' }));
    expect(failedResponse.status).toBe(500);

    shouldFailWrites = false;
    const retryResponse = await postOfficialPublish(testServer, publishBody({ idempotencyKey: 'idem-retry' }));
    const retryBody = await retryResponse.json();

    expect(retryResponse.status).toBe(200);
    expect(retryBody.publicationRevision).toBe(1);
    await expect(failingStore.getWorkspaceStatus('ici-dev')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 1,
    });
  });

  it('resolve corrida entre dois COMMITs com expectedActiveRevision igual e idempotencyKey diferente', async () => {
    const baseStore = createInMemoryPublicationStore();
    const firstWriteStarted = deferred<void>();
    const releaseFirstWrite = deferred<void>();
    let writeCalls = 0;
    const delayedStore: InMemoryPublicationStore = {
      ...baseStore,
      async writeRevisionDocuments(plan) {
        writeCalls += 1;
        if (writeCalls === 1) {
          firstWriteStarted.resolve();
          await releaseFirstWrite.promise;
        }
        return baseStore.writeRevisionDocuments(plan);
      },
    };
    const testServer = await startTestServer(delayedStore, { allowOfficialFirestoreWrite: true });

    const firstPromise = postOfficialPublish(testServer, publishBody({ idempotencyKey: 'idem-race-a' }));
    await firstWriteStarted.promise;
    const secondPromise = postOfficialPublish(testServer, publishBody({ idempotencyKey: 'idem-race-b' }));
    releaseFirstWrite.resolve();

    const results = await Promise.all([firstPromise, secondPromise].map(async (promise) => (
      responseResult(await promise)
    )));
    const published = results.filter((result) => result.status === 200);
    const conflicted = results.filter((result) => result.status === 409);

    expect(published).toHaveLength(1);
    expect(conflicted).toHaveLength(1);
    expect(conflicted[0].body.error.code).toBe('PUBLICATION_REVISION_CONFLICT');
  });
});
