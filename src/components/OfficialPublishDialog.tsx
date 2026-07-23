import type { DemoPublicationPackage } from '../lib/demoWorkspace/dto';
import type { OfficialCorporateLink } from '../lib/officialWorkspace/retarget';
import type { OfficialRemoteBusy, OfficialRemoteError, OfficialValidationResult } from '../hooks/useOfficialRemotePublication';

interface OfficialPublishDialogProps {
  officialPackage: DemoPublicationPackage;
  corporateLink: OfficialCorporateLink;
  validation: OfficialValidationResult;
  busy: OfficialRemoteBusy;
  lastError: OfficialRemoteError | null;
  onCancel: () => void;
  onPublish: () => void;
}

export function OfficialPublishDialog({
  officialPackage,
  corporateLink,
  validation,
  busy,
  lastError,
  onCancel,
  onPublish,
}: OfficialPublishDialogProps) {
  const member = officialPackage.members.find((item) => item.id === corporateLink.memberId);
  const team = officialPackage.teams.find((item) => item.id === corporateLink.teamId);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="official-publish-dialog" role="dialog" aria-modal="true" aria-label="Publicar workspace oficial ici-dev">
        <h2>Confirmar publicação oficial — ici-dev</h2>
        <dl>
          <dt>Workspace</dt><dd>{officialPackage.workspace.workspaceId}</dd>
          <dt>Revisão ativa</dt><dd>{validation.currentActiveRevision}</dd>
          <dt>Próxima revisão</dt><dd>{validation.nextPublicationRevision}</dd>
          <dt>Equipes</dt><dd>{officialPackage.teams.length}</dd>
          <dt>Membros</dt><dd>{officialPackage.members.length}</dd>
          <dt>Períodos</dt><dd>{officialPackage.schedulePeriods.length}</dd>
          <dt>Atribuições</dt><dd>{officialPackage.scheduleAssignments.length}</dd>
          <dt>Vínculo corporativo</dt>
          <dd>{member?.displayName ?? corporateLink.memberId} — {team?.name ?? corporateLink.teamId}</dd>
        </dl>
        <p className="official-publish-warning">
          Esta ação grava um snapshot revisionado real em <code>workspaces/ici-dev</code> e promove o
          ponteiro de publicação. Confirme apenas se o dry-run acima já foi conferido.
        </p>
        {lastError && <p className="publication-error" role="alert">{lastError.message}</p>}
        <div className="modal-actions">
          <button className="btn" disabled={busy !== 'IDLE'} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy !== 'IDLE'} onClick={onPublish}>
            Publicar oficialmente
          </button>
        </div>
      </section>
    </div>
  );
}
