import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyScheduleStateToPackage, demoPackageToScheduleState } from '../src/lib/demoWorkspace/scheduleAdapter';
import type { DemoPublicationPackage } from '../src/lib/demoWorkspace/dto';
import { validateDemoPublicationPackage } from '../src/lib/demoWorkspace/validation';

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function makePackage(overrides: Partial<DemoPublicationPackage> = {}): DemoPublicationPackage {
  const pkg: DemoPublicationPackage = {
    schemaVersion: 1,
    workspace: {
      workspaceId: 'demo-v1',
      workspaceType: 'DEMO',
      scenarioId: 'schedule-approval-basic',
      seedVersion: 1,
      publicationRevision: 1,
      externalEffectsAllowed: false,
      notificationsEnabled: false,
    },
    teams: [{ id: 'team-1', workspaceId: 'demo-v1', name: 'Time Demo', acronym: 'TD', active: true, schemaVersion: 1 }],
    members: [{ id: 'member-1', workspaceId: 'demo-v1', displayName: 'Pessoa Demo', corporateLogin: 'pessoa.demo', emailNormalized: 'pessoa.demo@example.invalid', active: true, schemaVersion: 1 }],
    memberTeamMemberships: [{ id: 'membership-1', workspaceId: 'demo-v1', memberId: 'member-1', teamId: 'team-1', startDate: '2026-01-01', endDate: null, active: true, isPrimary: true, schemaVersion: 1 }],
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
    publicationRecords: [{ id: 'publication-1', workspaceId: 'demo-v1', publicationRevision: 1, publishedAt: '2026-01-01T00:00:00Z', publishedByMode: 'LOCAL_TEST_MODE', dryRun: false, countsCreated: 1, countsUpdated: 0, countsDeleted: 0, source: 'DEMO_SEED', schemaVersion: 1 }],
  };
  return { ...pkg, ...overrides };
}

function countsFor(pkg: DemoPublicationPackage) {
  return {
    teams: pkg.teams.length,
    members: pkg.members.length,
    memberTeamMemberships: pkg.memberTeamMemberships.length,
    teamManagerAssignments: pkg.teamManagerAssignments.length,
    schedulePeriods: pkg.schedulePeriods.length,
    scheduleAssignments: pkg.scheduleAssignments.length,
    scheduleChangeRequests: pkg.scheduleChangeRequests.length,
    publicationRecords: pkg.publicationRecords.length,
  };
}

function payload(pkg: DemoPublicationPackage, manifestOverrides: Record<string, unknown> = {}) {
  const packageRaw = JSON.stringify(pkg);
  const manifestRaw = JSON.stringify({
    workspaceId: 'demo-v1',
    sha256: sha256(packageRaw),
    counts: countsFor(pkg),
    schemaVersion: 1,
    ...manifestOverrides,
  });
  return { packageRaw, manifestRaw };
}

describe('demo workspace validation', () => {
  it('aceita pacote valido', async () => {
    const { packageRaw, manifestRaw } = payload(makePackage());
    await expect(validateDemoPublicationPackage(packageRaw, manifestRaw)).resolves.toMatchObject({ status: 'VALID' });
  });

  it('falha com JSON invalido', async () => {
    const { manifestRaw } = payload(makePackage());
    await expect(validateDemoPublicationPackage('{"workspace":', manifestRaw)).resolves.toMatchObject({ status: 'INVALID_JSON' });
  });

  it('falha com schemaVersion errado', async () => {
    const { packageRaw, manifestRaw } = payload(makePackage({ schemaVersion: 2 }));
    await expect(validateDemoPublicationPackage(packageRaw, manifestRaw)).resolves.toMatchObject({ status: 'UNSUPPORTED_SCHEMA' });
  });

  it('falha com workspaceId errado no pacote', async () => {
    const pkg = makePackage({ workspace: { ...makePackage().workspace, workspaceId: 'outro-workspace' } });
    const { packageRaw, manifestRaw } = payload(pkg);
    await expect(validateDemoPublicationPackage(packageRaw, manifestRaw)).resolves.toMatchObject({ status: 'WORKSPACE_MISMATCH' });
  });

  it('falha com workspaceId misturado em item de array', async () => {
    const base = makePackage();
    const pkg = makePackage({ teams: [{ ...base.teams[0], workspaceId: 'outro-workspace' }] });
    const { packageRaw, manifestRaw } = payload(pkg);
    await expect(validateDemoPublicationPackage(packageRaw, manifestRaw)).resolves.toMatchObject({ status: 'WORKSPACE_MISMATCH' });
  });

  it('falha com checksum errado', async () => {
    const { packageRaw, manifestRaw } = payload(makePackage(), { sha256: 'checksum-invalido' });
    await expect(validateDemoPublicationPackage(packageRaw, manifestRaw)).resolves.toMatchObject({ status: 'CHECKSUM_MISMATCH' });
  });

  it('falha com referencia quebrada', async () => {
    const base = makePackage();
    const pkg = makePackage({ memberTeamMemberships: [{ ...base.memberTeamMemberships[0], memberId: 'member-inexistente' }] });
    const { packageRaw, manifestRaw } = payload(pkg);
    await expect(validateDemoPublicationPackage(packageRaw, manifestRaw)).resolves.toMatchObject({ status: 'BROKEN_REFERENCE' });
  });

  it('falha com contagem divergente no manifesto', async () => {
    const { packageRaw, manifestRaw } = payload(makePackage(), { counts: { ...countsFor(makePackage()), teams: 99 } });
    await expect(validateDemoPublicationPackage(packageRaw, manifestRaw)).resolves.toMatchObject({ status: 'INVALID_COUNTS' });
  });
});

describe('demo workspace schedule adapter', () => {
  const root = resolve(__dirname, '..');
  const pkg = JSON.parse(
    readFileSync(resolve(root, 'fixtures/demo/demo-v1-publication-package.json'), 'utf8'),
  ) as DemoPublicationPackage;

  it('converte o time SOC para ScheduleState', () => {
    const state = demoPackageToScheduleState(pkg, 'team-demo-soc');
    const allCells = Object.values(state.cells).flatMap((row) => Object.values(row));

    expect(state.technicians.map((technician) => technician.id)).toEqual(['member-demo-soc-01', 'member-demo-soc-02']);
    expect(state.technicians.some((technician) => technician.id === 'member-demo-gestor-seguranca')).toBe(false);
    expect(state.dates).toHaveLength(31);
    expect(state.dates?.[0]).toBe('2026-07-26');
    expect(state.dates?.[30]).toBe('2026-08-25');
    expect(allCells.some((value) => value?.shift === 'manha')).toBe(true);
    expect(allCells.some((value) => value?.shift === 'tarde')).toBe(true);
    expect(state.origin).toBe('demo-workspace-package');
    expect(state.isDemo).toBe(true);
  });

  it('converte o time Segurança para ScheduleState', () => {
    const state = demoPackageToScheduleState(pkg, 'team-demo-seguranca');
    const allCells = Object.values(state.cells).flatMap((row) => Object.values(row));

    expect(state.technicians.map((technician) => technician.id)).toEqual(['member-demo-seguranca-01', 'member-demo-seguranca-02']);
    expect(state.technicians.some((technician) => technician.id === 'member-demo-gestor-seguranca')).toBe(false);
    expect(state.dates).toHaveLength(31);
    expect(allCells.some((value) => value?.shift === 'comercial')).toBe(true);
    expect(allCells.some((value) => value?.shift === 'folga')).toBe(true);
    expect(state.origin).toBe('demo-workspace-package');
    expect(state.isDemo).toBe(true);
  });
});

describe('demo workspace reverse schedule adapter', () => {
  const root = resolve(__dirname, '..');
  const pkg = JSON.parse(
    readFileSync(resolve(root, 'fixtures/demo/demo-v1-publication-package.json'), 'utf8'),
  ) as DemoPublicationPackage;

  it('reflete edicao de folga para manha preservando o id original', () => {
    const state = demoPackageToScheduleState(pkg, 'team-demo-soc');
    const targetTechnician = state.technicians.find((technician) =>
      Object.values(state.cells[technician.id] ?? {}).some((value) => value?.shift === 'folga'),
    );
    expect(targetTechnician).toBeDefined();
    const targetDay = Number(Object.entries(state.cells[targetTechnician!.id])
      .find(([, value]) => value?.shift === 'folga')?.[0]);
    const targetDate = state.dates![targetDay - 1];
    const originalAssignment = pkg.scheduleAssignments.find((assignment) =>
      assignment.teamId === 'team-demo-soc'
      && assignment.memberId === targetTechnician!.id
      && assignment.date === targetDate,
    );

    const editedState = {
      ...state,
      cells: {
        ...state.cells,
        [targetTechnician!.id]: {
          ...state.cells[targetTechnician!.id],
          [targetDay]: { shift: 'manha' as const },
        },
      },
    };
    const result = applyScheduleStateToPackage(pkg, editedState, 'team-demo-soc');
    const editedAssignment = result.scheduleAssignments.find((assignment) => assignment.id === originalAssignment?.id);

    expect(editedAssignment).toMatchObject({
      id: originalAssignment?.id,
      assignmentType: 'WORK_SHIFT',
      shiftName: 'Manhã',
      startTime: '07:00',
      endTime: '13:00',
    });
  });

  it('mantem assignments de outros times com a mesma referencia', () => {
    const state = demoPackageToScheduleState(pkg, 'team-demo-soc');
    const result = applyScheduleStateToPackage(pkg, state, 'team-demo-soc');
    const originalOtherTeamAssignments = pkg.scheduleAssignments.filter((assignment) => assignment.teamId === 'team-demo-seguranca');

    for (const original of originalOtherTeamAssignments) {
      expect(result.scheduleAssignments.find((assignment) => assignment.id === original.id)).toBe(original);
    }
  });

  it('preserva as referencias dos demais arrays do pacote', () => {
    const state = demoPackageToScheduleState(pkg, 'team-demo-soc');
    const result = applyScheduleStateToPackage(pkg, state, 'team-demo-soc');

    expect(result.teams).toBe(pkg.teams);
    expect(result.members).toBe(pkg.members);
    expect(result.memberTeamMemberships).toBe(pkg.memberTeamMemberships);
    expect(result.teamManagerAssignments).toBe(pkg.teamManagerAssignments);
    expect(result.schedulePeriods).toBe(pkg.schedulePeriods);
    expect(result.scheduleChangeRequests).toBe(pkg.scheduleChangeRequests);
    expect(result.publicationRecords).toBe(pkg.publicationRecords);
  });

  it('mantem assignments semanticamente iguais no roundtrip sem edicao', () => {
    for (const teamId of ['team-demo-soc', 'team-demo-seguranca']) {
      const state = demoPackageToScheduleState(pkg, teamId);
      const result = applyScheduleStateToPackage(pkg, state, teamId);

      expect(result.scheduleAssignments.filter((assignment) => assignment.teamId === teamId)).toEqual(
        pkg.scheduleAssignments.filter((assignment) => assignment.teamId === teamId),
      );
      expect(result.scheduleAssignments).toEqual(pkg.scheduleAssignments);
    }
  });
});
