import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppAlert } from '../src/components/ui/AppAlert';

describe('AppAlert', () => {
  it.each([
    ['error', 'alert'],
    ['warning', 'alert'],
    ['info', 'status'],
    ['success', 'status'],
  ] as const)('variante %s usa role="%s"', (variant, role) => {
    render(<AppAlert variant={variant}>Mensagem</AppAlert>);
    expect(screen.getByRole(role)).toHaveTextContent('Mensagem');
  });

  it('aplica as classes app-alert e app-alert--<variante>', () => {
    render(<AppAlert variant="warning">Cuidado</AppAlert>);
    expect(screen.getByText('Cuidado')).toHaveClass('app-alert', 'app-alert--warning');
  });
});
