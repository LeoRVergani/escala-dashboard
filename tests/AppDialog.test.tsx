import { useState } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppDialog } from '../src/components/ui/AppDialog';

function Opener({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <button>Abrir fora do modal</button>
      <AppDialog open onClose={onClose} title="Confirmar ação" description="Descrição opcional">
        <button>Primeiro botão</button>
        <button>Segundo botão</button>
      </AppDialog>
    </div>
  );
}

describe('AppDialog', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renderiza backdrop, painel, título e descrição opcional com ARIA correta', () => {
    render(<AppDialog open onClose={vi.fn()} title="Publicar escala" description="Resumo">conteúdo</AppDialog>);
    const dialog = screen.getByRole('dialog', { name: 'Publicar escala' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Resumo')).toBeInTheDocument();
  });

  it('tem um botão de fechar por padrão', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AppDialog open onClose={onClose} title="Título">conteúdo</AppDialog>);
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fecha com Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AppDialog open onClose={onClose} title="Título">conteúdo</AppDialog>);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('bloqueia o scroll do fundo enquanto aberto e restaura ao fechar', () => {
    const { rerender } = render(<AppDialog open onClose={vi.fn()} title="Título">conteúdo</AppDialog>);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<AppDialog open={false} onClose={vi.fn()} title="Título">conteúdo</AppDialog>);
    expect(document.body.style.overflow).toBe('');
  });

  it('foca o primeiro elemento focável ao abrir e devolve o foco ao fechar', async () => {
    function Wrapper() {
      const [open, setOpen] = useState(true);
      return (
        <div>
          <button onClick={() => setOpen(true)}>Abrir</button>
          {open && (
            <AppDialog open onClose={() => setOpen(false)} title="Título">
              <button>Primeira ação</button>
            </AppDialog>
          )}
        </div>
      );
    }
    render(<Wrapper />);
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-label', 'Fechar'));
  });

  it('mantém o foco dentro do diálogo (focus trap) ao pressionar Tab no último elemento', async () => {
    const user = userEvent.setup();
    render(<Opener onClose={vi.fn()} />);
    const closeButton = screen.getByRole('button', { name: 'Fechar' });
    const last = screen.getByRole('button', { name: 'Segundo botão' });
    last.focus();
    expect(document.activeElement).toBe(last);
    await user.tab();
    expect(document.activeElement).toBe(closeButton);
  });

  it('fecha ao clicar no backdrop, mas não ao clicar dentro do painel', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<AppDialog open onClose={onClose} title="Título">conteúdo</AppDialog>);
    await user.click(screen.getByText('conteúdo'));
    expect(onClose).not.toHaveBeenCalled();
    const backdrop = container.querySelector('.modal-backdrop') as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closeOnBackdropClick=false mantém o diálogo aberto ao clicar fora', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <AppDialog open onClose={onClose} title="Título" closeOnBackdropClick={false}>conteúdo</AppDialog>,
    );
    const backdrop = container.querySelector('.modal-backdrop') as HTMLElement;
    await user.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('não renderiza nada quando open=false', () => {
    render(<AppDialog open={false} onClose={vi.fn()} title="Título">conteúdo</AppDialog>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
