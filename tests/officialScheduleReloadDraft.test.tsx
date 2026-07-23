import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';
import type { DemoPublicationPackage } from '../src/lib/demoWorkspace/dto';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function packageFor(shiftName: string, teamId = 'team-oficial-soc'): DemoPublicationPackage {
  const memberId = `${teamId}-member-a`;
  const periodId = `${teamId}-period`;
  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: 'ici-dev',
      workspaceType: 'PRODUCTION',
      scenarioId: null,
      seedVersion: null,
      publicationRevision: 3,
      externalEffectsAllowed: false,
      notificationsEnabled: false,
    },
    teams: [{ id: teamId, workspaceId: 'ici-dev', name: 'SOC Oficial', acronym: 'SOC', active: true, schemaVersion: 1 }],
    members: [{
      id: memberId,
      workspaceId: 'ici-dev',
      displayName: 'Analista Oficial',
      corporateLogin: 'analista.oficial',
      emailNormalized: 'analista.oficial@example.invalid',
      active: true,
      schemaVersion: 1,
    }],
    memberTeamMemberships: [{
      id: `${teamId}-membership-a`,
      workspaceId: 'ici-dev',
      memberId,
      teamId,
      startDate: '2026-07-01',
      endDate: null,
      active: true,
      isPrimary: true,
      schemaVersion: 1,
    }],
    teamManagerAssignments: [],
    scheduleChangeRequests: [],
    schedulePeriods: [{
      id: periodId,
      workspaceId: 'ici-dev',
      teamId,
      name: 'Julho',
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      active: true,
      publicationRevision: 3,
      schemaVersion: 1,
    }],
    scheduleAssignments: [
      {
        id: `${teamId}-assignment-1`,
        workspaceId: 'ici-dev',
        periodId,
        teamId,
        memberId,
        date: '2026-07-01',
        assignmentType: 'WORK_SHIFT',
        shiftName,
        startTime: shiftName === 'Tarde' ? '13:00' : '07:00',
        endTime: shiftName === 'Tarde' ? '19:00' : '13:00',
        schemaVersion: 1,
      },
      {
        id: `${teamId}-assignment-2`,
        workspaceId: 'ici-dev',
        periodId,
        teamId,
        memberId,
        date: '2026-07-02',
        assignmentType: 'OFF',
        shiftName: null,
        startTime: null,
        endTime: null,
        schemaVersion: 1,
      },
    ],
    publicationRecords: [],
  };
}

function scheduleFetchCalls() {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([input]) =>
    String(input).includes('/api/official/schedule'),
  );
}

function mockOfficialScheduleApi(packages: DemoPublicationPackage[]) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/health')) return Promise.resolve(jsonResponse({ status: 'ok' }));
    if (url.endsWith('/api/demo/status')) {
      return Promise.resolve(jsonResponse({
        configured: true,
        workspaceId: 'demo-v1',
        activePublicationRevision: 1,
        lastPublishedAt: null,
        status: 'ACTIVE',
      }));
    }
    if (url.endsWith('/api/official/status')) {
      return Promise.resolve(jsonResponse({
        configured: true,
        workspaceId: 'ici-dev',
        activePublicationRevision: 3,
        lastPublishedAt: null,
        status: 'ACTIVE',
        allowOfficialFirestoreWrite: true,
      }));
    }
    if (url.includes('/api/official/schedule')) {
      const pkg = packages.shift();
      if (!pkg) return Promise.reject(new Error(`unexpected extra schedule fetch to ${url}`));
      return Promise.resolve(jsonResponse({
        status: 'OK',
        workspaceId: 'ici-dev',
        revision: pkg.workspace.publicationRevision,
        package: pkg,
      }));
    }
    return Promise.reject(new Error(`unexpected fetch to ${url}`));
  }));
}

async function loadOfficialSchedule(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Publicar escala' }));
  await user.type(screen.getByLabelText('Equipe oficial'), 'team-oficial-soc');
  await user.click(screen.getByRole('button', { name: /carregar escala oficial ativa/i }));
  await waitFor(() => expect(scheduleFetchCalls()).toHaveLength(1));
  expect(screen.getAllByText(/escala oficial carregada da revisão 3/i).length).toBeGreaterThan(0);
}

async function openGrid(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Grade' }));
  return screen.findByRole('grid', { name: /grade mensal/i });
}

function cell(grid: HTMLElement, day: number) {
  return within(grid).getByRole('button', {
    name: new RegExp(`^Dia ${day}, Analista Oficial`, 'i'),
  });
}

async function editFirstCellToNoite(user: ReturnType<typeof userEvent.setup>) {
  const grid = await openGrid(user);
  await user.click(cell(grid, 1));
  const menu = await screen.findByRole('menu', { name: /turno da célula/i });
  await user.click(within(menu).getByRole('menuitem', { name: /Noite/ }));
  expect(cell(grid, 1)).toHaveAccessibleName(/Noite/);
}

async function clickOfficialLoadAgain(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Publicar escala' }));
  await user.click(screen.getByRole('button', { name: /carregar escala oficial ativa/i }));
}

describe('App - reload de escala oficial com rascunho local editado', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('confirma antes de descartar edição local, respeita cancelar/aceitar e não incomoda quando não há edição', async () => {
    mockOfficialScheduleApi([packageFor('Manhã'), packageFor('Tarde'), packageFor('Manhã')]);
    const confirm = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    render(<App />);

    await loadOfficialSchedule(user);

    await clickOfficialLoadAgain(user);

    expect(confirm).not.toHaveBeenCalled();
    expect(scheduleFetchCalls()).toHaveLength(2);

    await editFirstCellToNoite(user);

    confirm.mockReturnValueOnce(false);
    await clickOfficialLoadAgain(user);

    expect(confirm).toHaveBeenCalledWith('Você tem alterações não publicadas nesta escala oficial. Recarregar vai descartá-las. Continuar?');
    expect(scheduleFetchCalls()).toHaveLength(2);
    const gridAfterCancel = await openGrid(user);
    expect(cell(gridAfterCancel, 1)).toHaveAccessibleName(/Noite/);

    confirm.mockReturnValueOnce(true);
    await clickOfficialLoadAgain(user);

    expect(scheduleFetchCalls()).toHaveLength(3);
    const gridAfterAccept = await openGrid(user);
    expect(cell(gridAfterAccept, 1)).toHaveAccessibleName(/Manhã/);
  });
});
