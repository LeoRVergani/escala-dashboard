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

function packageWithTeams(teamIds: string[]) {
  return {
    ...tinyPackage(),
    teams: teamIds.map((id) => ({ id, workspaceId: 'demo-v1', publicationRevision: 0 })),
    members: [],
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

    await expect(store.reserveRevision('demo-v1', 0, 'idem-1', {
      source: 'DASHBOARD_MANUAL_PUBLISH',
    })).resolves.toMatchObject({
      outcome: 'RESERVED',
      nextRevision: 1,
      recordId: 'demo-v1_1',
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

    await store.reserveRevision('demo-v1', 0, 'idem-1', {});
    await store.activateRevision('demo-v1', 1, plan.workspaceActivationWrite.data);
    await store.reserveRevision('demo-v1', 1, 'idem-2', {});

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

  it('mantem a revisao candidata invisivel ate a promocao do ponteiro ativo', async () => {
    const store = createInMemoryPublicationStore();
    const firstPlan = buildPublicationPlan({ package: packageWithTeams(['team-active']), currentActiveRevision: 0 });
    await store.reserveRevision('demo-v1', 0, 'idem-1', {});
    await store.writeRevisionDocuments(firstPlan);
    await store.activateRevision('demo-v1', 1, firstPlan.workspaceActivationWrite.data);

    const secondPlan = buildPublicationPlan({ package: packageWithTeams(['team-candidate']), currentActiveRevision: 1 });
    await store.reserveRevision('demo-v1', 1, 'idem-2', {});
    await store.writeRevisionDocuments(secondPlan);

    await expect(store.readActiveSnapshot('demo-v1', 'teams')).resolves.toEqual([
      expect.objectContaining({ id: 'team-active', publicationRevision: 1 }),
    ]);
    await expect(store.readRevisionSnapshot('demo-v1', 2, 'teams')).resolves.toEqual([
      expect.objectContaining({ id: 'team-candidate', publicationRevision: 2 }),
    ]);
  });

  it('remove entidade ausente estruturalmente na revisao seguinte', async () => {
    const store = createInMemoryPublicationStore();
    const firstPlan = buildPublicationPlan({ package: packageWithTeams(['team-a', 'team-b']), currentActiveRevision: 0 });
    await store.reserveRevision('demo-v1', 0, 'idem-1', {});
    await store.writeRevisionDocuments(firstPlan);
    await store.activateRevision('demo-v1', 1, firstPlan.workspaceActivationWrite.data);

    const secondPlan = buildPublicationPlan({ package: packageWithTeams(['team-a']), currentActiveRevision: 1 });
    await store.reserveRevision('demo-v1', 1, 'idem-2', {});
    await store.writeRevisionDocuments(secondPlan);
    await store.activateRevision('demo-v1', 2, secondPlan.workspaceActivationWrite.data);

    await expect(store.readActiveSnapshot('demo-v1', 'teams')).resolves.toEqual([
      expect.objectContaining({ id: 'team-a', publicationRevision: 2 }),
    ]);
  });

  it('falha no segundo lote sem alterar o snapshot ativo', async () => {
    const store = createInMemoryPublicationStore({ maxBatchWrites: 2, failBatchIndexes: new Set([1]) });
    const activePlan = buildPublicationPlan({ package: packageWithTeams(['team-active']), currentActiveRevision: 0 });
    await store.reserveRevision('demo-v1', 0, 'idem-1', {});
    await store.writeRevisionDocuments(activePlan);
    await store.activateRevision('demo-v1', 1, activePlan.workspaceActivationWrite.data);

    const candidatePlan = buildPublicationPlan({
      package: packageWithTeams(['team-candidate-1', 'team-candidate-2', 'team-candidate-3']),
      currentActiveRevision: 1,
    });
    await store.reserveRevision('demo-v1', 1, 'idem-2', {});
    await expect(store.writeRevisionDocuments(candidatePlan)).rejects.toThrow('forced batch failure');
    await store.markPublicationFailed('demo-v1', 2, 'falha controlada');

    await expect(store.readActiveSnapshot('demo-v1', 'teams')).resolves.toEqual([
      expect.objectContaining({ id: 'team-active', publicationRevision: 1 }),
    ]);
    await expect(store.getWorkspaceStatus('demo-v1')).resolves.toMatchObject({
      publicationRevision: 1,
    });
  });

  it('retry idempotente de revisao ativa nao duplica documentos', async () => {
    const store = createInMemoryPublicationStore();
    const plan = buildPublicationPlan({ package: packageWithTeams(['team-a']), currentActiveRevision: 0 });
    await store.reserveRevision('demo-v1', 0, 'idem-1', {});
    await store.writeRevisionDocuments(plan);
    await store.activateRevision('demo-v1', 1, plan.workspaceActivationWrite.data);

    await expect(store.reserveRevision('demo-v1', 1, 'idem-1', {})).resolves.toMatchObject({
      outcome: 'ALREADY_ACTIVE',
      record: {
        publicationRevision: 1,
      },
    });
    await expect(store.readRevisionSnapshot('demo-v1', 1, 'teams')).resolves.toHaveLength(1);
  });

  it('retry com a mesma idempotencyKey apos FAILED sobrescreve a candidata sem duplicar', async () => {
    const store = createInMemoryPublicationStore();
    const plan = buildPublicationPlan({ package: packageWithTeams(['team-a']), currentActiveRevision: 0 });
    await store.reserveRevision('demo-v1', 0, 'idem-retry', {});
    await store.writeRevisionDocuments(plan);
    await store.markPublicationFailed('demo-v1', 1, 'falha controlada');

    await expect(store.reserveRevision('demo-v1', 0, 'idem-retry', {})).resolves.toMatchObject({
      outcome: 'RESERVED',
      nextRevision: 1,
      recordId: 'demo-v1_1',
    });
    await store.writeRevisionDocuments(plan);
    await store.activateRevision('demo-v1', 1, plan.workspaceActivationWrite.data);

    await expect(store.readActiveSnapshot('demo-v1', 'teams')).resolves.toEqual([
      expect.objectContaining({ id: 'team-a', publicationRevision: 1 }),
    ]);
  });
});
