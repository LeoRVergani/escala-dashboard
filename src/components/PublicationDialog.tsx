import type { PublicationMode } from '../lib/schedulePublishRepository';
import type { PublicationPreview } from '../lib/publicationPreview';
import type { Team } from '../types';
import { AppConfirm } from './ui/AppConfirm';
import { AppAlert } from './ui/AppAlert';

export function PublicationDialog({ preview, team, busy, onCancel, onPublish }: { preview: PublicationPreview; team: Team; busy: boolean; onCancel: () => void; onPublish: (mode: PublicationMode) => void }) {
  const count = preview.payload.assignments.length + preview.payload.onCallAssignments.length;
  const blocked = busy || preview.criticalErrors.length > 0;
  return (
    <AppConfirm
      title="Publicar escala"
      cancelLabel="Cancelar"
      confirmLabel={preview.existingPeriod ? 'Substituir escala existente' : 'Publicar'}
      busy={busy}
      confirmDisabled={blocked}
      onCancel={onCancel}
      onConfirm={() => onPublish(preview.existingPeriod ? 'replace' : 'update')}
      secondaryAction={preview.existingPeriod ? { label: 'Atualizar período existente', onClick: () => onPublish('update'), disabled: blocked } : undefined}
      summary={[
        { label: 'Equipe', value: team.name },
        { label: 'Responsável', value: team.responsibleLogin },
        { label: 'Período', value: `${preview.payload.period.startDate} a ${preview.payload.period.endDate}` },
        { label: 'Arquivo', value: preview.payload.period.sourceFileName ?? 'Criação manual' },
        { label: 'Técnicos', value: preview.payload.members.length },
        { label: preview.payload.kind === 'ON_CALL' ? 'Plantões' : 'Assignments', value: count },
        { label: 'Alertas', value: preview.alerts },
        { label: 'Destino', value: preview.existingPeriod ? `Período existente · ${preview.existingAssignments} registros` : 'Novo período' },
      ]}
      warning={preview.layoutWarning ? <AppAlert variant="warning">{preview.layoutWarning} Confirme somente se a associação estiver correta.</AppAlert> : undefined}
      error={preview.criticalErrors.length > 0 ? (
        <>{preview.criticalErrors.map((error) => <AppAlert key={error} variant="error">{error}</AppAlert>)}</>
      ) : undefined}
    />
  );
}
