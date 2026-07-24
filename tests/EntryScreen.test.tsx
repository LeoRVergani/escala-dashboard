import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntryScreen } from '../src/components/EntryScreen';

describe('EntryScreen', () => {
  it('mantém o acesso de teste recolhido e chama o login real', async () => {
    const user = userEvent.setup(); const onLogin = vi.fn();
    render(<EntryScreen configured loading={false} error={null} devEnabled onLogin={onLogin} onDevLogin={vi.fn(async () => undefined)} />);
    expect(screen.queryByLabelText('Login de teste')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Entrar com Microsoft' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Acessar ambiente de teste' }));
    expect(screen.getByLabelText('Login de teste')).toBeInTheDocument();
  });

  it('mostra erro e não habilita login quando o serviço não está configurado', () => {
    render(<EntryScreen configured={false} loading={false} error="Sessão expirada." devEnabled={false} onLogin={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Sessão expirada.');
    expect(screen.getByRole('button', { name: 'Entrar com Microsoft' })).toBeDisabled();
  });
});
