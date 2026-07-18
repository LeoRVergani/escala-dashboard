import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DemoManagerAssignmentsDialog } from '../src/components/DemoManagerAssignmentsDialog';
import type { DemoPublicationPackage } from '../src/lib/demoWorkspace/dto';

function makePackage(): DemoPublicationPackage {
  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: 'demo-v1',
      workspaceType: 'DEMO',
      scenarioId: 'managers-test',
      seedVersion: 1,
      publicationRevision: 1,
      externalEffectsAllowed: false,
      notificationsEnabled: false,
    },
    teams: [
      { id: 'team-soc', workspaceId: 'demo-v1', name: 'SOC', acronym: 'SOC', active: true, schemaVersion: 1 },
      { id: 'team-sec', workspaceId: 'demo-v1', name: 'Segurança', acronym: 'SEG', active: true, schemaVersion: 1 },
    ],
    members: [
      { id: 'member-manager', workspaceId: 'demo-v1', displayName: 'Marina Gestora', corporateLogin: 'marina.gestora', emailNormalized: 'marina.gestora@example.invalid', active: true, schemaVersion: 1 },
      { id: 'member-approver', workspaceId: 'demo-v1', displayName: 'Paulo Aprovador', corporateLogin: 'paulo.aprovador', emailNormalized: 'paulo.aprovador@example.invalid', active: true, schemaVersion: 1 },
      { id: 'member-editor', workspaceId: 'demo-v1', displayName: 'Elisa Editora', corporateLogin: 'elisa.editora', emailNormalized: 'elisa.editora@example.invalid', active: true, schemaVersion: 1 },
    ],
    memberTeamMemberships: [],
    teamManagerAssignments: [
      {
        id: 'manager-existing-1',
        workspaceId: 'demo-v1',
        managerMemberId: 'member-manager',
        teamId: 'team-soc',
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
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdBy: 'demo-admin@example.invalid',
        schemaVersion: 1,
      },
      {
        id: 'manager-existing-2',
        workspaceId: 'demo-v1',
        managerMemberId: 'member-approver',
        teamId: 'team-sec',
        role: 'PRIMARY_APPROVER',
        permissions: {
          viewTeamSchedule: true,
          viewTeamMembers: false,
          editTeamSchedule: false,
          approveScheduleChanges: true,
          publishSchedule: false,
          manageTeamAssignments: false,
        },
        active: true,
        validFrom: '2026-02-01',
        validTo: null,
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
        createdBy: 'demo-admin@example.invalid',
        schemaVersion: 1,
      },
    ],
    scheduleChangeRequests: [],
    schedulePeriods: [],
    scheduleAssignments: [],
    publicationRecords: [],
  };
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof DemoManagerAssignmentsDialog>> = {}) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const props = {
    pkg: makePackage(),
    onSave,
    onCancel,
    ...overrides,
  };
  return {
    user: userEvent.setup(),
    props,
    onSave,
    onCancel,
    ...render(<DemoManagerAssignmentsDialog {...props} />),
  };
}

describe('DemoManagerAssignmentsDialog', () => {
  it('renderiza a lista de vínculos existentes mostrando time, responsável e papel', () => {
    renderDialog();
    const row = screen.getByRole('row', { name: /SOC Marina Gestora marina\.gestora/i });

    expect(row).toHaveTextContent('SOC');
    expect(row).toHaveTextContent('Marina Gestora');
    expect(row).toHaveTextContent('marina.gestora');
    expect(within(row).getByLabelText('Papel do vínculo manager-existing-1')).toHaveValue('PRIMARY_MANAGER');
  });

  it('muda o papel de um vínculo existente e salva o pacote atualizado', async () => {
    const { user, onSave } = renderDialog();

    await user.selectOptions(screen.getByLabelText('Papel do vínculo manager-existing-1'), 'PUBLISHER');
    await user.click(screen.getByRole('button', { name: /Salvar alterações/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect((onSave.mock.calls[0][0] as DemoPublicationPackage).teamManagerAssignments.find((assignment) => assignment.id === 'manager-existing-1')?.role).toBe('PUBLISHER');
  });

  it('adiciona um novo responsável por seleção e salva o novo vínculo', async () => {
    const { user, onSave } = renderDialog();

    await user.selectOptions(screen.getByLabelText('Time do novo responsável'), 'team-soc');
    await user.selectOptions(screen.getByLabelText('Membro do novo responsável'), 'member-editor');
    await user.selectOptions(screen.getByLabelText('Papel do novo responsável'), 'SCHEDULE_EDITOR');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(screen.getByRole('row', { name: /SOC Elisa Editora elisa\.editora/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Salvar alterações/i }));
    const saved = onSave.mock.calls[0][0] as DemoPublicationPackage;
    const added = saved.teamManagerAssignments.find((assignment) => (
      assignment.teamId === 'team-soc'
      && assignment.managerMemberId === 'member-editor'
      && assignment.role === 'SCHEDULE_EDITOR'
    ));

    expect(added).toMatchObject({
      workspaceId: 'demo-v1',
      active: true,
      validTo: null,
      createdBy: 'local-test-mode@example.invalid',
      schemaVersion: 1,
      permissions: {
        viewTeamSchedule: false,
        viewTeamMembers: false,
        editTeamSchedule: false,
        approveScheduleChanges: false,
        publishSchedule: false,
        manageTeamAssignments: false,
      },
    });
    expect(added?.id).toMatch(/^manager-local-/);
  });

  it('rejeita vínculo duplicado ativo sem duplicar a entrada', async () => {
    const { user } = renderDialog();

    await user.selectOptions(screen.getByLabelText('Time do novo responsável'), 'team-soc');
    await user.selectOptions(screen.getByLabelText('Membro do novo responsável'), 'member-manager');
    await user.selectOptions(screen.getByLabelText('Papel do novo responsável'), 'PRIMARY_MANAGER');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Já existe um vínculo ativo/i);
    expect(screen.getAllByRole('row', { name: /SOC Marina Gestora marina\.gestora/i })).toHaveLength(1);
  });

  it('permite o mesmo responsável em um segundo time diferente', async () => {
    const { user } = renderDialog();

    await user.selectOptions(screen.getByLabelText('Time do novo responsável'), 'team-sec');
    await user.selectOptions(screen.getByLabelText('Membro do novo responsável'), 'member-manager');
    await user.selectOptions(screen.getByLabelText('Papel do novo responsável'), 'PRIMARY_MANAGER');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Segurança Marina Gestora marina\.gestora/i })).toBeInTheDocument();
  });

  it('cancela sem chamar onSave', async () => {
    const { user, onSave, onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
