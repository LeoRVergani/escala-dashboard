import { Router } from 'express';
import { resolvePublicationStore } from '../infra/resolvePublicationStore.mjs';

const OFFICIAL_WORKSPACE_ID = 'ici-dev';

export function createOfficialStatusRouter({ getFirebaseAdmin, config, store }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const resolved = resolvePublicationStore({ getFirebaseAdmin, config, store });
    if (!resolved.configured) {
      res.status(200).json({
        configured: false,
        workspaceId: OFFICIAL_WORKSPACE_ID,
        status: 'FIREBASE_ADMIN_NOT_CONFIGURED',
        allowOfficialFirestoreWrite: config.allowOfficialFirestoreWrite === true,
      });
      return;
    }

    try {
      const status = await resolved.store.getWorkspaceStatus(OFFICIAL_WORKSPACE_ID);

      res.status(200).json({
        configured: true,
        workspaceId: OFFICIAL_WORKSPACE_ID,
        activePublicationRevision: status.publicationRevision,
        lastPublishedAt: status.updatedAt ?? null,
        status: status.exists ? 'ACTIVE' : 'NEVER_PUBLISHED',
        allowOfficialFirestoreWrite: config.allowOfficialFirestoreWrite === true,
      });
    } catch {
      res.status(200).json({
        configured: true,
        workspaceId: OFFICIAL_WORKSPACE_ID,
        status: 'ERROR',
        message: 'Não foi possível consultar o status da publicação oficial.',
        allowOfficialFirestoreWrite: config.allowOfficialFirestoreWrite === true,
      });
    }
  });

  return router;
}
