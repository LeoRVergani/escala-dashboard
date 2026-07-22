export const DEV_SESSION_COOKIE: string;
export const DEV_SESSION_MAX_AGE_MS: number;

export interface DevSessionPayload {
  login: string;
  uid: string;
  issuedAt: number;
  expiresAt: number;
}

export function isDevLocalAuthRuntimeEnabled(config: unknown): boolean;
export function createDevSessionToken(login: string, secret: string, now?: number): string;
export function validateDevSessionToken(token: string | undefined | null, secret: string | undefined, now?: number): DevSessionPayload | null;
export function parseCookieHeader(header: string | undefined): Record<string, string>;
export function devSessionFromRequest(req: { get?: (name: string) => string | undefined; headers?: { cookie?: string } }, config: unknown): DevSessionPayload | null;
