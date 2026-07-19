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

        const resolved = createStore({ getFirebaseAdmin, config, store });
        if (!resolved.configured) {
          throw new PublicationError('FIREBASE_ADMIN_NOT_CONFIGURED', 'Firebase Admin não está configurado.');
        }

        const reservation = await resolved.store.reserveRevision(
          DEMO_WORKSPACE_ID,
          req.body.expectedActiveRevision ?? 0,
          idempotencyKey,
          {
            publishedByMode: 'COMMIT',
            source: 'DASHBOARD_MANUAL_PUBLISH',
            dryRun: false,
            schemaVersion: 1,
          },
        );

        if (reservation.outcome === 'ALREADY_ACTIVE') {
          const { record } = reservation;
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

        const { nextRevision } = reservation;

        const plan = buildPublicationPlan({
          package: validation.package,
          currentActiveRevision: nextRevision - 1,
        });
        assertDemoOnlyWritePlan(plan);

        let writeCounts;
        try {
          writeCounts = await resolved.store.writeRevisionDocuments(plan);
        } catch (err) {
          console.error('demo_publish_commit_failed', {
            requestId: req.requestId,
            workspaceId: DEMO_WORKSPACE_ID,
            revision: nextRevision,
            errorMessage: err?.message,
            errorCode: err?.code,
          });
          await resolved.store.markPublicationFailed(
            DEMO_WORKSPACE_ID,
            nextRevision,
            'Falha ao gravar documentos da revisão.',
          );
          throw new PublicationError(
            'FIRESTORE_WRITE_FAILED',
            'Não foi possível gravar os documentos da nova revisão.',
          );
        }

        let activated;
        try {
          activated = await resolved.store.activateRevision(
            DEMO_WORKSPACE_ID,
            nextRevision,
            plan.workspaceActivationWrite.data,
            writeCounts,
          );
        } catch (err) {
          console.error('demo_publish_commit_failed', {
            requestId: req.requestId,
            workspaceId: DEMO_WORKSPACE_ID,
            revision: nextRevision,
            errorMessage: err?.message,
            errorCode: err?.code,
          });
          await resolved.store.markPublicationFailed(
            DEMO_WORKSPACE_ID,
            nextRevision,
            'Falha ao ativar a nova revisão.',
          );
          throw new PublicationError(
            'PUBLICATION_ACTIVATION_FAILED',
            'A revisão foi preparada mas não pôde ser ativada. A revisão anterior continua ativa.',
          );
        }

        res.status(200).json({
          status: 'PUBLISHED',
          workspaceId: DEMO_WORKSPACE_ID,
          publicationRevision: nextRevision,
          counts: writeCounts,
          publishedAt: activated.publishedAt,
          idempotencyKey,
        });
        return;
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
