import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { createApp } from '../server/app.mjs';

type App = ReturnType<typeof createApp>;

function lowerCaseHeaders(headers: HeadersInit = {}) {
  const normalized: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => { normalized[key.toLowerCase()] = value; });
  return normalized;
}

export async function dispatchExpress(app: App, path: string, init: RequestInit = {}) {
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

export async function responseJson(response: Response) {
  return { status: response.status, body: await response.json() };
}
