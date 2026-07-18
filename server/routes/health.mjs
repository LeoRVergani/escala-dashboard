import { Router } from 'express';

export function createHealthRouter() {
  const router = Router();

  router.get('/', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return router;
}
