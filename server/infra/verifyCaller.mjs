import { PublicationError } from '../errors.mjs';

function normalizeLogin(value) {
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR');
}

function activeDocumentData(snapshot) {
  if (!snapshot?.exists) return null;
  const data = snapshot.data() ?? {};
  return data.active === true ? data : null;
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function authorizationToken(req) {
  const raw = req.get?.('authorization') ?? req.headers?.authorization;
  if (typeof raw !== 'string') return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function createVerifyCallerMiddleware({ getFirebaseAdmin, config }) {
  return async function verifyCaller(req, res, next) {
    try {
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

      const [linkSnapshot, adminSnapshot] = await Promise.all([
        admin.db.collection('user_links').doc(uid).get(),
        admin.db.collection('system_admins').doc(uid).get(),
      ]);
      const linkData = activeDocumentData(linkSnapshot);
      const systemAdminData = activeDocumentData(adminSnapshot);

      if (!linkData && !systemAdminData) {
        throw new PublicationError('UNLINKED_ACCOUNT', 'Conta autenticada mas sem vínculo ativo no dashboard.');
      }

      const login = normalizeLogin(linkData?.login ?? systemAdminData?.login ?? decoded.email ?? uid);
      req.caller = {
        uid,
        login,
        role: linkData?.role === 'SCHEDULE_ADMIN' ? 'SCHEDULE_ADMIN' : 'USER',
        teamIds: stringList(linkData?.teamIds),
        isSystemAdmin: Boolean(systemAdminData),
      };
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

export function requireSystemAdmin(req) {
  if (req.caller?.isSystemAdmin) return;
  throw new PublicationError('FORBIDDEN_ROLE', 'Somente administradores do sistema podem acessar esta área.');
}
