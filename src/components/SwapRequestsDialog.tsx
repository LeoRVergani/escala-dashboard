import type { ShiftSwapRequest, Team } from '../types';

export function SwapRequestsDialog({ requests, teams, busy, onClose, onDecide }: { requests: ShiftSwapRequest[]; teams: Team[]; busy: boolean; onClose: () => void; onDecide: (request: ShiftSwapRequest, decision: 'APPROVED' | 'REJECTED') => void }) {
  return <div className="modal-backdrop" role="presentation"><section className="swap-dialog" role="dialog" aria-modal="true" aria-label="Solicitações de troca"><h2>Solicitações de troca</h2>
    {!requests.length ? <p>Nenhuma solicitação pendente para seus times.</p> : <div className="swap-list">{requests.map((request) => <article key={request.id}><strong>{request.requesterLogin}</strong><span>{teams.find((team) => team.id === request.teamId)?.name ?? request.teamId}</span><span>Assignment atual: {request.requesterAssignmentId}</span><span>Troca: {request.requestedAssignmentId ?? request.requestedLogin ?? 'alteração manual'}</span><p>{request.reason}</p><div><button className="btn" disabled={busy} onClick={() => onDecide(request, 'REJECTED')}>Rejeitar</button><button className="btn btn-primary" disabled={busy} onClick={() => onDecide(request, 'APPROVED')}>Aprovar</button></div></article>)}</div>}
    <div className="modal-actions"><button className="btn" onClick={onClose}>Fechar</button></div>
  </section></div>;
}
