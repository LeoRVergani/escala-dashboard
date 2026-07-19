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

let currentServer: TestServer | undefined;

function basePackage(): DemoPackage {
  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: 'demo-v1',
      workspaceType: 'DEMO',
      scenarioId: 'publish-dryrun-test',
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
    mode: 'DRY_RUN',
    expectedActiveRevision: 0,
    localDraftRevision: 1,
    idempotencyKey: 'idem-test',
    confirmation: '',
    packageRaw,
    manifestRaw: manifestFor(packageRaw),
    ...overrides,
  };
}

async function startTestServer(store: InMemoryPublicationStore): Promise<TestServer> {
  const config = loadConfig({});
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

afterEach(async () => {
  await closeCurrentServer();
});

describe('POST /api/publish DRY_RUN', () => {
  it('rejeita workspaceId diferente antes de validar o pacote', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const response = await postPublish(testServer, { workspaceId: 'ici' });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
  });

  it('rejeita pacote com checksum errado', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);
    const requestBody = publishBody();

    const response = await postPublish(testServer, {
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
    pkg.members[0].workspaceId = 'ici';
    const packageRaw = JSON.stringify(pkg);

    const response = await postPublish(testServer, publishBody({
      packageRaw,
      manifestRaw: manifestFor(packageRaw),
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('WORKSPACE_NOT_ALLOWED');
  });

  it('rejeita DRY_RUN com expectedActiveRevision divergente da revisao real', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const response = await postPublish(testServer, publishBody({ expectedActiveRevision: 1 }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('PUBLICATION_REVISION_CONFLICT');
    expect(body.error.details).toEqual({
      expectedActiveRevision: 1,
      actualActiveRevision: 0,
    });
  });

  it('valida DRY_RUN sem escrever dados no store', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const response = await postPublish(testServer, publishBody({ expectedActiveRevision: 0 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'VALIDATED',
      workspaceId: 'demo-v1',
      currentActiveRevision: 0,
      nextPublicationRevision: 1,
      writesPerformed: 0,
      checksumStatus: 'MATCH',
    });
    expect(body.counts.total).toBe(8);
    expect(body.changes.entityCounts).toEqual(body.counts);
    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toEqual({
      exists: false,
      publicationRevision: 0,
    });
  });

  it('bloqueia mode COMMIT quando a escrita demo nao esta habilitada', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const response = await postPublish(testServer, publishBody({ mode: 'COMMIT' }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('DEMO_WRITE_DISABLED');
  });

  it('rejeita mode invalido ou ausente', async () => {
    const store = createInMemoryPublicationStore();
    const testServer = await startTestServer(store);

    const invalidModeResponse = await postPublish(testServer, publishBody({ mode: 'INVALID' }));
    const invalidModeBody = await invalidModeResponse.json();

    expect(invalidModeResponse.status).toBe(400);
    expect(invalidModeBody.error.code).toBe('INVALID_PACKAGE');

    const missingModeResponse = await postPublish(testServer, publishBody({ mode: undefined }));
    const missingModeBody = await missingModeResponse.json();

    expect(missingModeResponse.status).toBe(400);
    expect(missingModeBody.error.code).toBe('INVALID_PACKAGE');
  });
});
