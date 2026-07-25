import type { ReactNode } from 'react';

export type AppAlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AppAlertProps {
  variant: AppAlertVariant;
  children: ReactNode;
}

/**
 * Substitui os parágrafos soltos de aviso/erro (`.publication-error`,
 * `.official-wizard-warning` etc.) sem mudar o conteúdo real - só a apresentação.
 * Ver spec 13.
 */
export function AppAlert({ variant, children }: AppAlertProps) {
  return (
    <p className={`app-alert app-alert--${variant}`} role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
