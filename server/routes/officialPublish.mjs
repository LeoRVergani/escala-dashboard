import { Router } from 'express';
import { assertOfficialOnlyWritePlan } from '../domain/assertOfficialOnlyWritePlan.mjs';
import { executeAtomicPublication } from '../domain/executeAtomicPublication.mjs';
import { validateOfficialCorporateLink, validateOfficialPackage } from '../domain/officialPackageValidator.mjs';
import { buildOfficialPublicationPlan } from '../domain/officialPublicationPlanner.mjs';
import { PublicationError } from '../errors.mjs';
import { resolvePublicationStore } from '../infra/resolvePublicationStore.mjs';

// Workspace oficial fixado no servidor (adendo FASE 14D): o cliente nunca escolhe
// o workspace. Se o corpo da requisicao informar um workspaceId, so e aceito
// quando for exatamente este - qualquer outro valor e rejeitado, nunca usado.
const OFFICIAL_WORKSPACE_ID = 'ici-dev';
const OFFICIAL_CONFIRMATION_PHRASE = 'PUBLISH OFFICIAL ici-dev';

export function createOfficialPublishRouter({ getFirebaseAdmin, config, store }) {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      if (req.body?.workspaceId !== undefined && req.body.workspaceId !== OFFICIAL_WORKSPACE_ID) {
        throw new PublicationError('WORKSPACE_NOT_ALLOWED', 'Somente o workspace ici-dev pode ser publicado por esta rota.');
      }

      const mode = req.body?.mode;
      if (mode !== 'DRY_RUN' && mode !== 'COMMIT') {
        throw new PublicationError('INVALID_PACKAGE', 'Modo de publicação inválido. Use DRY_RUN ou COMMIT.');
      }

      const validation = validateOfficialPackage({
        packageRaw: req.body.packageRaw,
        manifestRaw: req.body.manifestRaw,
      });

      if (!validation.ok) {
        throw new PublicationError(validation.code, validation.message);
      }

      const corporateLinkValidation = validateOfficialCorporateLink(validation.package, req.body.corporateLink);
      if (!corporateLinkValidation.ok) {
        throw new PublicationError(corporateLinkValidation.code, corporateLinkValidation.message);
      }

      if (mode === 'COMMIT') {
        if (config.allowOfficialFirestoreWrite !== true) {
          throw new PublicationError(
            'OFFICIAL_WRITE_DISABLED',
            'Publicação oficial desabilitada neste ambiente (ALLOW_OFFICIAL_FIRESTORE_WRITE não é true).',
          );
        }

        if (req.body?.confirmation !== OFFICIAL_CONFIRMATION_PHRASE) {
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
          workspaceId: OFFICIAL_WORKSPACE_ID,
          expectedActiveRevision: req.body.expectedActiveRevision ?? 0,
          idempotencyKey,
          buildPlan: buildOfficialPublicationPlan,
          assertPlan: assertOfficialOnlyWritePlan,
          meta: {
            publishedByMode: 'COMMIT',
            source: 'DASHBOARD_OFFICIAL_PUBLISH',
            dryRun: false,
            schemaVersion: 1,
            corporateLinkMemberId: req.body.corporateLink?.memberId,
            corporateLinkTeamId: req.body.corporateLink?.teamId,
          },
          package: validation.package,
          writeFailureCode: 'FIRESTORE_WRITE_FAILED',
          writeFailureMessage: 'Não foi possível gravar os documentos da nova revisão.',
          activationFailureCode: 'PUBLICATION_ACTIVATION_FAILED',
          activationFailureMessage: 'A revisão foi preparada mas não pôde ser ativada. A revisão anterior continua ativa.',
          onFailureLog: ({ workspaceId, revision, errorMessage, errorCode }) => {
            console.error('official_publish_commit_failed', {
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
            workspaceId: OFFICIAL_WORKSPACE_ID,
            publicationRevision: record.publicationRevision,
            counts: record.counts,
            publishedAt: record.publishedAt,
            idempotencyKey: record.idempotencyKey,
          });
          return;
        }

        res.status(200).json({
          status: 'PUBLISHED',
          workspaceId: OFFICIAL_WORKSPACE_ID,
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

      const status = await resolved.store.getWorkspaceStatus(OFFICIAL_WORKSPACE_ID);
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

      const plan = buildOfficialPublicationPlan({
        package: validation.package,
        currentActiveRevision: status.publicationRevision,
      });
      assertOfficialOnlyWritePlan(plan);

      res.status(200).json({
        status: 'VALIDATED',
        workspaceId: OFFICIAL_WORKSPACE_ID,
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
