import type { RequestHandler } from 'express';

export interface VerifiedCaller {
  uid: string;
  login: string;
  role: 'USER' | 'SCHEDULE_ADMIN';
  teamIds: string[];
  isSystemAdmin: boolean;
}

export function createVerifyCallerMiddleware(deps: {
  getFirebaseAdmin: (config?: unknown) => unknown;
  config?: unknown;
}): RequestHandler;
export function requireTeamAuthorization(req: { caller?: VerifiedCaller }, teamId: string | null | undefined): void;
export function requireSystemAdmin(req: { caller?: VerifiedCaller }): void;
