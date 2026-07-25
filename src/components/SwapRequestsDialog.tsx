import { useMemo, useState } from 'react';
import type { ShiftSwapRequest, SwapRequestStatus, Team } from '../types';
import { AppDialog } from './ui/AppDialog';
import { AppButton } from './ui/AppButton';

const TABS: { key: SwapRequestStatus; label: string }[] = [
  { key: 'PENDING', label: 'Pendentes' },
  { key: 'APPROVED', label: 'Aprovadas' },
  { key: 'REJECTED', label: 'Recusadas' },
  { key: 'CANCELLED', label: 'Concluídas' },
];

const EMPTY_MESSAGE: Record<SwapRequestStatus, string> = {
  PENDING: 'Nenhuma solicitação pendente para seus times.',
  APPROVED: 'Nenhuma solicitação aprovada.',
  REJECTED: 'Nenhuma solicitação recusada.',
  CANCELLED: 'Nenhuma solicitação concluída.',
};

export function SwapRequestsDialog({ requests, teams, busy, onClose, onDecide }: { requests: ShiftSwapRequest[]; teams: Team[]; busy: boolean; onClose: () => void; onDecide: (request: ShiftSwapRequest, decision: 'APPROVED' | 'REJECTED') => void }) {
  const [tab, setTab] = useState<SwapRequestStatus>('PENDING');
  const pendingCount = useMemo(() => requests.filter((request) => request.status === 'PENDING').length, [requests]);
  const filtered = useMemo(() => requests.filter((request) => request.status === tab), [requests, tab]);

  return (
    <AppDialog
      open
      onClose={onClose}
      title="Solicitações de troca"
      panelClassName="app-dialog swap-dialog"
      footer={<AppButton onClick={onClose}>Fechar</AppButton>}
    >
      <div className="swap-tabs" role="tablist" aria-label="Filtrar solicitações por status">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            className="btn"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
          >
            {item.label}
            {item.key === 'PENDING' && pendingCount > 0 && <span className="shell-nav-item-badge">{pendingCount}</span>}
          </button>
        ))}
      </div>
      {!filtered.length ? <p>{EMPTY_MESSAGE[tab]}</p> : <div className="swap-list">{filtered.map((request) => <article key={request.id}><strong>{request.requesterLogin}</strong><span>{teams.find((team) => team.id === request.teamId)?.name ?? request.teamId}</span><span>Assignment atual: {request.requesterAssignmentId}</span><span>Troca: {request.requestedAssignmentId ?? request.requestedLogin ?? 'alteração manual'}</span><p>{request.reason}</p>{tab === 'PENDING' && <div><AppButton disabled={busy} onClick={() => onDecide(request, 'REJECTED')}>Rejeitar</AppButton><AppButton variant="primary" disabled={busy} onClick={() => onDecide(request, 'APPROVED')}>Aprovar</AppButton></div>}</article>)}</div>}
    </AppDialog>
  );
}
