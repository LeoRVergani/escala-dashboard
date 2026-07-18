import { Router } from 'express';

const DEMO_WORKSPACE_ID = 'demo-v1';

export function createDemoStatusRouter() {
  const router = Router();

  router.get('/', (req, res) => {
    // Future checkpoint: replace with real Firebase Admin status once initialized.
    res.status(200).json({
      configured: false,
      workspaceId: DEMO_WORKSPACE_ID,
      status: 'FIREBASE_ADMIN_NOT_CONFIGURED',
    });
  });

  return router;
}
