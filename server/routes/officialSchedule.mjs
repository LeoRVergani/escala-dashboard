import { Router } from 'express';
import { ENTITY_COLLECTIONS } from '../domain/officialPublicationPlanner.mjs';
import { PublicationError } from '../errors.mjs';
import { createVerifyCallerMiddleware, requireTeamAuthorization } from '../infra/verifyCaller.mjs';
import { resolvePublicationStore } from '../infra/resolvePublicationStore.mjs';

const OFFICIAL_WORKSPACE_ID = 'ici-dev';
const COLLECTION_BY_PACKAGE_KEY = Object.fromEntries(ENTITY_COLLECTIONS);

function parseRevision(raw) {
  if (raw === undefined) return null;
  const value = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value <= 0 || String(value) !== raw.trim()) {
    throw new PublicationError('INVALID_PACKAGE', 'revision deve ser um inteiro positivo.');
  }
  return value;
}

function workspacePackage(status, revision) {
  return {
    workspaceId: OFFICIAL_WORKSPACE_ID,
    workspaceType: status.workspaceType ?? 'PRODUCTION',
    scenarioId: status.scenarioId ?? null,
    seedVersion: status.seedVersion ?? null,
    publicationRevision: revision,
    externalEffectsAllowed: false,
    notificationsEnabled: false,
  };
}

async function readCollection(store, revision, packageKey) {
  const collection = COLLECTION_BY_PACKAGE_KEY[packageKey];
  if (!collection) {
    throw new PublicationError('INVALID_PACKAGE', `Coleção oficial desconhecida: ${packageKey}.`);
  }
  return store.readRevisionSnapshot(OFFICIAL_WORKSPACE_ID, revision, collection);
}

export function createOfficialScheduleRouter({ getFirebaseAdmin, config, store }) {
  const router = Router();
  const verifyCaller = createVerifyCallerMiddleware({ getFirebaseAdmin, config });

  router.get('/', verifyCaller, async (req, res, next) => {
    try {
      const teamId = typeof req.query.teamId === 'string' ? req.query.teamId.trim() : '';
      if (!teamId) {
        throw new PublicationError('INVALID_PACKAGE', 'teamId é obrigatório.');
      }
      requireTeamAuthorization(req, teamId);

      const requestedRevision = parseRevision(req.query.revision);
      const resolved = resolvePublicationStore({ getFirebaseAdmin, config, store });
      if (!resolved.configured) {
        throw new PublicationError('FIREBASE_ADMIN_NOT_CONFIGURED', 'Firebase Admin não está configurado.');
      }
      if (typeof resolved.store.readRevisionSnapshot !== 'function') {
        throw new PublicationError('FIREBASE_ADMIN_NOT_CONFIGURED', 'Store de publicação não suporta leitura de revisão.');
      }

      const status = await resolved.store.getWorkspaceStatus(OFFICIAL_WORKSPACE_ID);
      if (!requestedRevision && (!status.exists || status.publicationRevision === 0)) {
        res.status(200).json({ status: 'EMPTY', workspaceId: OFFICIAL_WORKSPACE_ID });
        return;
      }

      const revision = requestedRevision ?? status.publicationRevision;
      const [
        teamsRaw,
        membershipsRaw,
        membersRaw,
        teamManagerAssignmentsRaw,
        scheduleChangeRequestsRaw,
        schedulePeriodsRaw,
        scheduleAssignmentsRaw,
      ] = await Promise.all([
        readCollection(resolved.store, revision, 'teams'),
        readCollection(resolved.store, revision, 'memberTeamMemberships'),
        readCollection(resolved.store, revision, 'members'),
        readCollection(resolved.store, revision, 'teamManagerAssignments'),
        readCollection(resolved.store, revision, 'scheduleChangeRequests'),
        readCollection(resolved.store, revision, 'schedulePeriods'),
        readCollection(resolved.store, revision, 'scheduleAssignments'),
      ]);

      const teams = teamsRaw.filter((item) => item.id === teamId);
      if (teams.length === 0) {
        res.status(200).json({ status: 'TEAM_NOT_FOUND', workspaceId: OFFICIAL_WORKSPACE_ID, revision });
        return;
      }

      const memberTeamMemberships = membershipsRaw.filter((item) => item.teamId === teamId);
      const memberIds = new Set(memberTeamMemberships.map((item) => item.memberId));
      const members = membersRaw.filter((item) => memberIds.has(item.id));

      res.status(200).json({
        status: 'OK',
        workspaceId: OFFICIAL_WORKSPACE_ID,
        revision,
        package: {
          schemaVersion: 1,
          workspace: workspacePackage(status, revision),
          teams,
          members,
          memberTeamMemberships,
          teamManagerAssignments: teamManagerAssignmentsRaw.filter((item) => item.teamId === teamId),
          scheduleChangeRequests: scheduleChangeRequestsRaw.filter((item) => item.requesterTeamId === teamId),
          schedulePeriods: schedulePeriodsRaw.filter((item) => item.teamId === teamId),
          scheduleAssignments: scheduleAssignmentsRaw.filter((item) => item.teamId === teamId),
          publicationRecords: [],
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
