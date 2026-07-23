import type { DemoPublicationPackage } from '../lib/demoWorkspace/dto';
import type { OfficialCorporateLink } from '../lib/officialWorkspace/retarget';
import { isOfficialLinkEligible, validateCorporateLinkLocally } from '../lib/officialWorkspace/retarget';
import type {
  OfficialBackendStatus,
  OfficialFirebaseAdminStatus,
  OfficialRemoteBusy,
  OfficialRemoteError,
  OfficialValidationResult,
} from '../hooks/useOfficialRemotePublication';
import { OfficialCorporateLinkForm } from './OfficialCorporateLinkForm';

interface OfficialPublicationPanelProps {
  officialPackage: DemoPublicationPackage;
  corporateLink: Partial<OfficialCorporateLink>;
  onCorporateLinkChange: (link: Partial<OfficialCorporateLink>) => void;
  backendStatus: OfficialBackendStatus;
  firebaseAdminStatus: OfficialFirebaseAdminStatus | null;
  validation: OfficialValidationResult | null;
  busy: OfficialRemoteBusy;
  lastError: OfficialRemoteError | null;
  onValidate: () => void;
  onPublishClick: () => void;
}

function firebaseAdminLabel(status: OfficialFirebaseAdminStatus | null): string {
  if (!status) return 'Indisponível';
  return status.configured ? 'Configurado' : 'Não configurado';
}

export function OfficialPublicationPanel({
  officialPackage,
  corporateLink,
  onCorporateLinkChange,
  backendStatus,
  firebaseAdminStatus,
  validation,
  busy,
  lastError,
  onValidate,
  onPublishClick,
}: OfficialPublicationPanelProps) {
  const writeEnabled = firebaseAdminStatus?.allowOfficialFirestoreWrite === true;
  const linkError = validateCorporateLinkLocally(officialPackage, corporateLink)
    ?? (corporateLink.memberId && corporateLink.teamId && !isOfficialLinkEligible(officialPackage, corporateLink)
      ? 'O vínculo selecionado usa dados do Ambiente Demo, incompatíveis com o workspace ici-dev.'
      : null);
  const canValidate = backendStatus === 'ONLINE' && busy === 'IDLE' && !linkError;
  const canPublish = backendStatus === 'ONLINE'
    && firebaseAdminStatus?.configured === true
    && writeEnabled
    && !linkError
    && busy === 'IDLE';

  return (
    <section className="official-publication-panel" aria-label="Publicação Oficial">
      <div className="official-publication-head">
        <h2>PUBLICAÇÃO OFICIAL — workspace ici-dev</h2>
        <span>{busy === 'IDLE' ? 'Pronto' : 'Processando'}</span>
      </div>
      <dl>
        <div><dt>Revisão ativa em ici-dev</dt><dd>{firebaseAdminStatus?.activePublicationRevision ?? '—'}</dd></div>
        <div><dt>Status do backend</dt><dd>{backendStatus}</dd></div>
        <div><dt>Status Firebase Admin</dt><dd>{firebaseAdminLabel(firebaseAdminStatus)}</dd></div>
      </dl>
      <OfficialCorporateLinkForm pkg={officialPackage} link={corporateLink} onChange={onCorporateLinkChange} />
      {linkError && <p className="official-publication-link-error" role="alert">{linkError}</p>}
      <div className="official-publication-actions">
        <button className="btn" disabled={!canValidate} onClick={onValidate}>Executar dry-run</button>
        <button className="btn btn-primary" disabled={!canPublish} onClick={onPublishClick}>
          Publicar oficialmente
        </button>
      </div>
      {!writeEnabled && (
        <p className="official-publication-disabled" role="status">
          Publicação oficial desabilitada neste ambiente.
        </p>
      )}
      {validation && (
        <div className="official-publication-validation" role="status">
          <strong>Última validação: {validation.status}</strong>
          <span>Revisão ativa: {validation.currentActiveRevision}</span>
          <span>Próxima revisão: {validation.nextPublicationRevision}</span>
          <span>Checksum: {validation.checksumStatus}</span>
          <span>
            Equipes: {validation.counts.teams ?? 0}
            {' · '}
            Membros: {validation.counts.members ?? 0}
            {' · '}
            Períodos: {validation.counts.schedulePeriods ?? 0}
            {' · '}
            Atribuições: {validation.counts.scheduleAssignments ?? 0}
          </span>
        </div>
      )}
      {lastError && <p className="official-publication-error" role="alert">{lastError.message}</p>}
    </section>
  );
}
