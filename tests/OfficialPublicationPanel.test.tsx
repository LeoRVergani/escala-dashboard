import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OfficialPublicationPanel } from '../src/components/OfficialPublicationPanel';
import { OfficialPublishDialog } from '../src/components/OfficialPublishDialog';
import type { OfficialValidationResult } from '../src/hooks/useOfficialRemotePublication';
import { toOfficialPackage } from '../src/lib/officialWorkspace/retarget';
import type { DemoPublicationPackage } from '../src/lib/demoWorkspace/dto';
import fixturePackage from '../fixtures/demo/demo-v1-publication-package.json';
import { buildOfficialTestPackage } from './fixtures/officialPackage';

// Pacote oficial elegível de verdade (nenhum id contém "demo") - usado nos cenários em
// que o vínculo corporativo deve ser aceito. O pacote retitulado a partir da fixture
// demo-v1 (ver `demoTaintedOfficialPackage` abaixo) é usado só no teste que confirma a
// rejeição de dados do Ambiente Demo (FASE 14E).
const officialPackage = buildOfficialTestPackage();
const membership = officialPackage.memberTeamMemberships.find((item) => item.active)!;
const corporateLink = { memberId: membership.memberId, teamId: membership.teamId };

const demoTaintedOfficialPackage = toOfficialPackage(fixturePackage as DemoPublicationPackage);
const demoTaintedMembership = demoTaintedOfficialPackage.memberTeamMemberships.find((item) => item.active)!;
const demoTaintedCorporateLink = { memberId: demoTaintedMembership.memberId, teamId: demoTaintedMembership.teamId };

const validation: OfficialValidationResult = {
  status: 'VALIDATED',
  workspaceId: 'ici-dev',
  currentActiveRevision: 0,
  nextPublicationRevision: 1,
  counts: {
    teams: officialPackage.teams.length,
    members: officialPackage.members.length,
    schedulePeriods: officialPackage.schedulePeriods.length,
    scheduleAssignments: officialPackage.scheduleAssignments.length,
  },
  changes: { entityCounts: {} },
  checksumStatus: 'MATCH',
};

describe('OfficialPublicationPanel', () => {
  it('mostra a publicação oficial desabilitada quando a flag do ambiente está desligada', () => {
    render(
      <OfficialPublicationPanel
        officialPackage={officialPackage}
        corporateLink={corporateLink}
        onCorporateLinkChange={vi.fn()}
        backendStatus="ONLINE"
        firebaseAdminStatus={{
          configured: true,
          workspaceId: 'ici-dev',
          activePublicationRevision: 0,
          status: 'NEVER_PUBLISHED',
          allowOfficialFirestoreWrite: false,
        }}
        validation={validation}
        busy="IDLE"
        lastError={null}
        onValidate={vi.fn()}
        onPublishClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Publicação oficial desabilitada neste ambiente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar oficialmente' })).toBeDisabled();
  });

  it('habilita Publicar oficialmente quando a flag esta ligada, backend online e vinculo valido', () => {
    render(
      <OfficialPublicationPanel
        officialPackage={officialPackage}
        corporateLink={corporateLink}
        onCorporateLinkChange={vi.fn()}
        backendStatus="ONLINE"
        firebaseAdminStatus={{
          configured: true,
          workspaceId: 'ici-dev',
          activePublicationRevision: 0,
          status: 'NEVER_PUBLISHED',
          allowOfficialFirestoreWrite: true,
        }}
        validation={validation}
        busy="IDLE"
        lastError={null}
        onValidate={vi.fn()}
        onPublishClick={vi.fn()}
      />,
    );

    expect(screen.queryByText('Publicação oficial desabilitada neste ambiente.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar oficialmente' })).toBeEnabled();
  });

  it('desabilita as duas ações quando o vínculo corporativo é inválido, mesmo com a flag ligada', () => {
    render(
      <OfficialPublicationPanel
        officialPackage={officialPackage}
        corporateLink={{}}
        onCorporateLinkChange={vi.fn()}
        backendStatus="ONLINE"
        firebaseAdminStatus={{
          configured: true,
          workspaceId: 'ici-dev',
          activePublicationRevision: 0,
          status: 'NEVER_PUBLISHED',
          allowOfficialFirestoreWrite: true,
        }}
        validation={null}
        busy="IDLE"
        lastError={null}
        onValidate={vi.fn()}
        onPublishClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Executar dry-run' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publicar oficialmente' })).toBeDisabled();
  });

  it('modal de confirmação mostra o workspace ici-dev e o vínculo corporativo escolhido', () => {
    const member = officialPackage.members.find((item) => item.id === corporateLink.memberId)!;
    const team = officialPackage.teams.find((item) => item.id === corporateLink.teamId)!;

    render(
      <OfficialPublishDialog
        officialPackage={officialPackage}
        corporateLink={corporateLink}
        validation={validation}
        busy="IDLE"
        lastError={null}
        onCancel={vi.fn()}
        onPublish={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Publicar workspace oficial ici-dev' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('ici-dev')).toBeInTheDocument();
    expect(screen.getByText(`${member.displayName} — ${team.name}`)).toBeInTheDocument();
  });

  it('nunca oferece nem aceita membros/equipes do Ambiente Demo no vínculo oficial (FASE 14E)', () => {
    render(
      <OfficialPublicationPanel
        officialPackage={demoTaintedOfficialPackage}
        corporateLink={demoTaintedCorporateLink}
        onCorporateLinkChange={vi.fn()}
        backendStatus="ONLINE"
        firebaseAdminStatus={{
          configured: true,
          workspaceId: 'ici-dev',
          activePublicationRevision: 0,
          status: 'NEVER_PUBLISHED',
          allowOfficialFirestoreWrite: true,
        }}
        validation={null}
        busy="IDLE"
        lastError={null}
        onValidate={vi.fn()}
        onPublishClick={vi.fn()}
      />,
    );

    // O select de membro nunca deve listar "Gestor de Segurança Demo" (nem qualquer outro
    // membro com id contendo "demo") - mesmo que o vínculo recebido via prop já apontasse
    // para um deles (ex.: estado remanescente de uma sessão anterior).
    expect(screen.queryByRole('option', { name: /demo/i })).not.toBeInTheDocument();
    expect(screen.getByText(/nenhum membro oficial disponível/i)).toBeInTheDocument();

    // E as duas ações ficam bloqueadas mesmo com a flag ligada e backend online, porque o
    // vínculo recebido aponta para dados contaminados pelo Ambiente Demo.
    expect(screen.getByRole('button', { name: 'Executar dry-run' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publicar oficialmente' })).toBeDisabled();
    expect(screen.getByText(/dados do Ambiente Demo, incompatíveis com o workspace ici-dev/i)).toBeInTheDocument();
  });
});
