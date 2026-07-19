import { Router } from 'express';
import { assertDemoOnlyWritePlan } from '../domain/assertDemoOnlyWritePlan.mjs';
import { validateDemoPackage } from '../domain/demoPackageValidator.mjs';
import { buildPublicationPlan } from '../domain/demoPublicationPlanner.mjs';
import { executeAtomicPublication } from '../domain/executeAtomicPublication.mjs';
import { PublicationError } from '../errors.mjs';
import { resolvePublicationStore } from '../infra/resolvePublicationStore.mjs';

const DEMO_WORKSPACE_ID = 'demo-v1';

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
        if (config.allowDemoFirestoreWrite !== true) {
          throw new PublicationError(
            'DEMO_WRITE_DISABLED',
            'A escrita no Firestore está desabilitada (ALLOW_DEMO_FIRESTORE_WRITE não é true).',
          );
        }

        if (req.body?.confirmation !== 'PUBLISH DEMO demo-v1') {
          throw new PublicationError('INVALID_CONFIRMATION', 'Frase de confirmação ausente ou incorreta.');
        }

        const idempotencyKey = req.body?.idempotencyKey;
        if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
          throw new PublicationError('INVALID_PACKAGE', 'idempotencyKey é obrigatório para publicar.');
        }

        const resolved = resolvePublicationStore({ getFirebaseAdmin, config, store });
        if (!resolved.configured) {
          throw new PublicationError('FIREBASE_ADMIN_NOT_CONFIGURED', 'Firebase Admin não está configurado.');
        }

        const result = await executeAtomicPublication({
          store: resolved.store,
          workspaceId: DEMO_WORKSPACE_ID,
          expectedActiveRevision: req.body.expectedActiveRevision ?? 0,
          idempotencyKey,
          meta: {
            publishedByMode: 'COMMIT',
            source: 'DASHBOARD_MANUAL_PUBLISH',
            dryRun: false,
            schemaVersion: 1,
          },
          package: validation.package,
          writeFailureCode: 'FIRESTORE_WRITE_FAILED',
          writeFailureMessage: 'Não foi possível gravar os documentos da nova revisão.',
          activationFailureCode: 'PUBLICATION_ACTIVATION_FAILED',
          activationFailureMessage: 'A revisão foi preparada mas não pôde ser ativada. A revisão anterior continua ativa.',
          onFailureLog: ({ workspaceId, revision, errorMessage, errorCode }) => {
            console.error('demo_publish_commit_failed', {
              requestId: req.requestId,
              workspaceId,
              revision,
              errorMessage,
              errorCode,
            });
          },
        });

        if (result.outcome === 'ALREADY_ACTIVE') {
          const { record } = result;
          res.status(200).json({
            status: 'PUBLISHED',
            workspaceId: DEMO_WORKSPACE_ID,
            publicationRevision: record.publicationRevision,
            counts: record.counts,
            publishedAt: record.publishedAt,
            idempotencyKey: record.idempotencyKey,
          });
          return;
        }

        res.status(200).json({
          status: 'PUBLISHED',
          workspaceId: DEMO_WORKSPACE_ID,
          publicationRevision: result.nextRevision,
          counts: result.counts,
          publishedAt: result.publishedAt,
          idempotencyKey,
        });
        return;
      }

      const resolved = resolvePublicationStore({ getFirebaseAdmin, config, store });
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
