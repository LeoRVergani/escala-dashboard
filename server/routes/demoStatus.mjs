import { Router } from 'express';
import { createFirestorePublicationStore } from '../infra/firestorePublicationStore.mjs';

const DEMO_WORKSPACE_ID = 'demo-v1';

function createStore({ getFirebaseAdmin, config, store }) {
  if (store) {
    return { configured: true, store };
  }

  const firebaseAdmin = getFirebaseAdmin(config);
  if (!firebaseAdmin.configured) {
    return { configured: false, store: null };
  }

  return { configured: true, store: createFirestorePublicationStore(firebaseAdmin.db) };
}

export function createDemoStatusRouter({ getFirebaseAdmin, config, store }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const resolved = createStore({ getFirebaseAdmin, config, store });
    if (!resolved.configured) {
      res.status(200).json({
        configured: false,
        workspaceId: DEMO_WORKSPACE_ID,
        status: 'FIREBASE_ADMIN_NOT_CONFIGURED',
      });
      return;
    }

    try {
      const status = await resolved.store.getWorkspaceStatus(DEMO_WORKSPACE_ID);

      res.status(200).json({
        configured: true,
        workspaceId: DEMO_WORKSPACE_ID,
        activePublicationRevision: status.publicationRevision,
        lastPublishedAt: status.updatedAt ?? null,
        status: status.exists ? 'ACTIVE' : 'NEVER_PUBLISHED',
      });
    } catch {
      res.status(200).json({
        configured: true,
        workspaceId: DEMO_WORKSPACE_ID,
        status: 'ERROR',
        message: 'Não foi possível consultar o status da publicação demo.',
      });
    }
  });

  return router;
}
