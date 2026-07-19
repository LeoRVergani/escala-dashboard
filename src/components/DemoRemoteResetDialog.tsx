import type { DemoFirebaseAdminStatus, DemoRemoteBusy, DemoRemoteError } from '../hooks/useDemoRemotePublication';

interface DemoRemoteResetDialogProps {
  firebaseAdminStatus: DemoFirebaseAdminStatus | null;
  busy: DemoRemoteBusy;
  lastError: DemoRemoteError | null;
  onCancel: () => void;
  onReset: () => void;
}

export function DemoRemoteResetDialog({
  firebaseAdminStatus,
  busy,
  lastError,
  onCancel,
  onReset,
}: DemoRemoteResetDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="demo-remote-reset-dialog" role="dialog" aria-modal="true" aria-label="Restaurar Demo publicado no Firebase">
        <h2>Restaurar Demo publicado no Firebase</h2>
        <p>
          Isto substitui a revisão ativa no Firebase (revisão {firebaseAdminStatus?.activePublicationRevision ?? '—'})
          {' '}
          pela fixture oficial do demo-v1, criando uma NOVA revisão. Não afeta o rascunho local deste navegador nem qualquer dado de produção.
        </p>
        {lastError && <p className="publication-error" role="alert">{lastError.message}</p>}
        <div className="modal-actions">
          <button className="btn" disabled={busy !== 'IDLE'} onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy !== 'IDLE'} onClick={onReset}>Restaurar no Firebase</button>
        </div>
      </section>
    </div>
  );
}
