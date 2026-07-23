import type { DemoPublicationPackage } from '../lib/demoWorkspace/dto';
import type {
  DemoBackendStatus,
  DemoFirebaseAdminStatus,
  DemoRemoteBusy,
  DemoRemoteError,
  DemoValidationResult,
} from '../hooks/useDemoRemotePublication';

interface DemoPublicationPanelProps {
  draftPackage: DemoPublicationPackage;
  localDraftRevision: number;
  dirty: boolean;
  backendStatus: DemoBackendStatus;
  firebaseAdminStatus: DemoFirebaseAdminStatus | null;
  validation: DemoValidationResult | null;
  busy: DemoRemoteBusy;
  lastError: DemoRemoteError | null;
  onValidate: () => void;
  onPublishClick: () => void;
  onResetClick: () => void;
}

function firebaseAdminLabel(status: DemoFirebaseAdminStatus | null): string {
  if (!status) return 'Indisponível';
  return status.configured ? 'Configurado' : 'Não configurado';
}

export function DemoPublicationPanel({
  localDraftRevision,
  dirty,
  backendStatus,
  firebaseAdminStatus,
  validation,
  busy,
  lastError,
  onValidate,
  onPublishClick,
  onResetClick,
}: DemoPublicationPanelProps) {
  const canValidate = backendStatus === 'ONLINE' && busy === 'IDLE';
  // Clicar em "Publicar no Firebase" sempre revalida o rascunho atual antes de abrir o modal
  // (ver App.tsx: openDemoPublishDialog) - por isso o gate aqui não depende de um resultado
  // de validação anterior, que poderia estar desatualizado em relação ao rascunho atual.
  const canPublish = backendStatus === 'ONLINE'
    && firebaseAdminStatus?.configured === true
    && (dirty || firebaseAdminStatus.activePublicationRevision == null || firebaseAdminStatus.activePublicationRevision === 0)
    && busy === 'IDLE';
  const canReset = backendStatus === 'ONLINE' && firebaseAdminStatus?.configured === true && busy === 'IDLE';

  return (
    <section className="demo-publication-panel" aria-label="Publicação do Ambiente de Demonstração">
      <div className="demo-publication-head">
        <h2>Publicação do Ambiente de Demonstração</h2>
        <span>{busy === 'IDLE' ? 'Pronto' : 'Processando'}</span>
      </div>
      <dl>
        <div><dt>Revisão local</dt><dd>{localDraftRevision}</dd></div>
        <div><dt>Revisão ativa no Firebase</dt><dd>{firebaseAdminStatus?.activePublicationRevision ?? '—'}</dd></div>
        <div><dt>Alterações</dt><dd>{dirty ? 'SIM' : 'NÃO'}</dd></div>
        <div><dt>Status do backend</dt><dd>{backendStatus}</dd></div>
        <div><dt>Status Firebase Admin</dt><dd>{firebaseAdminLabel(firebaseAdminStatus)}</dd></div>
      </dl>
      <div className="demo-publication-actions">
        <button className="btn" disabled={!canValidate} onClick={onValidate}>Validar publicação</button>
        <button className="btn btn-primary" disabled={!canPublish} onClick={onPublishClick}>Publicar no Firebase</button>
        <button className="btn" disabled={!canReset} onClick={onResetClick}>Restaurar Demo publicado</button>
      </div>
      {validation && (
        <div className="demo-publication-validation" role="status">
          <strong>Última validação: {validation.status}</strong>
          <span>Próxima revisão: {validation.nextPublicationRevision}</span>
          <span>Checksum: {validation.checksumStatus}</span>
          <span>
            Equipes: {validation.counts.teams ?? 0}
            {' · '}
            Membros: {validation.counts.members ?? 0}
            {' · '}
            Responsáveis: {validation.counts.teamManagerAssignments ?? 0}
            {' · '}
            Períodos: {validation.counts.schedulePeriods ?? 0}
            {' · '}
            Atribuições: {validation.counts.scheduleAssignments ?? 0}
            {' · '}
            Solicitações: {validation.counts.scheduleChangeRequests ?? 0}
          </span>
        </div>
      )}
      {lastError && <p className="demo-publication-error" role="alert">{lastError.message}</p>}
    </section>
  );
}
