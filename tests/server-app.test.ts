import { EventEmitter } from 'node:events';
import http, { type Server } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.mjs';
import { loadConfig } from '../server/config.mjs';

type TestServer = {
  app: ReturnType<typeof createApp>;
  baseUrl: string;
  close: () => Promise<void>;
};

let currentServer: TestServer | undefined;

async function startTestServer(configOverrides: Record<string, unknown> = {}): Promise<TestServer> {
  const config = { ...loadConfig({}), ...configOverrides };
  const app = createApp(config);
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

afterEach(async () => {
  await closeCurrentServer();
});

describe('server app', () => {
  it('retorna health check ok', async () => {
    const testServer = await startTestServer();

    const response = await appFetch(testServer, '/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('retorna status demo ainda nao configurado', async () => {
    const testServer = await startTestServer();

    const response = await appFetch(testServer, '/api/demo/status');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      configured: false,
      workspaceId: 'demo-v1',
      status: 'FIREBASE_ADMIN_NOT_CONFIGURED',
    });
  });

  it('habilita CORS para origem permitida exata', async () => {
    const allowedOrigin = 'http://127.0.0.1:5173';
    const testServer = await startTestServer({ allowedOrigins: [allowedOrigin] });

    const response = await appFetch(testServer, '/api/health', {
      headers: { Origin: allowedOrigin },
    });

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigin);
  });

  it('nao habilita CORS para origem nao permitida', async () => {
    const testServer = await startTestServer({
      allowedOrigins: ['http://127.0.0.1:5173'],
    });

    const response = await appFetch(testServer, '/api/health', {
      headers: { Origin: 'http://evil.example.test' },
    });

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rejeita corpo JSON acima do limite configurado', async () => {
    const testServer = await startTestServer({ maxJsonBodyBytes: 100 });
    const largeBody = JSON.stringify({ payload: 'x'.repeat(200) });

    const response = await appFetch(testServer, '/api/rota-que-nao-existe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: largeBody,
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it('retorna JSON para rota desconhecida', async () => {
    const testServer = await startTestServer();

    const response = await appFetch(testServer, '/api/rota-que-nao-existe');
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(body.error.code).toBe('API_UNAVAILABLE');
    expect(body.error.requestId).toEqual(expect.any(String));
  });
});
