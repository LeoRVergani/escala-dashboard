import type { PublicationMode } from '../lib/schedulePublishRepository';
import type { PublicationPreview } from '../lib/publicationPreview';
import type { Team } from '../types';

export function PublicationDialog({ preview, team, busy, onCancel, onPublish }: { preview: PublicationPreview; team: Team; busy: boolean; onCancel: () => void; onPublish: (mode: PublicationMode) => void }) {
  const count = preview.payload.assignments.length + preview.payload.onCallAssignments.length;
  return <div className="modal-backdrop" role="presentation"><section className="publication-dialog" role="dialog" aria-modal="true" aria-label="Confirmar publicação">
    <h2>Publicar escala</h2>
    <dl><dt>Time</dt><dd>{team.name}</dd><dt>Responsável</dt><dd>{team.responsibleLogin}</dd><dt>Período</dt><dd>{preview.payload.period.startDate} a {preview.payload.period.endDate}</dd><dt>Arquivo</dt><dd>{preview.payload.period.sourceFileName ?? 'Criação manual'}</dd><dt>Técnicos</dt><dd>{preview.payload.members.length}</dd><dt>{preview.payload.kind === 'ON_CALL' ? 'Plantões' : 'Assignments'}</dt><dd>{count}</dd><dt>Alertas</dt><dd>{preview.alerts}</dd><dt>Destino</dt><dd>{preview.existingPeriod ? `Período existente · ${preview.existingAssignments} registros` : 'Novo período'}</dd></dl>
    {preview.layoutWarning && <p className="publication-warning" role="alert">{preview.layoutWarning} Confirme somente se a associação estiver correta.</p>}
    {preview.criticalErrors.map((error) => <p className="publication-error" key={error}>{error}</p>)}
    <div className="modal-actions"><button className="btn" disabled={busy} onClick={onCancel}>Cancelar</button>{preview.existingPeriod && <button className="btn" disabled={busy || preview.criticalErrors.length > 0} onClick={() => onPublish('update')}>Atualizar período existente</button>}<button className="btn btn-primary" disabled={busy || preview.criticalErrors.length > 0} onClick={() => onPublish(preview.existingPeriod ? 'replace' : 'update')}>{preview.existingPeriod ? 'Substituir escala existente' : 'Publicar'}</button></div>
  </section></div>;
}
