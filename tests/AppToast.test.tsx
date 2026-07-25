import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppToast } from '../src/components/ui/AppToast';

describe('AppToast', () => {
  it('não renderiza nada quando não há mensagem', () => {
    const { container } = render(<AppToast message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra a mensagem com role="status" quando presente', () => {
    render(<AppToast message="Rascunho salvo." />);
    expect(screen.getByRole('status')).toHaveTextContent('Rascunho salvo.');
  });
});
