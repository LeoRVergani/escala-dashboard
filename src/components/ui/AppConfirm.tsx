import type { ReactNode } from 'react';
import { AppDialog } from './AppDialog';
import { AppButton } from './AppButton';

interface SummaryItem {
  label: string;
  value: ReactNode;
}

interface SecondaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface AppConfirmProps {
  open?: boolean;
  title: string;
  message?: ReactNode;
  summary?: SummaryItem[];
  warning?: ReactNode;
  error?: ReactNode;
  busy?: boolean;
  cancelLabel?: string;
  confirmLabel: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  secondaryAction?: SecondaryAction;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
}

/**
 * Especialização de AppDialog para confirmar uma ação (publicar, aprovar/recusar troca
 * etc.) - título + resumo opcional + Cancelar/Confirmar. Ver spec 13.
 */
export function AppConfirm({
  open = true,
  title,
  message,
  summary,
  warning,
  error,
  busy = false,
  cancelLabel = 'Cancelar',
  confirmLabel,
  danger = false,
  confirmDisabled = false,
  secondaryAction,
  onCancel,
  onConfirm,
  children,
}: AppConfirmProps) {
  return (
    <AppDialog
      open={open}
      onClose={onCancel}
      title={title}
      description={message}
      panelClassName="app-dialog app-confirm"
      footer={
        <>
          <AppButton onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </AppButton>
          <span className="modal-actions-spacer" />
          {secondaryAction && (
            <AppButton onClick={secondaryAction.onClick} disabled={busy || secondaryAction.disabled}>
              {secondaryAction.label}
            </AppButton>
          )}
          <AppButton
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={busy}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </AppButton>
        </>
      }
    >
      {summary && summary.length > 0 && (
        <dl className="app-confirm__summary">
          {summary.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {warning}
      {error}
      {children}
    </AppDialog>
  );
}
