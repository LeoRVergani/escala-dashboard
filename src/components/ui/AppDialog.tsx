import { useEffect, useRef, type ReactNode } from 'react';
import { AppButton } from './AppButton';
import { CloseIcon } from '../icons';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useModalBehavior(open: boolean, panelRef: React.RefObject<HTMLElement>, onClose: () => void) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable && focusable.length > 0 ? focusable[0] : panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose, panelRef]);
}

interface AppDialogProps {
  open?: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  panelClassName?: string;
  closeOnBackdropClick?: boolean;
  hideCloseButton?: boolean;
  labelledById?: string;
}

/**
 * Base de qualquer modal do dashboard - nunca montar `.modal-backdrop`/painel na mão.
 * Cobre backdrop, foco inicial, focus trap, Escape, devolução de foco, bloqueio de
 * scroll do fundo e ARIA (ver spec 13). `AppConfirm` é a especialização mais comum.
 */
export function AppDialog({
  open = true,
  onClose,
  title,
  description,
  children,
  footer,
  panelClassName,
  closeOnBackdropClick = true,
  hideCloseButton = false,
  labelledById,
}: AppDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalBehavior(open, panelRef, onClose);

  if (!open) return null;

  const titleId = labelledById ?? 'app-dialog-title';

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (closeOnBackdropClick && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={panelClassName ?? 'app-dialog'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="app-dialog__head">
          <h2 id={titleId}>{title}</h2>
          {!hideCloseButton && (
            <AppButton iconOnly title="Fechar" aria-label="Fechar" onClick={onClose} icon={<CloseIcon width={16} height={16} />} />
          )}
        </div>
        {description && <p className="app-dialog__description">{description}</p>}
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}
