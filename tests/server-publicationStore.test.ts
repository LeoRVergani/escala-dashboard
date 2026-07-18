import { describe, expect, it } from 'vitest';
import { buildPublicationPlan } from '../server/domain/demoPublicationPlanner.mjs';
import { createInMemoryPublicationStore } from '../server/domain/publicationStore.mjs';

function tinyPackage() {
  return {
    workspace: {
      workspaceType: 'DEMO',
      scenarioId: 'store-test',
      seedVersion: 1,
    },
    teams: [{ id: 'team-demo', workspaceId: 'demo-v1' }],
    members: [{ id: 'member-demo', workspaceId: 'demo-v1' }],
    memberTeamMemberships: [],
    teamManagerAssignments: [],
    schedulePeriods: [],
    scheduleAssignments: [],
    scheduleChangeRequests: [],
  };
}

describe('createInMemoryPublicationStore', () => {
  it('executa o ciclo completo de publicacao fake em memoria', async () => {
    const store = createInMemoryPublicationStore();
    const plan = buildPublicationPlan({ package: tinyPackage(), currentActiveRevision: null });

    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toEqual({
      exists: false,
      publicationRevision: 0,
    });

    await expect(store.reserveRevision('demo-v1', 1, {
      idempotencyKey: 'idem-1',
      source: 'DASHBOARD_MANUAL_PUBLISH',
    })).resolves.toMatchObject({
      id: 'demo-v1_1',
      workspaceId: 'demo-v1',
      publicationRevision: 1,
      idempotencyKey: 'idem-1',
      status: 'PREPARING',
    });

    await expect(store.writeRevisionDocuments(plan)).resolves.toEqual({
      countsCreated: 2,
      countsUpdated: 0,
    });

    await expect(store.activateRevision(
      'demo-v1',
      1,
      plan.workspaceActivationWrite.data,
    )).resolves.toMatchObject({
      id: 'demo-v1_1',
      workspaceId: 'demo-v1',
      publicationRevision: 1,
      idempotencyKey: 'idem-1',
      status: 'ACTIVE',
    });

    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 1,
      workspaceType: 'DEMO',
      scenarioId: 'store-test',
      seedVersion: 1,
    });

    await expect(store.findByIdempotencyKey('demo-v1', 'idem-1')).resolves.toMatchObject({
      id: 'demo-v1_1',
      status: 'ACTIVE',
    });
  });

  it('marca falha sem alterar a revisao ativa do workspace', async () => {
    const store = createInMemoryPublicationStore();
    const plan = buildPublicationPlan({ package: tinyPackage(), currentActiveRevision: null });

    await store.reserveRevision('demo-v1', 1, { idempotencyKey: 'idem-1' });
    await store.activateRevision('demo-v1', 1, plan.workspaceActivationWrite.data);
    await store.reserveRevision('demo-v1', 2, { idempotencyKey: 'idem-2' });

    await expect(store.markPublicationFailed('demo-v1', 2, 'falha controlada')).resolves.toMatchObject({
      id: 'demo-v1_2',
      status: 'FAILED',
      failureReason: 'falha controlada',
    });

    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toMatchObject({
      exists: true,
      publicationRevision: 1,
    });
  });
});
