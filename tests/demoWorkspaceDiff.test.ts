import { describe, expect, it } from 'vitest';
import { diffDemoPackages } from '../src/lib/demoWorkspace/diff';
import type { DemoManagerAssignmentDto, DemoPublicationPackage } from '../src/lib/demoWorkspace/dto';

function makePackage(): DemoPublicationPackage {
  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: 'demo-v1',
      workspaceType: 'DEMO',
      scenarioId: 'diff-test',
      seedVersion: 1,
      publicationRevision: 1,
      externalEffectsAllowed: false,
      notificationsEnabled: false,
    },
    teams: [{ id: 'team-1', workspaceId: 'demo-v1', name: 'Time Demo', acronym: 'TD', active: true, schemaVersion: 1 }],
    members: [{ id: 'member-1', workspaceId: 'demo-v1', displayName: 'Pessoa Demo', corporateLogin: 'pessoa.demo', emailNormalized: 'pessoa.demo@example.invalid', active: true, schemaVersion: 1 }],
    memberTeamMemberships: [],
    teamManagerAssignments: [{
      id: 'manager-1',
      workspaceId: 'demo-v1',
      managerMemberId: 'member-1',
      teamId: 'team-1',
      role: 'PRIMARY_MANAGER',
      permissions: {
        viewTeamSchedule: true,
        viewTeamMembers: true,
        editTeamSchedule: false,
        approveScheduleChanges: true,
        publishSchedule: false,
        manageTeamAssignments: false,
      },
      active: true,
      validFrom: '2026-01-01',
      validTo: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      createdBy: 'demo-admin@example.invalid',
      schemaVersion: 1,
    }],
    schedulePeriods: [{ id: 'period-1', workspaceId: 'demo-v1', teamId: 'team-1', name: 'Período Demo', startDate: '2026-07-26', endDate: '2026-07-26', active: true, publicationRevision: 1, schemaVersion: 1 }],
    scheduleAssignments: [{ id: 'assignment-1', workspaceId: 'demo-v1', periodId: 'period-1', teamId: 'team-1', memberId: 'member-1', date: '2026-07-26', assignmentType: 'WORK_SHIFT', shiftName: 'Manhã', startTime: '07:00', endTime: '13:00', schemaVersion: 1 }],
    scheduleChangeRequests: [{ id: 'request-1', workspaceId: 'demo-v1', requesterMemberId: 'member-1', requesterTeamId: 'team-1', assignedManagerMemberId: 'member-1', schedulePeriodId: 'period-1', assignmentId: 'assignment-1', requestType: 'SHIFT_CHANGE', status: 'PENDING', reason: 'Teste', createdAt: '2026-01-01T00:00:00Z', resolvedAt: null, resolvedByMemberId: null, resolutionNote: null, schemaVersion: 1 }],
    publicationRecords: [],
  };
}

const zeroDiff = {
  teamsAdded: 0,
  teamsChanged: 0,
  membersAdded: 0,
  membersChanged: 0,
  managerAssignmentsAdded: 0,
  managerAssignmentsChanged: 0,
  scheduleAssignmentsChanged: 0,
  requestsChanged: 0,
  deletions: 0,
};

describe('diffDemoPackages', () => {
  it('retorna zero para pacotes sem mudancas', () => {
    const baseline = makePackage();
    const draft = {
      ...baseline,
      scheduleAssignments: [...baseline.scheduleAssignments].reverse(),
    };

    expect(diffDemoPackages(baseline, draft)).toEqual(zeroDiff);
  });

  it('conta mudanca em scheduleAssignment por id', () => {
    const baseline = makePackage();
    const draft: DemoPublicationPackage = {
      ...baseline,
      scheduleAssignments: baseline.scheduleAssignments.map((assignment) => (
        assignment.id === 'assignment-1' ? { ...assignment, shiftName: 'Tarde', startTime: '13:00', endTime: '19:00' } : assignment
      )),
    };

    expect(diffDemoPackages(baseline, draft)).toEqual({ ...zeroDiff, scheduleAssignmentsChanged: 1 });
  });

  it('conta novo teamManagerAssignment', () => {
    const baseline = makePackage();
    const added: DemoManagerAssignmentDto = {
      ...baseline.teamManagerAssignments[0],
      id: 'manager-2',
      role: 'BACKUP_APPROVER',
    };
    const draft: DemoPublicationPackage = {
      ...baseline,
      teamManagerAssignments: [...baseline.teamManagerAssignments, added],
    };

    expect(diffDemoPackages(baseline, draft)).toEqual({ ...zeroDiff, managerAssignmentsAdded: 1 });
  });

  it('agrega remocao de scheduleChangeRequests em deletions', () => {
    const baseline = makePackage();
    const draft: DemoPublicationPackage = {
      ...baseline,
      scheduleChangeRequests: [],
    };

    expect(diffDemoPackages(baseline, draft)).toEqual({ ...zeroDiff, deletions: 1 });
  });

  it('conta multiplas mudancas simultaneas na propria categoria', () => {
    const baseline = makePackage();
    const draft: DemoPublicationPackage = {
      ...baseline,
      teams: [...baseline.teams, { id: 'team-2', workspaceId: 'demo-v1', name: 'Outro Time', acronym: 'OT', active: true, schemaVersion: 1 }],
      members: baseline.members.map((member) => ({ ...member, displayName: 'Pessoa Editada' })),
      teamManagerAssignments: baseline.teamManagerAssignments.map((assignment) => ({ ...assignment, active: false })),
      scheduleAssignments: baseline.scheduleAssignments.map((assignment) => ({ ...assignment, assignmentType: 'OFF', shiftName: null, startTime: null, endTime: null })),
      scheduleChangeRequests: baseline.scheduleChangeRequests.map((request) => ({ ...request, reason: 'Motivo editado' })),
    };

    expect(diffDemoPackages(baseline, draft)).toEqual({
      ...zeroDiff,
      teamsAdded: 1,
      membersChanged: 1,
      managerAssignmentsChanged: 1,
      scheduleAssignmentsChanged: 1,
      requestsChanged: 1,
    });
  });
});
