import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppConfirm } from '../src/components/ui/AppConfirm';

describe('AppConfirm', () => {
  it('mostra título, resumo e confirma/cancela preservando os handlers', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <AppConfirm
        title="Publicar escala"
        confirmLabel="Publicar"
        onCancel={onCancel}
        onConfirm={onConfirm}
        summary={[{ label: 'Equipe', value: 'SOC' }]}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Publicar escala' })).toBeInTheDocument();
    expect(screen.getByText('Equipe')).toBeInTheDocument();
    expect(screen.getByText('SOC')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('estado loading desabilita cancelar e mostra o botão de confirmar ocupado', () => {
    render(
      <AppConfirm title="Publicar escala" confirmLabel="Publicar" busy onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publicar' })).toHaveAttribute('aria-busy', 'true');
  });

  it('variante de perigo aplica btn-danger no botão de confirmação', () => {
    render(
      <AppConfirm title="Remover" confirmLabel="Remover" danger onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Remover' })).toHaveClass('btn-danger');
  });

  it('ação secundária opcional aparece e dispara seu próprio handler', async () => {
    const user = userEvent.setup();
    const onSecondary = vi.fn();
    render(
      <AppConfirm
        title="Publicar escala"
        confirmLabel="Substituir"
        secondaryAction={{ label: 'Atualizar período existente', onClick: onSecondary }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Atualizar período existente' }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });
});
