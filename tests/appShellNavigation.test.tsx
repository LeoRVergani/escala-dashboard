import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

/** Sobe o App e carrega o Test Drive (mesma sequência usada em tests/grid.test.tsx). */
async function renderWithTestDrive() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /test drive/i }));
  await user.click(screen.getByRole('button', { name: /SOC\/NOC/i }));
  await user.click(screen.getByRole('button', { name: /avançar/i }));
  await user.click(screen.getByRole('button', { name: /avançar/i }));
  await user.click(screen.getByRole('button', { name: /confirmar/i }));
  const grid = await screen.findByRole('grid', { name: /grade mensal/i });
  return { user, grid };
}

const cell = (grid: HTMLElement, who: RegExp, day: number) =>
  within(grid).getByRole('button', {
    name: new RegExp(`^Dia ${day}, [^:]*${who.source}`, 'i'),
  });

describe('AppShell — navegação principal integrada ao App (FASE 14E)', () => {
  it('volta à Início e retornar à Grade preserva a edição feita antes de navegar', async () => {
    const { user, grid } = await renderWithTestDrive();

    await user.click(cell(grid, /Analista SOC\/NOC Fictício 06/, 3));
    const menu = await screen.findByRole('menu', { name: /turno da célula/i });
    await user.click(within(menu).getByRole('menuitem', { name: /Noite/ }));
    expect(cell(grid, /Analista SOC\/NOC Fictício 06/, 3)).toHaveAccessibleName(/Noite/);

    // Navega para a Home e depois de volta para a Grade - nenhum recarregamento do App
    // acontece (é troca de seção, não de rota), então o rascunho em memória não é tocado.
    await user.click(screen.getByRole('tab', { name: 'Início' }));
    expect(screen.queryByRole('grid', { name: /grade mensal/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar escala vazia' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Grade' }));
    const gridAfterReturn = await screen.findByRole('grid', { name: /grade mensal/i });
    expect(cell(gridAfterReturn, /Analista SOC\/NOC Fictício 06/, 3)).toHaveAccessibleName(/Noite/);

    // Desfazer/refazer também continuam funcionando normalmente após a viagem de ida e volta.
    await user.click(screen.getByRole('button', { name: /^desfazer$/i }));
    expect(cell(gridAfterReturn, /Analista SOC\/NOC Fictício 06/, 3)).not.toHaveAccessibleName(/Noite/);
  }, 10_000);

  it('Ambiente Demo e Publicação Oficial nunca aparecem empilhados na mesma tela', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /^ambiente de demonstração$/i }));
    await screen.findByText('AMBIENTE DE DEMONSTRAÇÃO');
    expect(screen.getByText('Publicação do Ambiente de Demonstração')).toBeInTheDocument();
    expect(screen.queryByText('Publicação Oficial — workspace ici-dev')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Publicação Oficial' }));
    expect(screen.getByText('Publicação Oficial — workspace ici-dev')).toBeInTheDocument();
    expect(screen.queryByText('Publicação do Ambiente de Demonstração')).not.toBeInTheDocument();
    // O banner de ambiente é a única referência ao Demo que continua visível em qualquer
    // seção (indicador global de "em qual ambiente você está"), não o painel de gestão.
    expect(screen.getByText('AMBIENTE DE DEMONSTRAÇÃO')).toBeInTheDocument();
  });

  it('o modo compacto marca o shell inteiro e persiste em localStorage', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    expect(container.querySelector('.shell')).not.toHaveClass('ui-compact');
    await user.click(screen.getByLabelText('Modo compacto'));
    expect(container.querySelector('.shell')).toHaveClass('ui-compact');
    expect(localStorage.getItem('escala-dashboard:ui-compact')).toBe('true');
  });
});
