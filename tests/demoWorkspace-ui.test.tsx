import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

// FASE 14E: carregar o Ambiente Demo agora leva à seção de gestão ("Ambiente Demo"), não
// mais direto à grade - a grade (com os botões Remover/Adicionar testados aqui) vira uma
// seção própria ("Grade"), alcançável por um clique extra na navegação principal. O
// banner "AMBIENTE DE DEMONSTRAÇÃO" continua global (visível em qualquer seção).
async function renderWithDemoWorkspace() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /^ambiente de demonstração$/i }));
  await screen.findByText('AMBIENTE DE DEMONSTRAÇÃO');
  await user.click(screen.getByRole('tab', { name: 'Grade' }));
  return { user };
}

describe('workspace Demo — composição de membros fixa', () => {
  it('bloqueia remover técnico e mostra aviso, sem alterar a escala', async () => {
    const { user } = await renderWithDemoWorkspace();

    const removeButtons = screen.getAllByRole('button', { name: /^Remover /i });
    expect(removeButtons.length).toBeGreaterThan(0);
    const countBefore = removeButtons.length;

    await user.click(removeButtons[0]);

    expect(await screen.findByText(/composição de membros do ambiente de demonstração é fixa/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Remover /i })).toHaveLength(countBefore);
  });

  it('bloqueia adicionar técnico e mostra aviso', async () => {
    const { user } = await renderWithDemoWorkspace();

    const loginInput = screen.getByLabelText(/login do novo técnico/i);
    await user.type(loginInput, 'novo.tecnico');
    await user.click(screen.getByRole('button', { name: /^adicionar$/i }));

    expect(await screen.findByText(/composição de membros do ambiente de demonstração é fixa/i)).toBeInTheDocument();
    expect(screen.queryByText('novo.tecnico')).not.toBeInTheDocument();
  });
});
