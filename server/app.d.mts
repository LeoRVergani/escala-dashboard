import type { RequestListener } from 'node:http';

export function createApp(config: Record<string, unknown>): RequestListener;
