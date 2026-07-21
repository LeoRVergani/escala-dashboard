import { describe, expect, it } from 'vitest';
import { assertOfficialOnlyWritePlan } from '../server/domain/assertOfficialOnlyWritePlan.mjs';
import { buildOfficialPublicationPlan, type OfficialPublicationPlan } from '../server/domain/officialPublicationPlanner.mjs';
import { PublicationError } from '../server/errors.mjs';

function basePackage(): Record<string, any> {
  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: 'ici-dev',
      workspaceType: 'PRODUCTION',
      scenarioId: null,
      seedVersion: null,
      publicationRevision: 1,
      externalEffectsAllowed: false,
      notificationsEnabled: false,
    },
    teams: [{ id: 'team-ici-soc', workspaceId: 'ici-dev', schemaVersion: 1 }],
    members: [{ id: 'member-ici-analista', workspaceId: 'ici-dev', schemaVersion: 1 }],
    memberTeamMemberships: [{
      id: 'membership-ici-1',
      workspaceId: 'ici-dev',
      memberId: 'member-ici-analista',
      teamId: 'team-ici-soc',
      schemaVersion: 1,
    }],
    teamManagerAssignments: [],
    scheduleChangeRequests: [],
    schedulePeriods: [{
      id: 'period-ici-1',
      workspaceId: 'ici-dev',
      teamId: 'team-ici-soc',
      schemaVersion: 1,
    }],
    scheduleAssignments: [{
      id: 'assignment-ici-1',
      workspaceId: 'ici-dev',
      periodId: 'period-ici-1',
      teamId: 'team-ici-soc',
      memberId: 'member-ici-analista',
      schemaVersion: 1,
    }],
    publicationRecords: [],
  };
}

function readPlan(): OfficialPublicationPlan {
  return buildOfficialPublicationPlan({ package: basePackage(), currentActiveRevision: 1 });
}

function expectWorkspaceError(fn: () => unknown) {
  expect(fn).toThrow(PublicationError);
  expect(fn).toThrow(/ici-dev|workspace|coleção|identificador/i);
}

describe('assertOfficialOnlyWritePlan', () => {
  it('nao lanca para plano valido', () => {
    expect(assertOfficialOnlyWritePlan(readPlan())).toBe(true);
  });

  it('lanca quando workspaceId raiz nao e ici-dev', () => {
    const plan = { ...readPlan(), workspaceId: 'demo-v1' };

    expectWorkspaceError(() => assertOfficialOnlyWritePlan(plan));
  });

  it('lanca quando uma escrita aponta para outro workspace', () => {
    const plan = readPlan();
    plan.entityWrites[0] = {
      ...plan.entityWrites[0],
      data: { ...plan.entityWrites[0].data, workspaceId: 'demo-v1' },
    };

    expectWorkspaceError(() => assertOfficialOnlyWritePlan(plan));
  });

  it('lanca quando uma colecao nao esta na lista permitida', () => {
    const plan = readPlan();
    plan.entityWrites[0] = { ...plan.entityWrites[0], collection: 'algo_nao_permitido' };

    expectWorkspaceError(() => assertOfficialOnlyWritePlan(plan));
  });

  it('lanca quando o caminho da entidade nao esta sob a revisao candidata do ici-dev', () => {
    const plan = readPlan();
    plan.entityWrites[0] = { ...plan.entityWrites[0], collectionPath: 'teams' };

    expectWorkspaceError(() => assertOfficialOnlyWritePlan(plan));
  });

  it('lanca quando o caminho contem identificador da fixture demo', () => {
    const plan = readPlan();
    plan.entityWrites[0] = {
      ...plan.entityWrites[0],
      collectionPath: 'workspaces/ici-dev/revisions/2/teams-demo',
    };

    expectWorkspaceError(() => assertOfficialOnlyWritePlan(plan));
  });

  it('lanca quando um id contem demo em qualquer posicao', () => {
    const plan = readPlan();
    plan.entityWrites[0] = { ...plan.entityWrites[0], id: 'team-contaminado-DEMO-v1' };

    expectWorkspaceError(() => assertOfficialOnlyWritePlan(plan));
  });

  it('confirma que nenhuma escrita de entidade usa colecao viva fora da revisao candidata', () => {
    const plan = readPlan();

    expect(plan.entityWrites.every((write) => (
      write.collectionPath?.startsWith(`workspaces/ici-dev/revisions/${plan.expectedNextRevision}/`)
    ))).toBe(true);
  });
});
