import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPublicationPlan } from '../server/domain/demoPublicationPlanner.mjs';

function readRealPackage() {
  return JSON.parse(readFileSync('fixtures/demo/demo-v1-publication-package.json', 'utf8')) as Record<string, any>;
}

describe('buildPublicationPlan', () => {
  it('usa revisao 1 quando nunca houve publicacao', () => {
    const pkg = readRealPackage();

    expect(buildPublicationPlan({ package: pkg, currentActiveRevision: null }).expectedNextRevision).toBe(1);
    expect(buildPublicationPlan({ package: pkg, currentActiveRevision: 0 }).expectedNextRevision).toBe(1);
  });

  it('incrementa a revisao ativa atual', () => {
    const pkg = readRealPackage();

    expect(buildPublicationPlan({ package: pkg, currentActiveRevision: 1 }).expectedNextRevision).toBe(2);
  });

  it('cria entityWrites para as sete colecoes publicaveis sem contar publicationRecords do pacote', () => {
    const pkg = readRealPackage();
    const plan = buildPublicationPlan({ package: pkg, currentActiveRevision: 1 });
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

  it('usa colecoes e ids corretos vindos da fixture real', () => {
    const pkg = readRealPackage();
    const plan = buildPublicationPlan({ package: pkg, currentActiveRevision: 1 });

    expect(plan.entityWrites).toEqual(expect.arrayContaining([
      expect.objectContaining({
        collection: 'teams',
        collectionPath: 'workspaces/demo-v1/revisions/2/teams',
        id: 'team-demo-soc',
      }),
      expect.objectContaining({
        collection: 'team_manager_assignments',
        collectionPath: 'workspaces/demo-v1/revisions/2/team_manager_assignments',
        id: 'manager-demo-soc',
      }),
      expect.objectContaining({
        collection: 'member_team_memberships',
        collectionPath: 'workspaces/demo-v1/revisions/2/member_team_memberships',
        id: 'membership-demo-soc-01',
      }),
      expect.objectContaining({
        collection: 'schedule_periods',
        collectionPath: 'workspaces/demo-v1/revisions/2/schedule_periods',
        id: 'period-demo-soc-2026-07-26-2026-08-25',
      }),
      expect.objectContaining({
        collection: 'schedule_assignments',
        collectionPath: 'workspaces/demo-v1/revisions/2/schedule_assignments',
        id: 'assignment-demo-seguranca-01-2026-07-26',
      }),
      expect.objectContaining({
        collection: 'schedule_change_requests',
        collectionPath: 'workspaces/demo-v1/revisions/2/schedule_change_requests',
        id: 'request-demo-pending-001',
      }),
    ]));
  });

  it('define workspaceId e publicationRevision das entidades pelo servidor', () => {
    const pkg = readRealPackage();
    pkg.teams[0] = { ...pkg.teams[0], workspaceId: 'pacote-invalido', publicationRevision: 999 };
    const plan = buildPublicationPlan({ package: pkg, currentActiveRevision: 1 });

    expect(plan.entityWrites[0]).toMatchObject({
      collectionPath: 'workspaces/demo-v1/revisions/2/teams',
      data: {
        workspaceId: 'demo-v1',
        publicationRevision: 2,
      },
    });
  });

  it('gera publicationRecordWrite com id demo-v1_revisao', () => {
    const pkg = readRealPackage();
    const plan = buildPublicationPlan({ package: pkg, currentActiveRevision: 1 });

    expect(plan.publicationRecordWrite).toMatchObject({
      collection: 'publication_records',
      id: 'demo-v1_2',
      data: {
        id: 'demo-v1_2',
        workspaceId: 'demo-v1',
        publicationRevision: 2,
      },
    });
  });
});
