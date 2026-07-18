import type { RequestListener } from 'node:http';

export function createApp(config: Record<string, unknown>, overrides?: Record<string, unknown>): RequestListener;
