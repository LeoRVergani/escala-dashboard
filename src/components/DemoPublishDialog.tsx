import type { DemoPublicationPackage } from '../lib/demoWorkspace/dto';
import type { DemoWorkspaceDiff } from '../lib/demoWorkspace/diff';
import type { DemoRemoteBusy, DemoRemoteError, DemoValidationResult } from '../hooks/useDemoRemotePublication';

interface DemoPublishDialogProps {
  draftPackage: DemoPublicationPackage;
  validation: DemoValidationResult;
  diff: DemoWorkspaceDiff | null;
  busy: DemoRemoteBusy;
  lastError: DemoRemoteError | null;
  onCancel: () => void;
  onPublish: () => void;
}

export function DemoPublishDialog({
  draftPackage,
  validation,
  diff,
  busy,
  lastError,
  onCancel,
  onPublish,
}: DemoPublishDialogProps) {
  const managerChanges = diff ? diff.managerAssignmentsAdded + diff.managerAssignmentsChanged : 0;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="demo-publish-dialog" role="dialog" aria-modal="true" aria-label="Publicar Ambiente de Demonstração">
        <h2>Publicar Ambiente de Demonstração</h2>
        <dl>
          <dt>Workspace</dt><dd>{draftPackage.workspace.workspaceId}</dd>
          <dt>Revisão ativa</dt><dd>{validation.currentActiveRevision}</dd>
          <dt>Próxima revisão</dt><dd>{validation.nextPublicationRevision}</dd>
          <dt>Equipes</dt><dd>{draftPackage.teams.length}</dd>
          <dt>Membros</dt><dd>{draftPackage.members.length}</dd>
          <dt>Responsáveis</dt><dd>{draftPackage.teamManagerAssignments.length}</dd>
          <dt>Períodos</dt><dd>{draftPackage.schedulePeriods.length}</dd>
          <dt>Atribuições</dt><dd>{draftPackage.scheduleAssignments.length}</dd>
          <dt>Solicitações</dt><dd>{draftPackage.scheduleChangeRequests.length}</dd>
          <dt>Atribuições alteradas</dt><dd>{diff?.scheduleAssignmentsChanged ?? 0}</dd>
          <dt>Responsáveis alterados</dt><dd>{managerChanges}</dd>
          <dt>Dados de produção afetados</dt><dd>0</dd>
        </dl>
        {lastError && <p className="publication-error" role="alert">{lastError.message}</p>}
        <div className="modal-actions">
          <button className="btn" disabled={busy !== 'IDLE'} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy !== 'IDLE'} onClick={onPublish}>Publicar</button>
        </div>
      </section>
    </div>
  );
}
