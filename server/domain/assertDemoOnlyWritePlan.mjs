import { PublicationError } from '../errors.mjs';

const EXPECTED_WORKSPACE_ID = 'demo-v1';

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

export function assertDemoOnlyWritePlan(plan) {
  assertAllowed(plan.workspaceId === EXPECTED_WORKSPACE_ID, 'Somente o workspace demo-v1 pode ser publicado.');
  assertAllowed(
    Number.isInteger(plan.expectedNextRevision) && plan.expectedNextRevision > 0,
    'O plano de publicação contém uma revisão candidata inválida para demo-v1.',
  );

  for (const write of writesFromPlan(plan)) {
    assertAllowed(
      ALLOWED_COLLECTIONS.has(write.collection),
      'O plano de publicação contém uma coleção não permitida para o workspace demo-v1.',
    );

    if (write.data && Object.prototype.hasOwnProperty.call(write.data, 'workspaceId')) {
      assertAllowed(
        write.data.workspaceId === EXPECTED_WORKSPACE_ID,
        'O plano de publicação contém dados de um workspace diferente de demo-v1.',
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
        'O plano de publicação contém caminho de snapshot inválido para o workspace demo-v1.',
      );
    }

    // Defesa extra para capturar contaminação acidental por IDs de produção.
    assertAllowed(
      !String(write.id).toLowerCase().includes('ici'),
      'O plano de publicação contém um identificador incompatível com o workspace demo-v1.',
    );
    assertAllowed(
      !String(write.collectionPath ?? '').toLowerCase().includes('ici'),
      'O plano de publicação contém um caminho incompatível com o workspace demo-v1.',
    );
  }

  return true;
}
