import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfficialPublicationWizard } from '../src/components/OfficialPublicationWizard';
import { toOfficialPackage } from '../src/lib/officialWorkspace/retarget';
import type { DemoPublicationPackage } from '../src/lib/demoWorkspace/dto';
import type { OfficialFirebaseAdminStatus, OfficialValidationResult } from '../src/hooks/useOfficialRemotePublication';
import fixturePackage from '../fixtures/demo/demo-v1-publication-package.json';
import { buildOfficialTestPackage } from './fixtures/officialPackage';
import type { OnCallGroup, Team } from '../src/types';

const demoTaintedPackage = toOfficialPackage(fixturePackage as DemoPublicationPackage);
const cleanPackage = buildOfficialTestPackage();

const adminStatusEnabled: OfficialFirebaseAdminStatus = {
  configured: true,
  workspaceId: 'ici-dev',
  activePublicationRevision: 0,
  status: 'NEVER_PUBLISHED',
  allowOfficialFirestoreWrite: true,
};

const adminStatusDisabled: OfficialFirebaseAdminStatus = { ...adminStatusEnabled, allowOfficialFirestoreWrite: false };

const onCallTeams: Team[] = [
  {
    id: 'cosi-plantao-plantao-cosi',
    code: 'SOC-PLANTAO',
    name: 'SOC Plantão',
    responsibleLogin: 'admin@ici.test',
    scheduleKind: 'ON_CALL',
    active: true,
    allowedImportLayouts: ['oncall'],
  },
  {
    id: 'cosi-plantao-noc',
    code: 'NOC-PLANTAO',
    name: 'NOC Plantão',
    responsibleLogin: 'admin@ici.test',
    scheduleKind: 'ON_CALL',
    active: true,
    allowedImportLayouts: ['oncall'],
  },
];

const onCallGroups: OnCallGroup[] = [
  { id: 'cosi-plantao-plantao-cosi-cosi', teamId: 'cosi-plantao-plantao-cosi', name: 'COSI', active: true },
  { id: 'cosi-plantao-noc-a', teamId: 'cosi-plantao-noc', name: 'Grupo A', active: true },
  { id: 'cosi-plantao-noc-b', teamId: 'cosi-plantao-noc', name: 'Grupo B', active: true },
];

function baseProps(overrides: Partial<Parameters<typeof OfficialPublicationWizard>[0]> = {}) {
  return {
    officialPackage: cleanPackage,
    officialSource: 'import' as const,
    demoPackageAvailable: true,
    corporateLink: {},
    onCorporateLinkChange: vi.fn(),
    backendStatus: 'ONLINE' as const,
    firebaseAdminStatus: adminStatusEnabled,
    validation: null,
    busy: 'IDLE' as const,
    lastError: null,
    onValidate: vi.fn(),
    onPublishClick: vi.fn(),
    publishResult: null,
    onStartImport: vi.fn(),
    onStartEmptySchedule: vi.fn(),
    onSelectDemoPackage: vi.fn(),
    onGoToDemo: vi.fn(),
    officialScheduleTeamId: 'team-oficial-soc',
    onOfficialScheduleTeamIdChange: vi.fn(),
    officialScheduleRevisionInput: '',
    onOfficialScheduleRevisionInputChange: vi.fn(),
    officialScheduleRevisionBase: null,
    officialScheduleLoadResult: null,
    officialScheduleLoading: false,
    onLoadOfficialActiveSchedule: vi.fn(),
    onLoadOfficialRevisionSchedule: vi.fn(),
    onReloadOfficialSchedule: vi.fn(),
    onCallTeams,
    onCallGroups,
    selectedOnCallTeamId: 'cosi-plantao-plantao-cosi',
    onSelectedOnCallTeamIdChange: vi.fn(),
    selectedOnCallGroupId: 'cosi-plantao-plantao-cosi-cosi',
    onSelectedOnCallGroupIdChange: vi.fn(),
    ...overrides,
  };
}

describe('OfficialPublicationWizard (FASE 14E)', () => {
  it('bloqueia as etapas de vínculo/dry-run/confirmação quando só há dados do Ambiente Demo (contaminados)', () => {
    render(<OfficialPublicationWizard {...baseProps({ officialPackage: demoTaintedPackage })} />);

    expect(screen.getByText(/nenhum membro ou equipe elegível/i)).toBeInTheDocument();
    for (const label of ['Revisão dos dados', 'Vínculo corporativo', 'Dry-run', 'Revisão do plano', 'Confirmação']) {
      expect(screen.getByRole('tab', { name: label })).toBeDisabled();
    }
    // "Diagnósticos" e "Resultado" continuam acessíveis - são onde o usuário entende o
    // bloqueio ou confere o que já aconteceu, mesmo com as etapas anteriores inválidas.
    expect(screen.getByRole('tab', { name: 'Diagnósticos' })).toBeEnabled();
    expect(screen.getByRole('tab', { name: 'Resultado' })).toBeEnabled();
  });

  it('link do botão "Ambiente Demo" na etapa 1 quando nenhum pacote foi carregado', async () => {
    const user = userEvent.setup();
    const props = baseProps({ officialPackage: null });
    render(<OfficialPublicationWizard {...props} />);

    await user.click(screen.getByRole('button', { name: 'Ambiente Demo' }));
    expect(props.onGoToDemo).toHaveBeenCalledTimes(1);
  });

  it('avança até o vínculo corporativo com um pacote elegível e nunca lista membros do Ambiente Demo', async () => {
    const user = userEvent.setup();
    render(<OfficialPublicationWizard {...baseProps()} />);

    await user.click(screen.getByRole('tab', { name: 'Vínculo corporativo' }));
    expect(screen.getByRole('option', { name: 'Membro Oficial Um' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /demo/i })).not.toBeInTheDocument();
  });

  it('a etapa "Dry-run" continua disponível mesmo com a flag de publicação desligada', async () => {
    const user = userEvent.setup();
    const membership = cleanPackage.memberTeamMemberships[0];
    render(
      <OfficialPublicationWizard
        {...baseProps({
          corporateLink: { memberId: membership.memberId, teamId: membership.teamId },
          firebaseAdminStatus: adminStatusDisabled,
        })}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Dry-run' }));
    expect(screen.getByRole('button', { name: /executar dry-run/i })).toBeEnabled();
  });

  it('a etapa "Confirmação" mostra a publicação desabilitada e bloqueia o botão com a flag desligada', async () => {
    const user = userEvent.setup();
    const membership = cleanPackage.memberTeamMemberships[0];
    const validation: OfficialValidationResult = {
      status: 'VALIDATED',
      workspaceId: 'ici-dev',
      currentActiveRevision: 0,
      nextPublicationRevision: 1,
      counts: { teams: 1, members: 1, schedulePeriods: 0, scheduleAssignments: 0 },
      changes: { entityCounts: {} },
      checksumStatus: 'MATCH',
    };
    render(
      <OfficialPublicationWizard
        {...baseProps({
          corporateLink: { memberId: membership.memberId, teamId: membership.teamId },
          firebaseAdminStatus: adminStatusDisabled,
          validation,
        })}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Confirmação' }));
    expect(screen.getByText('Publicação oficial desabilitada neste ambiente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar oficialmente' })).toBeDisabled();
  });

  it('a etapa "Resultado" mostra a revisão publicada quando publishResult está presente', async () => {
    const user = userEvent.setup();
    render(<OfficialPublicationWizard {...baseProps({ publishResult: { revision: 7 } })} />);

    await user.click(screen.getByRole('tab', { name: 'Resultado' }));
    expect(screen.getByText(/publicado na revisão 7/i)).toBeInTheDocument();
  });

  it('a área de diagnósticos mostra o erro de contaminação Demo com detalhes técnicos expansíveis', async () => {
    const user = userEvent.setup();
    render(<OfficialPublicationWizard {...baseProps({ officialPackage: demoTaintedPackage })} />);

    await user.click(screen.getByRole('tab', { name: 'Diagnósticos' }));
    const diagnosticsPanel = within(screen.getByRole('region', { name: 'Diagnósticos' }));
    expect(diagnosticsPanel.getByText(/pertencem ao Ambiente Demo/i)).toBeInTheDocument();
    await user.click(diagnosticsPanel.getByRole('button', { name: /detalhes técnicos/i }));
    expect(diagnosticsPanel.getByText(/assertOfficialOnlyWritePlan/i)).toBeInTheDocument();
  });

  it('mostra ação de recarregar quando há conflito de revisão', async () => {
    const user = userEvent.setup();
    const props = baseProps({
      lastError: {
        code: 'PUBLICATION_REVISION_CONFLICT',
        message: 'Revisão ativa esperada 2, mas a revisão real é 3.',
      },
    });
    render(<OfficialPublicationWizard {...props} />);

    await user.click(screen.getByRole('tab', { name: 'Resultado' }));
    expect(screen.getByText('Existe uma versão mais recente publicada desde que você carregou esta escala.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Recarregar' }));
    expect(props.onReloadOfficialSchedule).toHaveBeenCalledTimes(1);
  });

  it('mantém "Escala importada" habilitada mesmo sem equipe de plantão escolhida', async () => {
    const user = userEvent.setup();
    const props = baseProps({ selectedOnCallTeamId: '', selectedOnCallGroupId: '' });
    render(<OfficialPublicationWizard {...props} />);

    const importButton = screen.getByRole('button', { name: /escala importada/i });
    expect(importButton).toBeEnabled();
    expect(screen.getByText('Selecione a equipe de plantão antes de importar.')).toBeInTheDocument();
    await user.click(importButton);
    expect(props.onStartImport).toHaveBeenCalledTimes(1);
  });

  it('SOC com grupo único pula seleção de grupo e mantém importação habilitada', () => {
    render(<OfficialPublicationWizard {...baseProps()} />);

    expect(screen.getByText('Grupo único: COSI.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Grupo de plantão')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /escala importada/i })).toBeEnabled();
  });

  it('NOC com múltiplos grupos avisa seleção explícita sem bloquear a importação geral', () => {
    const { rerender } = render(
      <OfficialPublicationWizard
        {...baseProps({ selectedOnCallTeamId: 'cosi-plantao-noc', selectedOnCallGroupId: '' })}
      />,
    );

    expect(screen.getByLabelText('Grupo de plantão')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /escala importada/i })).toBeEnabled();
    expect(screen.getByText('Selecione explicitamente o grupo de plantão antes de importar.')).toBeInTheDocument();

    rerender(
      <OfficialPublicationWizard
        {...baseProps({ selectedOnCallTeamId: 'cosi-plantao-noc', selectedOnCallGroupId: 'cosi-plantao-noc-b' })}
      />,
    );
    expect(screen.getByRole('button', { name: /escala importada/i })).toBeEnabled();
  });
});
