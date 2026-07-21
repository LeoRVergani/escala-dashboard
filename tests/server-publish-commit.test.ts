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
type DemoPackage = Record<ArrayKey, Array<Record<string, unknown>>> & {
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

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function basePackage(): DemoPackage {
  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: 'demo-v1',
      workspaceType: 'DEMO',
      scenarioId: 'publish-commit-test',
      seedVersion: 1,
      publicationRevision: 1,
      externalEffectsAllowed: false,
      notificationsEnabled: false,
    },
    teams: [{ id: 'team-demo', workspaceId: 'demo-v1', schemaVersion: 1 }],
    members: [
      { id: 'member-demo', workspaceId: 'demo-v1', schemaVersion: 1 },
      { id: 'manager-demo', workspaceId: 'demo-v1', schemaVersion: 1 },
    ],
    memberTeamMemberships: [{
      id: 'membership-demo',
      workspaceId: 'demo-v1',
      memberId: 'member-demo',
      teamId: 'team-demo',
      schemaVersion: 1,
    }],
    teamManagerAssignments: [{
      id: 'manager-assignment-demo',
      workspaceId: 'demo-v1',
      managerMemberId: 'manager-demo',
      teamId: 'team-demo',
      schemaVersion: 1,
    }],
    scheduleChangeRequests: [{
      id: 'request-demo',
      workspaceId: 'demo-v1',
      requesterMemberId: 'member-demo',
      requesterTeamId: 'team-demo',
      assignedManagerMemberId: 'manager-demo',
      schedulePeriodId: 'period-demo',
      assignmentId: 'assignment-demo',
      schemaVersion: 1,
    }],
    schedulePeriods: [{
      id: 'period-demo',
      workspaceId: 'demo-v1',
      teamId: 'team-demo',
      schemaVersion: 1,
    }],
    scheduleAssignments: [{
      id: 'assignment-demo',
      workspaceId: 'demo-v1',
      periodId: 'period-demo',
      teamId: 'team-demo',
      memberId: 'member-demo',
      schemaVersion: 1,
    }],
    publicationRecords: [{
      id: 'publication-demo',
      workspaceId: 'demo-v1',
      publicationRevision: 1,
      schemaVersion: 1,
    }],
  };
}

function totalEntities(pkg: DemoPackage) {
  return ARRAY_KEYS
    .filter((key) => key !== 'publicationRecords')
    .reduce((total, key) => total + pkg[key].length, 0);
}

function manifestFor(packageRaw: string, overrides: Record<string, unknown> = {}) {
  const pkg = JSON.parse(packageRaw) as DemoPackage;

  return JSON.stringify({
    workspaceId: 'demo-v1',
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
    workspaceId: 'demo-v1',
    mode: 'COMMIT',
    expectedActiveRevision: 0,
    localDraftRevision: 1,
    idempotencyKey: 'idem-commit-test',
    confirmation: 'PUBLISH DEMO demo-v1',
    packageRaw,
    manifestRaw: manifestFor(packageRaw),
    ...overrides,
  };
}

async function startTestServer(
  store: InMemoryPublicationStore,
  options: { allowDemoFirestoreWrite?: boolean } = {},
): Promise<TestServer> {
  const config = loadConfig({
    ALLOW_DEMO_FIRESTORE_WRITE: options.allowDemoFirestoreWrite ? 'true' : 'false',
  });
  const app = createApp(config, { store });
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

    currentServer = {
      app,
      baseUrl: 'app://local',
      close: async () => undefined,
    };
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
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
}

async function closeCurrentServer() {
  if (!currentServer) {
    return;
  }

  const testServer = currentServer;
  currentServer = undefined;
  await testServer.close();
}

function lowerCaseHeaders(headers: HeadersInit = {}) {
  const normalized: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    normalized[key.toLowerCase()] = value;
  });

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
    getHeader(name: string) {
      return responseHeaders.get(name) ?? undefined;
    },
    removeHeader(name: string) {
      responseHeaders.delete(name);
    },
    writeHead(statusCode: number, headers?: Record<string, string>) {
      this.statusCode = statusCode;
      if (headers) {
        Object.entries(headers).forEach(([name, value]) => this.setHeader(name, value));
      }
      this.headersSent = true;
    },
    write(chunk: string | Buffer) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    },
    end(chunk?: string | Buffer) {
      if (chunk) {
        this.write(chunk);
      }
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

  return new Response(Buffer.concat(chunks), {
    status: res.statusCode,
    headers: responseHeaders,
  });
}

async function appFetch(testServer: TestServer, path: string, init?: RequestInit) {
  if (testServer.baseUrl === 'app://local') {
    return dispatchExpress(testServer.app, path, init);
  }

  return fetch(`${testServer.baseUrl}${path}`, init);
}

async function postPublish(testServer: TestServer, body: Record<string, unknown>) {
  return appFetch(testServer, '/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function responseResult(response: Response) {
  return {
    status: response.status,
    body: await response.json(),
  };
}

afterEach(async () => {
  await closeCurrentServer();
});

describe('POST /api/publish COMMIT', () => {
  it('bloqueia COMMIT sem ALLOW_DEMO_FIRESTORE_WRITE e nao escreve no store', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const response = await postPublish(testServer, publishBody());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('DEMO_WRITE_DISABLED');
    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toEqual({
      exists: false,
      publicationRevision: 0,
    });
  });

  it.each([
    'publish demo demo-v1',
    'PUBLISH DEMO ici',
    undefined,
  ])('rejeita confirmation invalida sem escrever no store', async (confirmation) => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store, { allowDemoFirestoreWrite: true });

    const response = await postPublish(testServer, publishBody({ confirmation }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_CONFIRMATION');
    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toEqual({
      exists: false,
      publicationRevision: 0,
    });
  });

  it('rejeita confirmation certa sem idempotencyKey', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store, { allowDemoFirestoreWrite: true });

    const response = await postPublish(testServer, publishBody({ idempotencyKey: '' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_PACKAGE');
    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toEqual({
      exists: false,
      publicationRevision: 0,
    });
  });

  it('publica uma primeira revisao valida e marca o publication_record como ACTIVE', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store, { allowDemoFirestoreWrite: true });
    const requestBody = publishBody();
    const expectedTotal = totalEntities(JSON.parse(requestBody.packageRaw as string) as DemoPackage);

    const response = await postPublish(testServer, requestBody);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'PUBLISHED',
      workspaceId: 'demo-v1',
      publicationRevision: 1,
      idempotencyKey: 'idem-commit-test',
    });
    expect(body.counts).toEqual({ countsCreated: expectedTotal, countsUpdated: 0 });
    expect(typeof body.publishedAt).toBe('string');
    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 1,
    });
    await expect(store.findByIdempotencyKey('demo-v1', 'idem-commit-test')).resolves.toMatchObject({
      status: 'ACTIVE',
      publicationRevision: 1,
      idempotencyKey: 'idem-commit-test',
    });
  });

  it('repete o mesmo COMMIT com idempotencyKey ativa sem criar revisao nova', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store, { allowDemoFirestoreWrite: true });
    const requestBody = publishBody();

    const firstResponse = await postPublish(testServer, requestBody);
    const firstBody = await firstResponse.json();
    const secondResponse = await postPublish(testServer, requestBody);
    const secondBody = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstBody.publicationRevision).toBe(1);
    expect(secondBody.publicationRevision).toBe(1);
    expect(firstBody.counts).toBeDefined();
    expect(secondBody.counts).toEqual(firstBody.counts);
    expect(secondBody.publishedAt).toEqual(firstBody.publishedAt);
    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 1,
    });
  });

  it('cria uma segunda publicacao real com revisao monotonicamente maior', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store, { allowDemoFirestoreWrite: true });
    const firstRequest = publishBody({ idempotencyKey: 'idem-commit-1' });
    const expectedTotal = totalEntities(JSON.parse(firstRequest.packageRaw as string) as DemoPackage);

    const firstResponse = await postPublish(testServer, firstRequest);
    const firstBody = await firstResponse.json();
    const secondResponse = await postPublish(testServer, publishBody({
      expectedActiveRevision: 1,
      idempotencyKey: 'idem-commit-2',
    }));
    const secondBody = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstBody.publicationRevision).toBe(1);
    expect(secondResponse.status).toBe(200);
    expect(secondBody.publicationRevision).toBe(2);
    expect(secondBody.counts).toEqual({ countsCreated: expectedTotal, countsUpdated: 0 });
    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 2,
    });
  });

  it('rejeita COMMIT com expectedActiveRevision desatualizado', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store, { allowDemoFirestoreWrite: true });

    await postPublish(testServer, publishBody({ idempotencyKey: 'idem-commit-1' }));
    const response = await postPublish(testServer, publishBody({
      expectedActiveRevision: 0,
      idempotencyKey: 'idem-commit-2',
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('PUBLICATION_REVISION_CONFLICT');
    expect(body.error.details).toEqual({
      expectedActiveRevision: 0,
      actualActiveRevision: 1,
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
    const testServer = await startTestServer(delayedStore, { allowDemoFirestoreWrite: true });

    const firstPromise = postPublish(testServer, publishBody({ idempotencyKey: 'idem-race-a' }));
    await firstWriteStarted.promise;
    const secondPromise = postPublish(testServer, publishBody({ idempotencyKey: 'idem-race-b' }));
    releaseFirstWrite.resolve();

    const results = await Promise.all([firstPromise, secondPromise].map(async (promise) => (
      responseResult(await promise)
    )));
    const published = results.filter((result) => result.status === 200);
    const conflicted = results.filter((result) => result.status === 409);

    expect(published).toHaveLength(1);
    expect(published[0].body).toMatchObject({
      status: 'PUBLISHED',
      workspaceId: 'demo-v1',
      publicationRevision: 1,
    });
    expect(conflicted).toHaveLength(1);
    expect(conflicted[0].body.error.code).toBe('PUBLICATION_REVISION_CONFLICT');
    await expect(delayedStore.getWorkspaceStatus('demo-v1')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 1,
    });
  });

  it('resolve duplo clique concorrente com a mesma idempotencyKey sem segunda escrita real', async () => {
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
    const testServer = await startTestServer(delayedStore, { allowDemoFirestoreWrite: true });

    const firstPromise = postPublish(testServer, publishBody({ idempotencyKey: 'idem-double-click' }));
    await firstWriteStarted.promise;
    const secondPromise = postPublish(testServer, publishBody({ idempotencyKey: 'idem-double-click' }));
    const secondResponse = await secondPromise;
    releaseFirstWrite.resolve();

    const results = await Promise.all([firstPromise, Promise.resolve(secondResponse)].map(async (promise) => (
      responseResult(await promise)
    )));
    const published = results.filter((result) => result.status === 200);
    const conflicted = results.filter((result) => result.status === 409);

    expect(published).toHaveLength(1);
    expect(published[0].body).toMatchObject({
      status: 'PUBLISHED',
      workspaceId: 'demo-v1',
      publicationRevision: 1,
      idempotencyKey: 'idem-double-click',
    });
    expect(conflicted).toHaveLength(1);
    expect(conflicted[0].body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(writeCalls).toBe(1);
    await expect(delayedStore.getWorkspaceStatus('demo-v1')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 1,
    });
    await expect(delayedStore.findByIdempotencyKey('demo-v1', 'idem-double-click')).resolves.toMatchObject({
      status: 'ACTIVE',
      publicationRevision: 1,
    });
  });

  it('mantem a revisao ativa anterior quando a escrita de entidades falha', async () => {
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
    const testServer = await startTestServer(failingStore, { allowDemoFirestoreWrite: true });

    const firstResponse = await postPublish(testServer, publishBody({
      idempotencyKey: 'idem-before-failure',
    }));
    expect(firstResponse.status).toBe(200);
    await expect(failingStore.getWorkspaceStatus('demo-v1')).resolves.toEqual({
      exists: true,
      publicationRevision: 1,
      workspaceType: 'DEMO',
      scenarioId: 'publish-commit-test',
      seedVersion: 1,
      updatedAt: expect.any(String),
    });

    shouldFailWrites = true;
    const failedResponse = await postPublish(testServer, publishBody({
      expectedActiveRevision: 1,
      idempotencyKey: 'idem-failing-2',
    }));
    const failedBody = await failedResponse.json();

    expect(failedResponse.status).toBe(500);
    expect(failedBody.error.code).toBe('FIRESTORE_WRITE_FAILED');
    await expect(failingStore.getWorkspaceStatus('demo-v1')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 1,
    });
    await expect(failingStore.findByIdempotencyKey('demo-v1', 'idem-failing-2')).resolves.toMatchObject({
      status: 'FAILED',
      publicationRevision: 2,
    });
  });
});
