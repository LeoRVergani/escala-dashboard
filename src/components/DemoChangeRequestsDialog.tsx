import { useMemo } from 'react';
import type {
  DemoChangeRequestStatus,
  DemoChangeRequestType,
  DemoPublicationPackage,
} from '../lib/demoWorkspace/dto';

interface DemoChangeRequestsDialogProps {
  pkg: DemoPublicationPackage;
  onClose: () => void;
}

const REQUEST_TYPE_LABELS: Record<DemoChangeRequestType, string> = {
  SHIFT_CHANGE: 'Troca de turno',
  DAY_OFF_CHANGE: 'Troca de folga',
  SWAP_WITH_MEMBER: 'Troca com colega',
  SCHEDULE_CORRECTION: 'Correção de escala',
  OTHER: 'Outro',
};

const STATUS_LABELS: Record<DemoChangeRequestStatus, string> = {
  DRAFT: 'Rascunho',
  PENDING: 'Pendente',
  APPROVED: 'Aprovada',
  REJECTED: 'Recusada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Expirada',
};

function formatDateTime(value: string | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function DemoChangeRequestsDialog({ pkg, onClose }: DemoChangeRequestsDialogProps) {
  const membersById = useMemo(() => new Map(pkg.members.map((member) => [member.id, member])), [pkg.members]);
  const teamsById = useMemo(() => new Map(pkg.teams.map((team) => [team.id, team])), [pkg.teams]);
  const assignmentsById = useMemo(() => new Map(pkg.scheduleAssignments.map((assignment) => [assignment.id, assignment])), [pkg.scheduleAssignments]);
  const counts = useMemo(() => ({
    pending: pkg.scheduleChangeRequests.filter((request) => request.status === 'PENDING').length,
    approved: pkg.scheduleChangeRequests.filter((request) => request.status === 'APPROVED').length,
    rejected: pkg.scheduleChangeRequests.filter((request) => request.status === 'REJECTED').length,
    total: pkg.scheduleChangeRequests.length,
  }), [pkg.scheduleChangeRequests]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="demo-requests-dialog" role="dialog" aria-modal="true" aria-label="Solicitações Demo">
        <h2>Solicitações Demo</h2>

        <div className="demo-requests-counts" aria-label="Resumo de solicitações Demo">
          <span>Pendentes: {counts.pending}</span>
          <span>Aprovadas: {counts.approved}</span>
          <span>Recusadas: {counts.rejected}</span>
          <span>Total: {counts.total}</span>
        </div>

        <div className="demo-requests-list">
          {pkg.scheduleChangeRequests.map((request) => {
            const requester = membersById.get(request.requesterMemberId);
            const team = teamsById.get(request.requesterTeamId);
            const manager = membersById.get(request.assignedManagerMemberId);
            const resolvedBy = request.resolvedByMemberId ? membersById.get(request.resolvedByMemberId) : null;
            const assignment = request.assignmentId ? assignmentsById.get(request.assignmentId) : null;
            const hasResolution = (request.status === 'APPROVED' || request.status === 'REJECTED')
              && (request.resolvedAt || request.resolvedByMemberId || request.resolutionNote);

            return (
              <article className="demo-request-card" key={request.id}>
                <header>
                  <div>
                    <h3>{requester?.displayName ?? 'Solicitante não encontrado'}</h3>
                    <span>{team?.name ?? 'Equipe não encontrada'}</span>
                  </div>
                  <strong>{STATUS_LABELS[request.status]}</strong>
                </header>
                <dl>
                  <div><dt>Tipo</dt><dd>{REQUEST_TYPE_LABELS[request.requestType]}</dd></div>
                  {assignment && <div><dt>Data da escala</dt><dd>{assignment.date}</dd></div>}
                  <div><dt>Motivo</dt><dd>{request.reason}</dd></div>
                  <div><dt>Responsável designado</dt><dd>{manager?.displayName ?? 'Responsável não encontrado'}</dd></div>
                </dl>
                {hasResolution && (
                  <div className="demo-request-resolution">
                    <strong>Resolução</strong>
                    {request.resolvedAt && <span>Quando: {formatDateTime(request.resolvedAt)}</span>}
                    {resolvedBy && <span>Por: {resolvedBy.displayName}</span>}
                    {request.resolutionNote && <span>Nota: {request.resolutionNote}</span>}
                  </div>
                )}
                <div className="demo-request-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled
                    title="Aprovação será habilitada na FASE 14c-7."
                    aria-description="Aprovação será habilitada na FASE 14c-7."
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled
                    title="Aprovação será habilitada na FASE 14c-7."
                    aria-description="Aprovação será habilitada na FASE 14c-7."
                  >
                    Recusar
                  </button>
                  <small>Aprovação será habilitada na FASE 14c-7.</small>
                </div>
              </article>
            );
          })}
        </div>

        <div className="modal-actions">
          <span className="modal-actions-spacer" />
          <button type="button" className="btn" onClick={onClose}>Fechar</button>
        </div>
      </section>
    </div>
  );
}
