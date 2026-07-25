import type { ShiftSwapRequest, Team } from '../types';
import { AppDialog } from './ui/AppDialog';
import { AppButton } from './ui/AppButton';

export function SwapRequestsDialog({ requests, teams, busy, onClose, onDecide }: { requests: ShiftSwapRequest[]; teams: Team[]; busy: boolean; onClose: () => void; onDecide: (request: ShiftSwapRequest, decision: 'APPROVED' | 'REJECTED') => void }) {
  return (
    <AppDialog
      open
      onClose={onClose}
      title="Solicitações de troca"
      panelClassName="app-dialog swap-dialog"
      footer={<AppButton onClick={onClose}>Fechar</AppButton>}
    >
      {!requests.length ? <p>Nenhuma solicitação pendente para seus times.</p> : <div className="swap-list">{requests.map((request) => <article key={request.id}><strong>{request.requesterLogin}</strong><span>{teams.find((team) => team.id === request.teamId)?.name ?? request.teamId}</span><span>Assignment atual: {request.requesterAssignmentId}</span><span>Troca: {request.requestedAssignmentId ?? request.requestedLogin ?? 'alteração manual'}</span><p>{request.reason}</p><div><AppButton disabled={busy} onClick={() => onDecide(request, 'REJECTED')}>Rejeitar</AppButton><AppButton variant="primary" disabled={busy} onClick={() => onDecide(request, 'APPROVED')}>Aprovar</AppButton></div></article>)}</div>}
    </AppDialog>
  );
}
