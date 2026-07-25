import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppButton } from '../src/components/ui/AppButton';

describe('AppButton', () => {
  it('usa type="button" por padrão, sem submeter formulários sem querer', () => {
    render(<AppButton>Salvar</AppButton>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveAttribute('type', 'button');
  });

  it('permite override explícito para type="submit"', () => {
    render(<AppButton type="submit">Cadastrar</AppButton>);
    expect(screen.getByRole('button', { name: 'Cadastrar' })).toHaveAttribute('type', 'submit');
  });

  it.each([
    ['default', 'btn'],
    ['primary', 'btn btn-primary'],
    ['ghost', 'btn btn-ghost'],
    ['danger', 'btn btn-danger'],
  ] as const)('variante %s gera exatamente as classes existentes', (variant, expectedClass) => {
    render(<AppButton variant={variant}>Ação</AppButton>);
    expect(screen.getByRole('button', { name: 'Ação' })).toHaveClass(...expectedClass.split(' '));
  });

  it('iconOnly usa a classe icon-btn (e icon-btn danger quando perigoso)', () => {
    render(<AppButton iconOnly variant="danger" aria-label="Remover">×</AppButton>);
    const button = screen.getByRole('button', { name: 'Remover' });
    expect(button).toHaveClass('icon-btn', 'danger');
    expect(button).not.toHaveClass('btn');
  });

  it('loading desabilita o botão, marca aria-busy e preserva texto acessível', () => {
    render(<AppButton loading>Publicar</AppButton>);
    const button = screen.getByRole('button', { name: 'Publicar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('disabled explícito continua funcionando', () => {
    render(<AppButton disabled>Publicar</AppButton>);
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  });

  it('preserva handlers e o atributo title (tooltip nativo)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AppButton title="Fechar" onClick={onClick}>X</AppButton>);
    const button = screen.getByRole('button', { name: 'X' });
    expect(button).toHaveAttribute('title', 'Fechar');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('não dispara onClick quando loading ou disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AppButton loading onClick={onClick}>Publicar</AppButton>);
    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
