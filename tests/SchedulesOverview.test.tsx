import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchedulesOverview } from '../src/components/SchedulesOverview';
import type { Team } from '../src/types';

const teams: Team[] = [
  { id: 'soc', code: 'SOC', name: 'SOC — Escala 6x1', responsibleLogin: 'gestor', scheduleKind: 'REGULAR', active: true, allowedImportLayouts: [] },
  { id: 'noc', code: 'NOC', name: 'NOC — Escala 6x1', responsibleLogin: 'gestor', scheduleKind: 'REGULAR', active: true, allowedImportLayouts: [] },
];

describe('SchedulesOverview', () => {
  it('pesquisa e abre somente equipes recebidas do catálogo', async () => {
    const user = userEvent.setup(); const onOpen = vi.fn();
    render(<SchedulesOverview teams={teams} selectedTeamId="soc" onSelectTeam={vi.fn()} onCreate={vi.fn()} onOpen={onOpen} />);
    await user.type(screen.getByPlaceholderText('Nome ou código'), 'NOC');
    expect(screen.queryByText('SOC — Escala 6x1')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abrir equipe' }));
    expect(onOpen).toHaveBeenCalledWith('noc');
  });
});
