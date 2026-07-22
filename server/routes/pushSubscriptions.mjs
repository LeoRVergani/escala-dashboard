import { Router } from 'express';
import { PublicationError } from '../errors.mjs';
import { normalizeLogin } from '../infra/callerIdentity.mjs';
import { createVerifyCallerMiddleware } from '../infra/verifyCaller.mjs';
import {
  PUSH_SUBSCRIPTIONS_COLLECTION,
  endpointFingerprint,
  publicPushSubscriptionRecord,
  pushSubscriptionId,
  tokenFingerprint,
} from '../domain/pushSubscriptionModel.mjs';

const PLATFORMS = new Set(['android', 'web']);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireFirebaseAdmin(getFirebaseAdmin, config) {
  const admin = getFirebaseAdmin(config);
  if (!admin?.configured || !admin.db) {
    throw new PublicationError('FIREBASE_ADMIN_NOT_CONFIGURED', 'Firebase Admin não está configurado.');
  }
  return admin;
}

function normalizePlatform(value) {
  if (typeof value !== 'string' || !PLATFORMS.has(value)) {
    throw new PublicationError('INVALID_PACKAGE', 'Plataforma de push inválida. Use android ou web.');
  }
  return value;
}

function normalizeToken(platform, value) {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();

  // Web Push pode enviar o PushSubscription JSON completo. Android usa token FCM em string.
  if (platform === 'web' && isPlainObject(value)) return value;

  throw new PublicationError('INVALID_PACKAGE', 'Token de push ausente ou inválido.');
}

function normalizeEndpoint(value, token) {
  const endpoint = typeof value === 'string'
    ? value.trim()
    : isPlainObject(token) && typeof token.endpoint === 'string'
      ? token.endpoint.trim()
      : '';
  return endpoint || undefined;
}

function canRevokeSubscription(caller, data) {
  return caller?.isSystemAdmin
    || normalizeLogin(data.memberId) === caller?.login
    || (typeof data.uid === 'string' && data.uid === caller?.uid);
}

export function createPushSubscriptionsRouter({ getFirebaseAdmin, config }) {
  const router = Router();
  const verifyCaller = createVerifyCallerMiddleware({ getFirebaseAdmin, config });

  router.use(verifyCaller);

  router.post('/', async (req, res, next) => {
    try {
      const admin = requireFirebaseAdmin(getFirebaseAdmin, config);
      const platform = normalizePlatform(req.body?.platform);
      const token = normalizeToken(platform, req.body?.token);
      const endpoint = normalizeEndpoint(req.body?.endpoint, token);
      const memberId = req.caller.login;
      const uid = req.caller.uid;
      const id = pushSubscriptionId({ memberId, platform, token });
      const now = new Date().toISOString();
      const ref = admin.db.collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(id);
      const existing = await ref.get();
      const existingData = existing.exists ? existing.data() ?? {} : {};
      const createdAt = typeof existingData.createdAt === 'string' ? existingData.createdAt : now;
      const nextData = {
        id,
        memberId,
        uid,
        platform,
        token,
        ...(endpoint ? { endpoint } : {}),
        active: true,
        createdAt,
        updatedAt: now,
        tokenFingerprint: tokenFingerprint(token),
        endpointFingerprint: endpointFingerprint(endpoint),
      };

      await ref.set(nextData, { merge: true });

      res.status(existing.exists && existingData.active === true ? 200 : 201).json(
        publicPushSubscriptionRecord(id, nextData),
      );
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const admin = requireFirebaseAdmin(getFirebaseAdmin, config);
      const id = req.params.id;
      const ref = admin.db.collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(id);
      const snapshot = await ref.get();
      if (!snapshot.exists) {
        throw new PublicationError('PUSH_SUBSCRIPTION_NOT_FOUND', 'Assinatura push não encontrada.', { httpStatus: 404 });
      }

      const data = snapshot.data() ?? {};
      if (!canRevokeSubscription(req.caller, data)) {
        throw new PublicationError('FORBIDDEN_ROLE', 'Somente o dono da assinatura ou um administrador do sistema pode revogá-la.');
      }

      const nextData = { ...data, id, active: false, updatedAt: new Date().toISOString() };
      await ref.set(nextData, { merge: true });
      res.status(200).json(publicPushSubscriptionRecord(id, nextData));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
