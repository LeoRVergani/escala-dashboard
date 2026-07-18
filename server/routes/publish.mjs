import { Router } from 'express';
import { assertDemoOnlyWritePlan } from '../domain/assertDemoOnlyWritePlan.mjs';
import { validateDemoPackage } from '../domain/demoPackageValidator.mjs';
import { buildPublicationPlan } from '../domain/demoPublicationPlanner.mjs';
import { PublicationError } from '../errors.mjs';
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

export function createPublishRouter({ getFirebaseAdmin, config, store }) {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      if (req.body?.workspaceId !== DEMO_WORKSPACE_ID) {
        throw new PublicationError('WORKSPACE_NOT_ALLOWED', 'Somente o workspace demo-v1 pode ser publicado.');
      }

      const mode = req.body?.mode;
      if (mode !== 'DRY_RUN' && mode !== 'COMMIT') {
        throw new PublicationError('INVALID_PACKAGE', 'Modo de publicação inválido. Use DRY_RUN ou COMMIT.');
      }

      const validation = validateDemoPackage({
        packageRaw: req.body.packageRaw,
        manifestRaw: req.body.manifestRaw,
      });

      if (!validation.ok) {
        throw new PublicationError(validation.code, validation.message);
      }

      if (mode === 'COMMIT') {
        // TODO checkpoint 4
        throw new PublicationError('API_UNAVAILABLE', 'Modo COMMIT ainda não implementado nesta etapa - use DRY_RUN.');
      }

      const resolved = createStore({ getFirebaseAdmin, config, store });
      if (!resolved.configured) {
        throw new PublicationError('FIREBASE_ADMIN_NOT_CONFIGURED', 'Firebase Admin não está configurado.');
      }

      const status = await resolved.store.getWorkspaceStatus(DEMO_WORKSPACE_ID);
      const expectedActiveRevision = req.body.expectedActiveRevision ?? 0;
      if (expectedActiveRevision !== status.publicationRevision) {
        throw new PublicationError(
          'PUBLICATION_REVISION_CONFLICT',
          `Revisão ativa esperada ${expectedActiveRevision}, mas a revisão real é ${status.publicationRevision}.`,
          {
            details: {
              expectedActiveRevision,
              actualActiveRevision: status.publicationRevision,
            },
          },
        );
      }

      const plan = buildPublicationPlan({
        package: validation.package,
        currentActiveRevision: status.publicationRevision,
      });
      assertDemoOnlyWritePlan(plan);

      res.status(200).json({
        status: 'VALIDATED',
        workspaceId: DEMO_WORKSPACE_ID,
        currentActiveRevision: status.publicationRevision,
        nextPublicationRevision: plan.expectedNextRevision,
        counts: plan.counts,
        changes: { entityCounts: plan.counts },
        checksumStatus: 'MATCH',
        writesPerformed: 0,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
