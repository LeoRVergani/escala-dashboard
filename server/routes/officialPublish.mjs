import { Router } from 'express';
import { assertOfficialOnlyWritePlan } from '../domain/assertOfficialOnlyWritePlan.mjs';
import { executeAtomicPublication } from '../domain/executeAtomicPublication.mjs';
import { validateOfficialCorporateLink, validateOfficialPackage } from '../domain/officialPackageValidator.mjs';
import { buildOfficialPublicationPlan } from '../domain/officialPublicationPlanner.mjs';
import { PublicationError } from '../errors.mjs';
import { resolvePublicationStore } from '../infra/resolvePublicationStore.mjs';
import {
  createVerifyCallerMiddleware,
  requirePackageTeamAuthorization,
  requireTeamAuthorization,
} from '../infra/verifyCaller.mjs';

// Workspace oficial fixado no servidor (adendo FASE 14D): o cliente nunca escolhe
// o workspace. Se o corpo da requisicao informar um workspaceId, so e aceito
// quando for exatamente este - qualquer outro valor e rejeitado, nunca usado.
const OFFICIAL_WORKSPACE_ID = 'ici-dev';
const OFFICIAL_CONFIRMATION_PHRASE = 'PUBLISH OFFICIAL ici-dev';
const ASSIGNMENT_TYPES = ['WORK_SHIFT', 'OFF', 'VACATION', 'ABSENCE', 'TRAINING', 'OTHER'];

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePackageForAuthorization(packageRaw) {
  try {
    return JSON.parse(packageRaw);
  } catch {
    throw new PublicationError('INVALID_PACKAGE', 'O pacote enviado não é um JSON válido.');
  }
}

function referencedTeamIds(pkg) {
  const teamIds = new Set();
  const add = (teamId) => {
    if (typeof teamId === 'string' && teamId.trim() !== '') {
      teamIds.add(teamId);
    }
  };

  if (Array.isArray(pkg?.teams)) {
    pkg.teams.forEach((item) => { if (isRecord(item)) add(item.id); });
  }
  if (Array.isArray(pkg?.schedulePeriods)) {
    pkg.schedulePeriods.forEach((item) => { if (isRecord(item)) add(item.teamId); });
  }
  if (Array.isArray(pkg?.scheduleAssignments)) {
    pkg.scheduleAssignments.forEach((item) => { if (isRecord(item)) add(item.teamId); });
  }

  return teamIds;
}

function periodSummary(pkg) {
  const periods = pkg.schedulePeriods
    .map((item) => ({ startDate: item.startDate ?? null, endDate: item.endDate ?? null }));

  if (periods.length === 0) return null;
  if (periods.length === 1) return periods[0];
  return periods;
}

function daysBetweenInclusive(startDate, endDate) {
  if (typeof startDate !== 'string' || typeof endDate !== 'string') return null;
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function expectedAssignmentDays(pkg) {
  const periodDays = pkg.schedulePeriods
    .map((period) => daysBetweenInclusive(period.startDate, period.endDate))
    .filter((days) => Number.isInteger(days));

  if (periodDays.length !== pkg.schedulePeriods.length) return null;
  return periodDays.reduce((total, days) => total + days, 0);
}

function dryRunDetails(pkg) {
  const assignmentCountsByType = Object.fromEntries(ASSIGNMENT_TYPES.map((type) => [type, 0]));
  const assignmentCountsByShift = {};
  const offDaysByMember = {};
  const assignmentCountsByMember = {};

  pkg.members
    .filter((member) => typeof member.id === 'string')
    .forEach((member) => {
      offDaysByMember[member.id] = 0;
      assignmentCountsByMember[member.id] = 0;
    });

  pkg.scheduleAssignments.forEach((assignment) => {
    const type = assignment.assignmentType;
    if (typeof type === 'string') {
      assignmentCountsByType[type] = (assignmentCountsByType[type] ?? 0) + 1;
    }

    if (type === 'WORK_SHIFT' && typeof assignment.shiftName === 'string' && assignment.shiftName.trim() !== '') {
      assignmentCountsByShift[assignment.shiftName] = (assignmentCountsByShift[assignment.shiftName] ?? 0) + 1;
    }

    if (typeof assignment.memberId === 'string') {
      assignmentCountsByMember[assignment.memberId] = (assignmentCountsByMember[assignment.memberId] ?? 0) + 1;
      if (type === 'OFF' || type === 'VACATION') {
        offDaysByMember[assignment.memberId] = (offDaysByMember[assignment.memberId] ?? 0) + 1;
      }
    }
  });

  const expectedDays = expectedAssignmentDays(pkg);
  const warnings = expectedDays == null ? [] : pkg.members
    .filter((member) => typeof member.id === 'string')
    .map((member) => ({
      memberId: member.id,
      assignmentCount: assignmentCountsByMember[member.id] ?? 0,
      expectedDays,
    }))
    .filter((item) => item.assignmentCount !== item.expectedDays)
    .map((item) => ({
      code: 'ASSIGNMENT_COUNT_MISMATCH',
      memberId: item.memberId,
      assignmentCount: item.assignmentCount,
      expectedDays: item.expectedDays,
      message: `Membro ${item.memberId} tem ${item.assignmentCount} atribuições para ${item.expectedDays} dias esperados no pacote.`,
    }));

  return {
    period: periodSummary(pkg),
    assignmentCountsByType,
    assignmentCountsByShift,
    offDaysByMember,
    warnings,
  };
}

export function createOfficialPublishRouter({ getFirebaseAdmin, config, store }) {
  const router = Router();
  const verifyCaller = createVerifyCallerMiddleware({ getFirebaseAdmin, config });

  router.post('/', verifyCaller, async (req, res, next) => {
    try {
      if (req.body?.workspaceId !== undefined && req.body.workspaceId !== OFFICIAL_WORKSPACE_ID) {
        throw new PublicationError('WORKSPACE_NOT_ALLOWED', 'Somente o workspace ici-dev pode ser publicado por esta rota.');
      }

      const mode = req.body?.mode;
      if (mode !== 'DRY_RUN' && mode !== 'COMMIT') {
        throw new PublicationError('INVALID_PACKAGE', 'Modo de publicação inválido. Use DRY_RUN ou COMMIT.');
      }

      if (req.body?.corporateLink?.teamId != null) {
        requireTeamAuthorization(req, req.body.corporateLink.teamId);
      }

      const packageForAuthorization = parsePackageForAuthorization(req.body?.packageRaw);
      requirePackageTeamAuthorization(req, referencedTeamIds(packageForAuthorization));

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
        ...dryRunDetails(validation.package),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
