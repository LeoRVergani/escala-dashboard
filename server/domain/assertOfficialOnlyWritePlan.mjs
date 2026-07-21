import { PublicationError } from '../errors.mjs';

// Espelha assertDemoOnlyWritePlan.mjs, mas para o workspace oficial ici-dev.
// Existe como guarda separada e explicita de proposito (adendo FASE 14D): a guarda
// do Demo nao deve ser enfraquecida para aceitar outros workspaces, e a guarda
// oficial nao deve aceitar nada alem de ici-dev.
const EXPECTED_WORKSPACE_ID = 'ici-dev';

const ALLOWED_COLLECTIONS = new Set([
  'teams',
  'members',
  'member_team_memberships',
  'team_manager_assignments',
  'schedule_periods',
  'schedule_assignments',
  'schedule_change_requests',
  'workspaces',
  'publication_records',
]);

const ENTITY_COLLECTIONS = new Set([
  'teams',
  'members',
  'member_team_memberships',
  'team_manager_assignments',
  'schedule_periods',
  'schedule_assignments',
  'schedule_change_requests',
]);

function assertAllowed(condition, message) {
  if (!condition) {
    throw new PublicationError('WORKSPACE_NOT_ALLOWED', message);
  }
}

function writesFromPlan(plan) {
  return [
    ...(Array.isArray(plan.entityWrites) ? plan.entityWrites : []),
    plan.workspaceActivationWrite,
    plan.publicationRecordWrite,
  ].filter(Boolean);
}

export function assertOfficialOnlyWritePlan(plan) {
  assertAllowed(plan.workspaceId === EXPECTED_WORKSPACE_ID, 'Somente o workspace ici-dev pode ser publicado por esta rota.');
  assertAllowed(
    Number.isInteger(plan.expectedNextRevision) && plan.expectedNextRevision > 0,
    'O plano de publicação contém uma revisão candidata inválida para ici-dev.',
  );

  for (const write of writesFromPlan(plan)) {
    assertAllowed(
      ALLOWED_COLLECTIONS.has(write.collection),
      'O plano de publicação contém uma coleção não permitida para o workspace ici-dev.',
    );

    if (write.data && Object.prototype.hasOwnProperty.call(write.data, 'workspaceId')) {
      assertAllowed(
        write.data.workspaceId === EXPECTED_WORKSPACE_ID,
        'O plano de publicação contém dados de um workspace diferente de ici-dev.',
      );
    }

    if (write.data && Object.prototype.hasOwnProperty.call(write.data, 'publicationRevision')) {
      assertAllowed(
        write.data.publicationRevision === plan.expectedNextRevision,
        'O plano de publicação contém dados de uma revisão diferente da candidata.',
      );
    }

    if (ENTITY_COLLECTIONS.has(write.collection)) {
      const expectedPath = `workspaces/${EXPECTED_WORKSPACE_ID}/revisions/${plan.expectedNextRevision}/${write.collection}`;
      assertAllowed(
        write.collectionPath === expectedPath,
        'O plano de publicação contém caminho de snapshot inválido para o workspace ici-dev.',
      );
    }

    // Defesa extra para capturar contaminação acidental por dados da fixture Demo.
    assertAllowed(
      !String(write.id).toLowerCase().includes('demo'),
      'O plano de publicação contém um identificador incompatível com o workspace ici-dev.',
    );
    assertAllowed(
      !String(write.collectionPath ?? '').toLowerCase().includes('demo'),
      'O plano de publicação contém um caminho incompatível com o workspace ici-dev.',
    );
  }

  return true;
}
