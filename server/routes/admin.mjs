import { Router } from 'express';
import { PublicationError } from '../errors.mjs';
import { docIdForLogin, normalizeLogin, stringList } from '../infra/callerIdentity.mjs';
import { createVerifyCallerMiddleware, requireSystemAdmin } from '../infra/verifyCaller.mjs';

function roleFromUserLink(data) {
  return data?.role === 'SCHEDULE_ADMIN' ? 'SCHEDULE_ADMIN' : 'USER';
}

async function collectionDocs(db, collectionName) {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() ?? {} }));
}

async function activeSystemAdminCount(db) {
  const docs = await collectionDocs(db, 'system_admins');
  return docs.filter((doc) => doc.data.active === true).length;
}

async function assertNotRemovingLastSystemAdmin(db, id, nextSystemAdminActive) {
  const current = await db.collection('system_admins').doc(id).get();
  if (!current.exists || current.data()?.active !== true || nextSystemAdminActive === true) return;
  if (await activeSystemAdminCount(db) <= 1) {
    throw new PublicationError('LAST_SYSTEM_ADMIN', 'Não é possível remover o último administrador do sistema.');
  }
}

function adminRecordFromUserDoc(id, data) {
  return {
    id,
    login: normalizeLogin(data.login ?? id),
    role: roleFromUserLink(data),
    teamIds: stringList(data.teamIds),
    active: data.active === true,
    grantedBy: typeof data.grantedBy === 'string' ? data.grantedBy : undefined,
    grantedAt: typeof data.grantedAt === 'string' ? data.grantedAt : undefined,
  };
}

export function createAdminRouter({ getFirebaseAdmin, config }) {
  const router = Router();
  const verifyCaller = createVerifyCallerMiddleware({ getFirebaseAdmin, config });

  router.use(verifyCaller);
  router.use((req, res, next) => {
    try {
      requireSystemAdmin(req);
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get('/users', async (req, res, next) => {
    try {
      const admin = getFirebaseAdmin(config);
      if (!admin?.configured || !admin.db) {
        throw new PublicationError('FIREBASE_ADMIN_NOT_CONFIGURED', 'Firebase Admin não está configurado.');
      }

      const [userDocs, systemDocs] = await Promise.all([
        collectionDocs(admin.db, 'user_links'),
        collectionDocs(admin.db, 'system_admins'),
      ]);
      const combined = new Map(userDocs.map((doc) => [doc.id, adminRecordFromUserDoc(doc.id, doc.data)]));

      for (const doc of systemDocs) {
        const previous = combined.get(doc.id);
        combined.set(doc.id, {
          id: doc.id,
          login: normalizeLogin(doc.data.login ?? previous?.login ?? doc.id),
          role: 'SYSTEM_ADMIN',
          teamIds: previous?.teamIds ?? [],
          active: doc.data.active === true,
          grantedBy: typeof doc.data.grantedBy === 'string' ? doc.data.grantedBy : previous?.grantedBy,
          grantedAt: typeof doc.data.grantedAt === 'string' ? doc.data.grantedAt : previous?.grantedAt,
        });
      }

      res.status(200).json({
        users: [...combined.values()].sort((a, b) => a.login.localeCompare(b.login, 'pt-BR')),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/users', async (req, res, next) => {
    try {
      const admin = getFirebaseAdmin(config);
      if (!admin?.configured || !admin.db) {
        throw new PublicationError('FIREBASE_ADMIN_NOT_CONFIGURED', 'Firebase Admin não está configurado.');
      }

      const login = normalizeLogin(req.body?.login);
      const role = req.body?.role;
      if (!login || (role !== 'SCHEDULE_ADMIN' && role !== 'SYSTEM_ADMIN')) {
        throw new PublicationError('INVALID_PACKAGE', 'Informe login e papel administrativo válidos.');
      }

      const id = docIdForLogin(login);
      const active = req.body?.active !== false;
      const grantedAt = new Date().toISOString();
      const audit = { grantedBy: req.caller.login, grantedAt };

      if (role === 'SYSTEM_ADMIN') {
        await admin.db.collection('user_links').doc(id).set({
          firebaseUid: id,
          login,
          active,
          role: 'USER',
          teamIds: stringList(req.body?.teamIds),
          ...audit,
        }, { merge: true });
        await admin.db.collection('system_admins').doc(id).set({ login, active, ...audit }, { merge: true });
      } else {
        await assertNotRemovingLastSystemAdmin(admin.db, id, false);
        await admin.db.collection('user_links').doc(id).set({
          firebaseUid: id,
          login,
          active,
          role: 'SCHEDULE_ADMIN',
          teamIds: stringList(req.body?.teamIds),
          ...audit,
        }, { merge: true });
        await admin.db.collection('system_admins').doc(id).set({ login, active: false, ...audit }, { merge: true });
      }

      res.status(200).json({ id, login, role, active, teamIds: stringList(req.body?.teamIds), ...audit });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/users/:id', async (req, res, next) => {
    try {
      const admin = getFirebaseAdmin(config);
      if (!admin?.configured || !admin.db) {
        throw new PublicationError('FIREBASE_ADMIN_NOT_CONFIGURED', 'Firebase Admin não está configurado.');
      }

      const id = req.params.id;
      const [userSnapshot, systemSnapshot] = await Promise.all([
        admin.db.collection('user_links').doc(id).get(),
        admin.db.collection('system_admins').doc(id).get(),
      ]);
      const userData = userSnapshot.exists ? userSnapshot.data() ?? {} : {};
      const systemData = systemSnapshot.exists ? systemSnapshot.data() ?? {} : {};
      const currentRole = systemData.active === true ? 'SYSTEM_ADMIN' : roleFromUserLink(userData);
      const role = req.body?.role ?? currentRole;
      if (role !== 'SCHEDULE_ADMIN' && role !== 'SYSTEM_ADMIN') {
        throw new PublicationError('INVALID_PACKAGE', 'Papel administrativo inválido.');
      }

      const active = typeof req.body?.active === 'boolean'
        ? req.body.active
        : role === 'SYSTEM_ADMIN'
          ? systemData.active === true
          : userData.active !== false;
      const login = normalizeLogin(req.body?.login ?? userData.login ?? systemData.login ?? id);
      const teamIds = req.body?.teamIds === undefined ? stringList(userData.teamIds) : stringList(req.body.teamIds);
      const grantedAt = new Date().toISOString();
      const audit = { grantedBy: req.caller.login, grantedAt };

      await assertNotRemovingLastSystemAdmin(admin.db, id, role === 'SYSTEM_ADMIN' && active === true);

      if (role === 'SYSTEM_ADMIN') {
        await admin.db.collection('user_links').doc(id).set({
          firebaseUid: userData.firebaseUid ?? id,
          login,
          active,
          role: 'USER',
          teamIds,
          ...audit,
        }, { merge: true });
        await admin.db.collection('system_admins').doc(id).set({ login, active, ...audit }, { merge: true });
      } else {
        await admin.db.collection('user_links').doc(id).set({
          firebaseUid: userData.firebaseUid ?? id,
          login,
          active,
          role: 'SCHEDULE_ADMIN',
          teamIds,
          ...audit,
        }, { merge: true });
        await admin.db.collection('system_admins').doc(id).set({ login, active: false, ...audit }, { merge: true });
      }

      res.status(200).json({ id, login, role, active, teamIds, ...audit });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
