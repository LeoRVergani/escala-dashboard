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

type CapturedPlan = {
  entityWrites: Array<{ collection: string; id: string; data: Record<string, unknown> }>;
};

type LoadDemoFixture = () => Promise<{ packageRaw: string; manifestRaw: string }>;

let currentServer: TestServer | undefined;

function basePackage(overrides: {
  scenarioId?: string;
  teamId?: string;
  memberId?: string;
  managerId?: string;
} = {}): DemoPackage {
  const scenarioId = overrides.scenarioId ?? 'demo-reset-fixture';
  const teamId = overrides.teamId ?? 'team-reset-fixture';
  const memberId = overrides.memberId ?? 'member-reset-fixture';
  const managerId = overrides.managerId ?? 'manager-reset-fixture';
  const periodId = `${teamId}-period`;
  const assignmentId = `${teamId}-assignment`;

  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: 'demo-v1',
      workspaceType: 'DEMO',
      scenarioId,
      seedVersion: 1,
      publicationRevision: 1,
      externalEffectsAllowed: false,
      notificationsEnabled: false,
    },
    teams: [{ id: teamId, workspaceId: 'demo-v1', name: scenarioId, schemaVersion: 1 }],
    members: [
      { id: memberId, workspaceId: 'demo-v1', schemaVersion: 1 },
      { id: managerId, workspaceId: 'demo-v1', schemaVersion: 1 },
    ],
    memberTeamMemberships: [{
      id: `${teamId}-membership`,
      workspaceId: 'demo-v1',
      memberId,
      teamId,
      schemaVersion: 1,
    }],
    teamManagerAssignments: [{
      id: `${teamId}-manager-assignment`,
      workspaceId: 'demo-v1',
      managerMemberId: managerId,
      teamId,
      schemaVersion: 1,
    }],
    scheduleChangeRequests: [{
      id: `${teamId}-request`,
      workspaceId: 'demo-v1',
      requesterMemberId: memberId,
      requesterTeamId: teamId,
      assignedManagerMemberId: managerId,
      schedulePeriodId: periodId,
      assignmentId,
      schemaVersion: 1,
    }],
    schedulePeriods: [{
      id: periodId,
      workspaceId: 'demo-v1',
      teamId,
      schemaVersion: 1,
    }],
    scheduleAssignments: [{
      id: assignmentId,
      workspaceId: 'demo-v1',
      periodId,
      teamId,
      memberId,
      schemaVersion: 1,
    }],
    publicationRecords: [{
      id: `${teamId}-publication`,
      workspaceId: 'demo-v1',
      publicationRevision: 1,
      schemaVersion: 1,
    }],
  };
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

function fixtureFor(pkg: DemoPackage): { packageRaw: string; manifestRaw: string } {
  const packageRaw = JSON.stringify(pkg);
  return { packageRaw, manifestRaw: manifestFor(packageRaw) };
}

function totalEntities(pkg: DemoPackage) {
  return ARRAY_KEYS
    .filter((key) => key !== 'publicationRecords')
    .reduce((total, key) => total + pkg[key].length, 0);
}

function resetBody(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: 'demo-v1',
    expectedActiveRevision: 0,
    idempotencyKey: 'idem-reset-test',
    confirmation: 'RESET DEMO demo-v1',
    ...overrides,
  };
}

async function startTestServer(
  store: InMemoryPublicationStore,
  options: { allowDemoFirestoreWrite?: boolean; loadDemoFixture?: LoadDemoFixture } = {},
): Promise<TestServer> {
  const config = loadConfig({
    ALLOW_DEMO_FIRESTORE_WRITE: options.allowDemoFirestoreWrite ? 'true' : 'false',
  });
  const app = createApp(config, { store, loadDemoFixture: options.loadDemoFixture });
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

async function postReset(testServer: TestServer, body: Record<string, unknown>) {
  return appFetch(testServer, '/api/demo/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createCapturingStore() {
  const baseStore = createInMemoryPublicationStore();
  const capturedPlans: CapturedPlan[] = [];
  const store: InMemoryPublicationStore = {
    ...baseStore,
    async writeRevisionDocuments(plan) {
      capturedPlans.push(plan);
      return baseStore.writeRevisionDocuments(plan);
    },
  };

  return { store, capturedPlans };
}

afterEach(async () => {
  await closeCurrentServer();
});

describe('POST /api/demo/reset', () => {
  it('usa a fixture injetada e ignora packageRaw e manifestRaw enviados no corpo', async () => {
    const injectedPackage = basePackage({ scenarioId: 'fixture-canonical', teamId: 'team-fixture' });
    const requestPackage = basePackage({ scenarioId: 'body-must-be-ignored', teamId: 'team-body' });
    const fixture = fixtureFor(injectedPackage);
    const { store, capturedPlans } = createCapturingStore();
    const testServer = await startTestServer(store, {
      allowDemoFirestoreWrite: true,
      loadDemoFixture: async () => fixture,
    });
    const requestPackageRaw = JSON.stringify(requestPackage);

    const response = await postReset(testServer, resetBody({
      packageRaw: requestPackageRaw,
      manifestRaw: manifestFor(requestPackageRaw),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.publicationRevision).toBe(1);
    expect(capturedPlans).toHaveLength(1);
    expect(capturedPlans[0].entityWrites).toContainEqual(expect.objectContaining({
      collection: 'teams',
      id: 'team-fixture',
      data: expect.objectContaining({ name: 'fixture-canonical' }),
    }));
    expect(capturedPlans[0].entityWrites).not.toContainEqual(expect.objectContaining({
      collection: 'teams',
      id: 'team-body',
    }));
  });

  it('rejeita workspace diferente de demo-v1 sem escrever no store', async () => {
    const { store, capturedPlans } = createCapturingStore();
    const testServer = await startTestServer(store, { allowDemoFirestoreWrite: true });

    const response = await postReset(testServer, resetBody({ workspaceId: 'outro-workspace' }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
    expect(capturedPlans).toHaveLength(0);
    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toEqual({
      exists: false,
      publicationRevision: 0,
    });
  });

  it.each([
    'RESET demo demo-v1',
    'RESET DEMO outro-workspace',
    undefined,
  ])('rejeita confirmation invalida sem escrever no store', async (confirmation) => {
    const { store, capturedPlans } = createCapturingStore();
    const testServer = await startTestServer(store, { allowDemoFirestoreWrite: true });

    const response = await postReset(testServer, resetBody({ confirmation }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_CONFIRMATION');
    expect(capturedPlans).toHaveLength(0);
    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toEqual({
      exists: false,
      publicationRevision: 0,
    });
  });

  it('rejeita idempotencyKey ausente sem escrever no store', async () => {
    const { store, capturedPlans } = createCapturingStore();
    const testServer = await startTestServer(store, { allowDemoFirestoreWrite: true });

    const response = await postReset(testServer, resetBody({ idempotencyKey: '' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_PACKAGE');
    expect(capturedPlans).toHaveLength(0);
  });

  it('cria nova revisao maior que a expectedActiveRevision e escreve o conteudo da fixture', async () => {
    const fixturePackage = basePackage({ scenarioId: 'reset-revision-3', teamId: 'team-revision-3' });
    const fixture = fixtureFor(fixturePackage);
    const expectedTotal = totalEntities(fixturePackage);
    const { store, capturedPlans } = createCapturingStore();
    const testServer = await startTestServer(store, {
      allowDemoFirestoreWrite: true,
      loadDemoFixture: async () => fixture,
    });

    await postReset(testServer, resetBody({ expectedActiveRevision: 0, idempotencyKey: 'reset-1' }));
    await postReset(testServer, resetBody({ expectedActiveRevision: 1, idempotencyKey: 'reset-2' }));
    const response = await postReset(testServer, resetBody({
      expectedActiveRevision: 2,
      idempotencyKey: 'reset-3',
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'RESET',
      workspaceId: 'demo-v1',
      publicationRevision: 3,
      idempotencyKey: 'reset-3',
    });
    expect(body.counts).toEqual({ countsCreated: expectedTotal, countsUpdated: 0 });
    expect(capturedPlans).toHaveLength(3);
    expect(capturedPlans[2].entityWrites).toContainEqual(expect.objectContaining({
      collection: 'teams',
      collectionPath: 'workspaces/demo-v1/revisions/3/teams',
      id: 'team-revision-3',
      data: expect.objectContaining({ name: 'reset-revision-3' }),
    }));
    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 3,
      scenarioId: 'reset-revision-3',
    });
  });

  it('rejeita expectedActiveRevision desatualizado sem alterar a revisao ativa', async () => {
    const fixture = fixtureFor(basePackage());
    const { store, capturedPlans } = createCapturingStore();
    const testServer = await startTestServer(store, {
      allowDemoFirestoreWrite: true,
      loadDemoFixture: async () => fixture,
    });

    await postReset(testServer, resetBody({ expectedActiveRevision: 0, idempotencyKey: 'reset-before-conflict' }));
    const response = await postReset(testServer, resetBody({
      expectedActiveRevision: 0,
      idempotencyKey: 'reset-conflict',
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('PUBLICATION_REVISION_CONFLICT');
    expect(body.error.details).toEqual({
      expectedActiveRevision: 0,
      actualActiveRevision: 1,
    });
    expect(capturedPlans).toHaveLength(1);
    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 1,
    });
  });

  it('repete a mesma idempotencyKey ativa sem criar nova revisao', async () => {
    const fixture = fixtureFor(basePackage());
    const { store, capturedPlans } = createCapturingStore();
    const testServer = await startTestServer(store, {
      allowDemoFirestoreWrite: true,
      loadDemoFixture: async () => fixture,
    });
    const requestBody = resetBody({ idempotencyKey: 'reset-idempotent' });

    const firstResponse = await postReset(testServer, requestBody);
    const firstBody = await firstResponse.json();
    const secondResponse = await postReset(testServer, requestBody);
    const secondBody = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstBody.publicationRevision).toBe(1);
    expect(secondBody.publicationRevision).toBe(1);
    expect(secondBody.counts).toEqual(firstBody.counts);
    expect(secondBody.publishedAt).toEqual(firstBody.publishedAt);
    expect(capturedPlans).toHaveLength(1);
    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 1,
    });
  });

  it('falha ao carregar a fixture sem alterar a revisao ativa existente', async () => {
    const fixture = fixtureFor(basePackage({ scenarioId: 'before-loader-failure' }));
    let shouldFailLoad = false;
    const { store, capturedPlans } = createCapturingStore();
    const testServer = await startTestServer(store, {
      allowDemoFirestoreWrite: true,
      loadDemoFixture: async () => {
        if (shouldFailLoad) {
          throw new Error('forced fixture load failure');
        }

        return fixture;
      },
    });

    const firstResponse = await postReset(testServer, resetBody({
      expectedActiveRevision: 0,
      idempotencyKey: 'reset-before-load-failure',
    }));
    expect(firstResponse.status).toBe(200);

    shouldFailLoad = true;
    const failedResponse = await postReset(testServer, resetBody({
      expectedActiveRevision: 1,
      idempotencyKey: 'reset-load-failure',
    }));
    const failedBody = await failedResponse.json();

    expect(failedResponse.status).toBe(500);
    expect(failedBody.error.code).toBe('DEMO_RESET_FAILED');
    expect(capturedPlans).toHaveLength(1);
    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 1,
      scenarioId: 'before-loader-failure',
    });
  });
});
