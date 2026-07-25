import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppDrawer } from '../src/components/ui/AppDrawer';

describe('AppDrawer', () => {
  it('modo inline não tem backdrop nem trata Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <AppDrawer mode="inline" title="Alertas" onClose={onClose}>conteúdo</AppDrawer>,
    );
    expect(container.querySelector('.modal-backdrop')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('modo overlay tem backdrop e fecha com Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <AppDrawer mode="overlay" title="Alertas" onClose={onClose}>conteúdo</AppDrawer>,
    );
    expect(container.querySelector('.modal-backdrop')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lado configurável aplica a classe correspondente', () => {
    render(<AppDrawer side="left" ariaLabel="Painel">conteúdo</AppDrawer>);
    expect(screen.getByLabelText('Painel')).toHaveClass('app-drawer--left');
  });

  it('encaminha ref para o elemento raiz (uso com scroll/foco programático)', () => {
    const ref = createRef<HTMLElement>();
    render(<AppDrawer ref={ref} ariaLabel="Painel">conteúdo</AppDrawer>);
    expect(ref.current).toBe(screen.getByLabelText('Painel'));
  });

  it('não renderiza quando open=false', () => {
    render(<AppDrawer open={false} ariaLabel="Painel">conteúdo</AppDrawer>);
    expect(screen.queryByLabelText('Painel')).not.toBeInTheDocument();
  });
});
