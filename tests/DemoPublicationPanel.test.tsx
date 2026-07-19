import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoPublicationPanel } from '../src/components/DemoPublicationPanel';
import { DemoPublishDialog } from '../src/components/DemoPublishDialog';
import { DemoRemoteResetDialog } from '../src/components/DemoRemoteResetDialog';
import { DemoScenarioSummary } from '../src/components/DemoScenarioSummary';
import type { DemoValidationResult } from '../src/hooks/useDemoRemotePublication';
import type { DemoPublicationPackage } from '../src/lib/demoWorkspace/dto';
import type { DemoWorkspaceDiff } from '../src/lib/demoWorkspace/diff';
import fixturePackage from '../fixtures/demo/demo-v1-publication-package.json';

const pkg = fixturePackage as DemoPublicationPackage;
const validation: DemoValidationResult = {
  status: 'VALIDATED',
  workspaceId: 'demo-v1',
  currentActiveRevision: 2,
  nextPublicationRevision: 3,
  counts: {
    teams: pkg.teams.length,
    members: pkg.members.length,
    teamManagerAssignments: pkg.teamManagerAssignments.length,
    schedulePeriods: pkg.schedulePeriods.length,
    scheduleAssignments: pkg.scheduleAssignments.length,
    scheduleChangeRequests: pkg.scheduleChangeRequests.length,
  },
  changes: { entityCounts: {} },
  checksumStatus: 'MATCH',
};
const diff: DemoWorkspaceDiff = {
  teamsAdded: 0,
  teamsChanged: 0,
  membersAdded: 0,
  membersChanged: 0,
  managerAssignmentsAdded: 1,
  managerAssignmentsChanged: 2,
  scheduleAssignmentsChanged: 4,
  requestsChanged: 0,
  deletions: 0,
};

describe('DemoPublicationPanel', () => {
  it('desabilita Publicar no Firebase com backend offline', () => {
    render(
      <DemoPublicationPanel
        draftPackage={pkg}
        localDraftRevision={1}
        dirty
        backendStatus="OFFLINE"
        firebaseAdminStatus={{ configured: true, workspaceId: 'demo-v1', activePublicationRevision: 1, status: 'ACTIVE' }}
        validation={validation}
        busy="IDLE"
        lastError={null}
        onValidate={vi.fn()}
        onPublishClick={vi.fn()}
        onResetClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Publicar no Firebase' })).toBeDisabled();
  });

  it('desabilita Publicar no Firebase quando Firebase Admin nao esta configurado', () => {
    render(
      <DemoPublicationPanel
        draftPackage={pkg}
        localDraftRevision={1}
        dirty
        backendStatus="ONLINE"
        firebaseAdminStatus={{ configured: false, workspaceId: 'demo-v1', status: 'FIREBASE_ADMIN_NOT_CONFIGURED' }}
        validation={validation}
        busy="IDLE"
        lastError={null}
        onValidate={vi.fn()}
        onPublishClick={vi.fn()}
        onResetClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Publicar no Firebase' })).toBeDisabled();
  });

  it('modal de publicação mostra contagens corretas', () => {
    render(
      <DemoPublishDialog
        draftPackage={pkg}
        validation={validation}
        diff={diff}
        busy="IDLE"
        lastError={null}
        onCancel={vi.fn()}
        onPublish={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Publicar Ambiente de Demonstração' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Times').nextSibling?.textContent).toBe(String(pkg.teams.length));
    expect(within(dialog).getByText('Membros').nextSibling?.textContent).toBe(String(pkg.members.length));
    expect(within(dialog).getByText('Responsáveis').nextSibling?.textContent).toBe(String(pkg.teamManagerAssignments.length));
    expect(within(dialog).getByText('Atribuições').nextSibling?.textContent).toBe(String(pkg.scheduleAssignments.length));
    expect(within(dialog).getByText('Atribuições alteradas').nextSibling?.textContent).toBe('4');
    expect(within(dialog).getByText('Responsáveis alterados').nextSibling?.textContent).toBe('3');
    expect(within(dialog).getByText('Dados de produção afetados').nextSibling?.textContent).toBe('0');
  });

  it('reset remoto usa dialogo diferente do restore local', async () => {
    const user = userEvent.setup();
    const onResetClick = vi.fn();
    render(
      <>
        <DemoScenarioSummary
          pkg={pkg}
          sourcePublicationRevision={1}
          localDraftRevision={1}
          dirty={false}
          diff={null}
        />
        <button className="btn">Restaurar cenário de demonstração</button>
        <DemoPublicationPanel
          draftPackage={pkg}
          localDraftRevision={1}
          dirty
          backendStatus="ONLINE"
          firebaseAdminStatus={{ configured: true, workspaceId: 'demo-v1', activePublicationRevision: 2, status: 'ACTIVE' }}
          validation={validation}
          busy="IDLE"
          lastError={null}
          onValidate={vi.fn()}
          onPublishClick={vi.fn()}
          onResetClick={onResetClick}
        />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Restaurar cenário de demonstração' }));
    expect(screen.queryByRole('dialog', { name: 'Restaurar Demo publicado no Firebase' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restaurar Demo publicado' }));
    expect(onResetClick).toHaveBeenCalledTimes(1);

    render(
      <DemoRemoteResetDialog
        firebaseAdminStatus={{ configured: true, workspaceId: 'demo-v1', activePublicationRevision: 2, status: 'ACTIVE' }}
        busy="IDLE"
        lastError={null}
        onCancel={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Restaurar Demo publicado no Firebase' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Restaurar cenário de demonstração' })).not.toBeInTheDocument();
  });
});
