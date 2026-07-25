import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SwapRequestsDialog } from '../src/components/SwapRequestsDialog';
import type { ShiftSwapRequest, Team } from '../src/types';

const team: Team = {
  id: 'soc', name: 'SOC', code: 'SOC', active: true, scheduleKind: 'REGULAR', responsibleLogin: 'lider', allowedImportLayouts: [],
};

function makeRequest(overrides: Partial<ShiftSwapRequest>): ShiftSwapRequest {
  return {
    id: 'r1',
    teamId: 'soc',
    periodId: 'p1',
    requesterMemberId: 'm1',
    requesterLogin: 'ana',
    requesterAssignmentId: 'a1',
    reason: 'motivo',
    status: 'PENDING',
    createdAt: null,
    ...overrides,
  } as ShiftSwapRequest;
}

describe('SwapRequestsDialog', () => {
  it('mostra as 4 abas de status e a contagem de pendentes', () => {
    const requests = [makeRequest({ id: 'r1', status: 'PENDING' }), makeRequest({ id: 'r2', status: 'PENDING' })];
    render(<SwapRequestsDialog requests={requests} teams={[team]} busy={false} onClose={vi.fn()} onDecide={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /Pendentes/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: 'Aprovadas' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Recusadas' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Concluídas' })).toBeInTheDocument();
  });

  it('filtra a lista pela aba selecionada e mostra estado vazio próprio de cada aba', async () => {
    const user = userEvent.setup();
    const requests = [makeRequest({ id: 'r1', status: 'PENDING', requesterLogin: 'ana' })];
    render(<SwapRequestsDialog requests={requests} teams={[team]} busy={false} onClose={vi.fn()} onDecide={vi.fn()} />);
    expect(screen.getByText('ana')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Aprovadas' }));
    expect(screen.queryByText('ana')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhuma solicitação aprovada.')).toBeInTheDocument();
  });

  it('aprova/recusa só na aba Pendentes, preservando onDecide/onClose', async () => {
    const user = userEvent.setup();
    const onDecide = vi.fn();
    const onClose = vi.fn();
    const request = makeRequest({ status: 'PENDING' });
    render(<SwapRequestsDialog requests={[request]} teams={[team]} busy={false} onClose={onClose} onDecide={onDecide} />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(onDecide).toHaveBeenCalledWith(request, 'APPROVED');
    const closeButtons = screen.getAllByRole('button', { name: 'Fechar' });
    await user.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uma solicitação já aprovada não mostra mais os botões de decisão', async () => {
    const user = userEvent.setup();
    const request = makeRequest({ status: 'APPROVED', requesterLogin: 'bruno' });
    render(<SwapRequestsDialog requests={[request]} teams={[team]} busy={false} onClose={vi.fn()} onDecide={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'Aprovadas' }));
    expect(screen.getByText('bruno')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rejeitar' })).not.toBeInTheDocument();
  });

  it('desabilita aprovar/rejeitar enquanto busy', () => {
    const request = makeRequest({ status: 'PENDING' });
    render(<SwapRequestsDialog requests={[request]} teams={[team]} busy onClose={vi.fn()} onDecide={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rejeitar' })).toBeDisabled();
  });
});
