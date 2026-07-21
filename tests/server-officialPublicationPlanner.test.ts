import { describe, expect, it } from 'vitest';
import { buildOfficialPublicationPlan } from '../server/domain/officialPublicationPlanner.mjs';

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
    members: [
      { id: 'member-ici-lvergani', workspaceId: 'ici-dev', schemaVersion: 1 },
      { id: 'member-ici-analista', workspaceId: 'ici-dev', schemaVersion: 1 },
    ],
    memberTeamMemberships: [{
      id: 'membership-ici-1',
      workspaceId: 'ici-dev',
      memberId: 'member-ici-analista',
      teamId: 'team-ici-soc',
      schemaVersion: 1,
    }],
    teamManagerAssignments: [{
      id: 'manager-ici-1',
      workspaceId: 'ici-dev',
      managerMemberId: 'member-ici-lvergani',
      teamId: 'team-ici-soc',
      schemaVersion: 1,
    }],
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

describe('buildOfficialPublicationPlan', () => {
  it('usa revisao 1 quando nunca houve publicacao', () => {
    const pkg = basePackage();

    expect(buildOfficialPublicationPlan({ package: pkg, currentActiveRevision: null }).expectedNextRevision).toBe(1);
    expect(buildOfficialPublicationPlan({ package: pkg, currentActiveRevision: 0 }).expectedNextRevision).toBe(1);
  });

  it('incrementa a revisao ativa atual', () => {
    const pkg = basePackage();

    expect(buildOfficialPublicationPlan({ package: pkg, currentActiveRevision: 1 }).expectedNextRevision).toBe(2);
  });

  it('sempre grava sob o workspace ici-dev, mesmo que o pacote informe outro workspaceId', () => {
    const pkg = basePackage();
    pkg.workspace.workspaceId = 'algum-outro-workspace';
    pkg.teams[0].workspaceId = 'algum-outro-workspace';

    const plan = buildOfficialPublicationPlan({ package: pkg, currentActiveRevision: 1 });

    expect(plan.workspaceId).toBe('ici-dev');
    expect(plan.entityWrites[0].data.workspaceId).toBe('ici-dev');
    expect(plan.entityWrites[0].collectionPath).toBe('workspaces/ici-dev/revisions/2/teams');
  });

  it('gera entityWrites para as sete colecoes publicaveis, sem contar publicationRecords do pacote', () => {
    const pkg = basePackage();
    const plan = buildOfficialPublicationPlan({ package: pkg, currentActiveRevision: 1 });
    const expectedTotal = (
      pkg.teams.length
      + pkg.members.length
      + pkg.memberTeamMemberships.length
      + pkg.teamManagerAssignments.length
      + pkg.schedulePeriods.length
      + pkg.scheduleAssignments.length
      + pkg.scheduleChangeRequests.length
    );

    expect(plan.entityWrites).toHaveLength(expectedTotal);
    expect(plan.counts.total).toBe(expectedTotal);
  });

  it('gera publicationRecordWrite com id ici-dev_revisao e source DASHBOARD_OFFICIAL_PUBLISH', () => {
    const pkg = basePackage();
    const plan = buildOfficialPublicationPlan({ package: pkg, currentActiveRevision: 1 });

    expect(plan.publicationRecordWrite).toMatchObject({
      collection: 'publication_records',
      id: 'ici-dev_2',
      data: {
        id: 'ici-dev_2',
        workspaceId: 'ici-dev',
        publicationRevision: 2,
        source: 'DASHBOARD_OFFICIAL_PUBLISH',
      },
    });
  });
});
