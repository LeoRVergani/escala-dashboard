import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Home, type HomeSummary } from '../src/components/Home';

const baseSummary: HomeSummary = {
  hasSchedule: false,
  scheduleTypeLabel: null,
  periodLabel: null,
  peopleCount: 0,
  assignmentsCount: 0,
  localDraftAvailable: false,
  testDriveAvailable: false,
  demoWorkspaceLoaded: false,
  demoWorkspaceDirty: false,
  demoContinueAvailable: false,
  officialPackageLoaded: false,
  officialEligibleMemberCount: 0,
  backendStatus: 'UNKNOWN',
  firebaseAdminConfigured: null,
};

function renderHome(summary: Partial<HomeSummary> = {}) {
  const handlers = {
    onCreateEmpty: vi.fn(),
    onStartImport: vi.fn(),
    onOpenDraft: vi.fn(),
    onStartTestDrive: vi.fn(),
    onContinueTestDrive: vi.fn(),
    onOpenDemoWorkspace: vi.fn(),
    onContinueDemoWorkspace: vi.fn(),
    onPrepareOfficial: vi.fn(),
    onViewStatus: vi.fn(),
  };
  const utils = render(<Home summary={{ ...baseSummary, ...summary }} {...handlers} />);
  return { ...handlers, ...utils };
}

describe('Home — tela inicial (FASE 14E)', () => {
  it('renderiza os cartões principais sem mostrar grade nem formulários', () => {
    renderHome();
    expect(screen.getByRole('button', { name: 'Criar escala vazia' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar arquivo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /test drive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ambiente de Demonstração' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preparar publicação oficial' })).toBeInTheDocument();
    // Nada de grade/planejador/formulário oficial nesta tela.
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.queryByText(/vínculo da conta corporativa/i)).not.toBeInTheDocument();
  });

  it('navega para cada ação ao clicar no respectivo cartão', async () => {
    const user = userEvent.setup();
    const handlers = renderHome();

    await user.click(screen.getByRole('button', { name: 'Criar escala vazia' }));
    expect(handlers.onCreateEmpty).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Importar arquivo' }));
    expect(handlers.onStartImport).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Preparar publicação oficial' }));
    expect(handlers.onPrepareOfficial).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /ver status remoto/i }));
    expect(handlers.onViewStatus).toHaveBeenCalledTimes(1);
  });

  it('não mostra "Continuar X" quando nenhuma sessão está disponível', () => {
    renderHome();
    expect(screen.queryByRole('button', { name: 'Continuar Test Drive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuar Ambiente de Demonstração' })).not.toBeInTheDocument();
  });

  it('mostra "Continuar X" quando a respectiva sessão está disponível', () => {
    renderHome({ localDraftAvailable: true, testDriveAvailable: true, demoContinueAvailable: true });
    expect(screen.getByRole('button', { name: 'Continuar Test Drive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar Ambiente de Demonstração' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir rascunho atual' })).toBeEnabled();
  });

  it('desabilita "Abrir rascunho atual" quando não há rascunho local', () => {
    renderHome({ localDraftAvailable: false });
    expect(screen.getByRole('button', { name: 'Abrir rascunho atual' })).toBeDisabled();
  });

  it('mostra no resumo o status Demo/Oficial/backend/Firebase Admin', () => {
    renderHome({
      hasSchedule: true,
      scheduleTypeLabel: 'SOC/NOC — Escala 6x1',
      periodLabel: '26/07 a 25/08/2026',
      peopleCount: 6,
      assignmentsCount: 120,
      demoWorkspaceLoaded: true,
      demoWorkspaceDirty: true,
      officialPackageLoaded: true,
      officialEligibleMemberCount: 0,
      backendStatus: 'ONLINE',
      firebaseAdminConfigured: false,
    });

    expect(screen.getByText('SOC/NOC — Escala 6x1')).toBeInTheDocument();
    expect(screen.getByText('26/07 a 25/08/2026')).toBeInTheDocument();
    expect(screen.getByText('Carregado · alterações locais')).toBeInTheDocument();
    expect(screen.getByText(/sem membros elegíveis/i)).toBeInTheDocument();
    expect(screen.getByText('Backend online')).toBeInTheDocument();
    expect(screen.getByText('Não configurado')).toBeInTheDocument();
  });
});
