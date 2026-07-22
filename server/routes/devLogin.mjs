import { Router } from 'express';
import { PublicationError } from '../errors.mjs';
import { docIdForLogin, normalizeLogin, stringList } from '../infra/callerIdentity.mjs';
import {
  DEV_SESSION_COOKIE,
  DEV_SESSION_MAX_AGE_MS,
  createDevSessionToken,
  devSessionFromRequest,
} from '../infra/devSession.mjs';
import { getFirebaseAdmin as defaultGetFirebaseAdmin } from '../infra/firebaseAdmin.mjs';

function cookieBaseOptions(req) {
  let secure = false;
  try {
    secure = req.secure === true;
  } catch {
    secure = false;
  }

  return {
    httpOnly: true,
    sameSite: 'strict',
    secure,
  };
}

function cookieOptions(req) {
  return {
    ...cookieBaseOptions(req),
    maxAge: DEV_SESSION_MAX_AGE_MS,
  };
}

async function ensureBootstrapUser({ db, login }) {
  const id = docIdForLogin(login);
  const userRef = db.collection('user_links').doc(id);
  const existing = await userRef.get();
  const existingData = existing.exists ? existing.data() ?? {} : {};
  const grantedAt = new Date().toISOString();

  await userRef.set({
    firebaseUid: existingData.firebaseUid ?? id,
    login,
    active: true,
    role: existingData.role === 'SCHEDULE_ADMIN' ? 'SCHEDULE_ADMIN' : 'USER',
    teamIds: stringList(existingData.teamIds),
    pendingRealLink: true, // A fusão com a identidade Entra real fica para a futura rota de vínculo.
    grantedBy: existingData.grantedBy ?? 'dev-local-auth',
    grantedAt: existingData.grantedAt ?? grantedAt,
  }, { merge: true });

  await db.collection('system_admins').doc(id).set({
    login,
    active: true,
    grantedBy: existingData.grantedBy ?? 'dev-local-auth',
    grantedAt: existingData.grantedAt ?? grantedAt,
  }, { merge: true });
}

export function createDevLoginRouter({ config, getFirebaseAdmin = defaultGetFirebaseAdmin }) {
  const router = Router();

  router.get('/session', (req, res) => {
    const session = devSessionFromRequest(req, config);
    res.status(200).json(session ? { enabled: true, active: true, login: session.login } : { enabled: true, active: false });
  });

  router.post('/login', async (req, res, next) => {
    try {
      const login = normalizeLogin(req.body?.login);
      if (!config.devLocalAdminLogins.includes(login)) {
        throw new PublicationError('DEV_LOGIN_NOT_ALLOWED', 'Login não autorizado para bootstrap local de desenvolvimento.');
      }
      if (!config.devSessionSecret) {
        throw new PublicationError('DEV_SESSION_NOT_CONFIGURED', 'DEV_SESSION_SECRET não está configurado.');
      }

      const admin = getFirebaseAdmin(config);
      if (!admin?.configured || !admin.db) {
        throw new PublicationError('FIREBASE_ADMIN_NOT_CONFIGURED', 'Firebase Admin não está configurado.');
      }

      await ensureBootstrapUser({ db: admin.db, login });
      const token = createDevSessionToken(login, config.devSessionSecret);
      res.cookie(DEV_SESSION_COOKIE, token, cookieOptions(req));
      res.status(200).json({ active: true, login });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(DEV_SESSION_COOKIE, cookieBaseOptions(req));
    res.status(200).json({ active: false });
  });

  return router;
}
