import { forwardRef, useEffect, type ReactNode } from 'react';

interface AppDrawerProps {
  title?: string;
  side?: 'left' | 'right';
  /** `inline` (padrão): faz parte do fluxo da página, sem backdrop/focus trap - caso do
   * painel de alertas hoje. `overlay`: flutua sobre o conteúdo, com backdrop e Escape. */
  mode?: 'inline' | 'overlay';
  open?: boolean;
  onClose?: () => void;
  panelClassName?: string;
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * Painel lateral padrão (alertas, conflitos, detalhes) - nunca renderizado dentro de
 * linhas/células da Grade. Ver spec 13.
 */
export const AppDrawer = forwardRef<HTMLElement, AppDrawerProps>(function AppDrawer(
  { title, side = 'right', mode = 'inline', open = true, onClose, panelClassName, ariaLabel, children },
  ref,
) {
  useEffect(() => {
    if (mode !== 'overlay' || !open || !onClose) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mode, open, onClose]);

  if (!open) return null;

  const panel = (
    <section
      ref={ref}
      className={panelClassName ?? `app-drawer app-drawer--${side}`}
      aria-label={ariaLabel ?? title}
      tabIndex={-1}
    >
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );

  if (mode === 'inline') return panel;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      {panel}
    </div>
  );
});
