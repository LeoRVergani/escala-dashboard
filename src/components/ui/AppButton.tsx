import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type AppButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

interface AppButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: AppButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
  iconOnly?: boolean;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<AppButtonVariant, string> = {
  default: '',
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

/**
 * Único jeito de montar um botão no dashboard - nunca `<button className="btn ...">` solto.
 * Gera exatamente as classes `btn`/`btn-primary`/`btn-ghost`/`btn-danger`/`icon-btn` já
 * existentes em styles.css (ver spec 13) - zero CSS novo introduzido por este componente.
 */
export function AppButton({
  variant = 'default',
  loading = false,
  icon,
  iconOnly = false,
  disabled,
  children,
  ...rest
}: AppButtonProps) {
  const classes = [iconOnly ? 'icon-btn' : 'btn', !iconOnly && VARIANT_CLASS[variant], iconOnly && variant === 'danger' && 'danger']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="app-btn__spinner" aria-hidden="true" />}
      {!loading && icon}
      {children}
    </button>
  );
}
