import { PublicationError } from '../errors.mjs';
import { resolveCallerFromDb } from './callerIdentity.mjs';
import { devSessionFromRequest, isDevLocalAuthRuntimeEnabled } from './devSession.mjs';

function authorizationToken(req) {
  const raw = req.get?.('authorization') ?? req.headers?.authorization;
  if (typeof raw !== 'string') return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function createVerifyCallerMiddleware({ getFirebaseAdmin, config }) {
  return async function verifyCaller(req, res, next) {
    try {
      if (isDevLocalAuthRuntimeEnabled(config)) {
        const devSession = devSessionFromRequest(req, config);
        if (devSession) {
          const admin = getFirebaseAdmin(config);
          if (!admin?.configured || !admin.db) {
            throw new PublicationError('FIREBASE_ADMIN_NOT_CONFIGURED', 'Firebase Admin não está configurado.');
          }

          req.caller = await resolveCallerFromDb(admin.db, {
            uid: devSession.uid,
            fallbackLogin: devSession.login,
            isDevSession: true,
          });
          next();
          return;
        }
      }

      const idToken = authorizationToken(req);
      if (!idToken) {
        throw new PublicationError('UNAUTHENTICATED', 'Token de autenticação ausente ou inválido.');
      }

      const admin = getFirebaseAdmin(config);
      if (!admin?.configured || !admin.db || !admin.auth) {
        throw new PublicationError('FIREBASE_ADMIN_NOT_CONFIGURED', 'Firebase Admin não está configurado.');
      }

      let decoded;
      try {
        decoded = await admin.auth.verifyIdToken(idToken);
      } catch {
        throw new PublicationError('UNAUTHENTICATED', 'Token de autenticação ausente ou inválido.');
      }

      const uid = decoded?.uid;
      if (typeof uid !== 'string' || uid.trim() === '') {
        throw new PublicationError('UNAUTHENTICATED', 'Token de autenticação ausente ou inválido.');
      }

      req.caller = await resolveCallerFromDb(admin.db, {
        uid,
        fallbackLogin: decoded.email,
      });
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireTeamAuthorization(req, teamId) {
  const caller = req.caller;
  if (caller?.isSystemAdmin) return;
  if (caller?.role !== 'SCHEDULE_ADMIN') {
    throw new PublicationError('FORBIDDEN_ROLE', 'Conta sem papel administrativo para publicar escala oficial.');
  }
  if (!teamId || !caller.teamIds?.includes(teamId)) {
    throw new PublicationError('FORBIDDEN_TEAM', 'Conta sem permissão para administrar este time.');
  }
}

export function requirePackageTeamAuthorization(req, teamIds) {
  const caller = req.caller;
  if (caller?.isSystemAdmin) return;
  if (caller?.role !== 'SCHEDULE_ADMIN') {
    throw new PublicationError('FORBIDDEN_ROLE', 'Conta sem papel administrativo para publicar escala oficial.');
  }

  const allowedTeamIds = new Set(caller.teamIds ?? []);
  const forbiddenTeamId = [...teamIds].find((teamId) => !allowedTeamIds.has(teamId));
  if (forbiddenTeamId) {
    throw new PublicationError(
      'FORBIDDEN_TEAM_IN_PACKAGE',
      `Conta sem permissão para publicar dados do time ${forbiddenTeamId}.`,
      { details: { teamId: forbiddenTeamId } },
    );
  }
}

export function requireSystemAdmin(req) {
  if (req.caller?.isSystemAdmin) return;
  throw new PublicationError('FORBIDDEN_ROLE', 'Somente administradores do sistema podem acessar esta área.');
}
