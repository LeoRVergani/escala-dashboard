// Espelha demoPublicationPlanner.mjs, mas fixo no workspace oficial ici-dev.
// O workspace nunca vem de parametro/cliente - e sempre esta constante, para que
// nenhuma rota possa ser enganada a publicar em outro lugar (ver adendo FASE 14D).
const WORKSPACE_ID = 'ici-dev';

const ENTITY_COLLECTIONS = [
  ['teams', 'teams'],
  ['members', 'members'],
  ['memberTeamMemberships', 'member_team_memberships'],
  ['teamManagerAssignments', 'team_manager_assignments'],
  ['schedulePeriods', 'schedule_periods'],
  ['scheduleAssignments', 'schedule_assignments'],
  ['scheduleChangeRequests', 'schedule_change_requests'],
];

function nextRevisionFrom(currentActiveRevision) {
  return Number.isInteger(currentActiveRevision) && currentActiveRevision > 0
    ? currentActiveRevision + 1
    : 1;
}

function revisionCollectionPath(revision, collection) {
  return `workspaces/${WORKSPACE_ID}/revisions/${revision}/${collection}`;
}

export function buildOfficialPublicationPlan({ package: pkg, currentActiveRevision }) {
  const expectedNextRevision = nextRevisionFrom(currentActiveRevision);
  const entityWrites = ENTITY_COLLECTIONS.flatMap(([packageKey, collection]) => (
    pkg[packageKey].map((item) => ({
      collection,
      collectionPath: revisionCollectionPath(expectedNextRevision, collection),
      id: item.id,
      data: {
        ...item,
        workspaceId: WORKSPACE_ID,
        publicationRevision: expectedNextRevision,
      },
    }))
  ));

  const counts = {
    teams: pkg.teams.length,
    members: pkg.members.length,
    memberTeamMemberships: pkg.memberTeamMemberships.length,
    teamManagerAssignments: pkg.teamManagerAssignments.length,
    schedulePeriods: pkg.schedulePeriods.length,
    scheduleAssignments: pkg.scheduleAssignments.length,
    scheduleChangeRequests: pkg.scheduleChangeRequests.length,
    total: entityWrites.length,
  };

  const publicationRecordId = `${WORKSPACE_ID}_${expectedNextRevision}`;

  return {
    workspaceId: WORKSPACE_ID,
    expectedNextRevision,
    entityWrites,
    workspaceActivationWrite: {
      collection: 'workspaces',
      id: WORKSPACE_ID,
      data: {
        workspaceId: WORKSPACE_ID,
        workspaceType: pkg.workspace.workspaceType,
        scenarioId: pkg.workspace.scenarioId,
        seedVersion: pkg.workspace.seedVersion,
        publicationRevision: expectedNextRevision,
        externalEffectsAllowed: false,
        notificationsEnabled: false,
        // updatedAt deve ser preenchido pelo Firestore Admin no momento da escrita real.
      },
    },
    publicationRecordWrite: {
      collection: 'publication_records',
      id: publicationRecordId,
      data: {
        id: publicationRecordId,
        workspaceId: WORKSPACE_ID,
        publicationRevision: expectedNextRevision,
        dryRun: false,
        countsCreated: entityWrites.length,
        countsUpdated: 0,
        countsDeleted: 0,
        source: 'DASHBOARD_OFFICIAL_PUBLISH',
        schemaVersion: 1,
      },
    },
    counts,
  };
}
