import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Home, type HomeSummary } from '../src/components/Home';
import type { Team } from '../src/types';

const summary: HomeSummary = { greeting: 'Olá', areaLabel: 'COSI', peopleCount: null, draftCount: 0, backendStatus: 'ONLINE' };
const teams: Team[] = [
  { id: 'soc', code: 'SOC', name: 'SOC — Escala 6x1', responsibleLogin: 'gestor', scheduleKind: 'REGULAR', active: true, allowedImportLayouts: [] },
  { id: 'noc', code: 'NOC', name: 'NOC — Escala 6x1', responsibleLogin: 'gestor', scheduleKind: 'REGULAR', active: true, allowedImportLayouts: [] },
];

function renderHome(overrides: Partial<ComponentProps<typeof Home>> = {}) {
  const handlers = { onSelectTeam: vi.fn(), onOpenTeam: vi.fn(), onCreate: vi.fn(), onLogin: vi.fn() };
  const utils = render(<Home summary={summary} teams={teams} selectedTeamId="soc" userName="Gestor" {...handlers} {...overrides} />);
  return { ...handlers, ...utils };
}

describe('Home — Minhas equipes', () => {
  it('renderiza equipes reais separadas e sem dados fixos de período', () => {
    renderHome();
    expect(screen.getByRole('heading', { name: 'SOC — Escala 6x1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'NOC — Escala 6x1' })).toBeInTheDocument();
    expect(screen.getAllByText('Não carregado').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Firebase Admin|workspace|dry-run/i)).not.toBeInTheDocument();
  });

  it('abre equipe e solicita novo período pelos callbacks reais', async () => {
    const user = userEvent.setup();
    const handlers = renderHome();
    await user.click(screen.getAllByRole('button', { name: 'Abrir equipe' })[0]);
    expect(handlers.onOpenTeam).toHaveBeenCalledWith('soc');
    await user.click(screen.getByRole('button', { name: 'Cadastrar período' }));
    expect(handlers.onCreate).toHaveBeenCalledWith('soc');
  });

  it('mostra estado vazio sem oferecer uma ação proibida', () => {
    renderHome({ teams: [] });
    expect(screen.getByRole('heading', { name: 'Nenhuma equipe disponível' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cadastrar período' })).toBeDisabled();
  });
});
