import type { DemoPublicationPackage } from '../lib/demoWorkspace/dto';
import type { OfficialCorporateLink } from '../lib/officialWorkspace/retarget';
import type { OfficialRemoteBusy, OfficialRemoteError, OfficialValidationResult } from '../hooks/useOfficialRemotePublication';
import { AppConfirm } from './ui/AppConfirm';
import { AppAlert } from './ui/AppAlert';

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
  const busyState = busy !== 'IDLE';

  return (
    <AppConfirm
      title="Confirmar publicação oficial — ici-dev"
      cancelLabel="Cancelar"
      confirmLabel="Publicar oficialmente"
      busy={busyState}
      confirmDisabled={busyState}
      onCancel={onCancel}
      onConfirm={onPublish}
      summary={[
        { label: 'Workspace', value: officialPackage.workspace.workspaceId },
        { label: 'Revisão ativa', value: validation.currentActiveRevision },
        { label: 'Próxima revisão', value: validation.nextPublicationRevision },
        { label: 'Equipes', value: officialPackage.teams.length },
        { label: 'Membros', value: officialPackage.members.length },
        { label: 'Períodos', value: officialPackage.schedulePeriods.length },
        { label: 'Atribuições', value: officialPackage.scheduleAssignments.length },
        { label: 'Vínculo corporativo', value: `${member?.displayName ?? corporateLink.memberId} — ${team?.name ?? corporateLink.teamId}` },
      ]}
      warning={
        <AppAlert variant="warning">
          Esta ação grava um snapshot revisionado real em <code>workspaces/ici-dev</code> e promove o
          ponteiro de publicação. Confirme apenas se o dry-run acima já foi conferido.
        </AppAlert>
      }
      error={lastError ? <AppAlert variant="error">{lastError.message}</AppAlert> : undefined}
    />
  );
}
