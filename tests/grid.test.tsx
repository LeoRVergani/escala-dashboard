import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

/** Sobe o App já com a demonstração carregada e devolve a grade. */
async function renderWithDemo() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /carregar demonstração/i }));
  const grid = await screen.findByRole('grid', { name: /grade mensal/i });
  return { user, grid };
}

/** Botão da célula "Dia N, Fulano: Turno". */
const cell = (grid: HTMLElement, who: RegExp, day: number) =>
  within(grid).getByRole('button', {
    name: new RegExp(`^Dia ${day}, [^:]*${who.source}`, 'i'),
  });

/** Cabeçalho diário em duas linhas DD/MM + abreviação da semana. */
const dayHeader = (grid: HTMLElement, day: number) => {
  const th = within(grid)
    .getAllByRole('columnheader')
    .find((h) => new RegExp(`^${String(day).padStart(2, '0')}/\\d{2}(Dom|Seg|Ter|Qua|Qui|Sex|Sáb)$`).test(h.textContent ?? ''));
  if (!th) throw new Error(`Cabeçalho do dia ${day} não encontrado`);
  return th;
};

describe('grade de escalas (via App)', () => {
  it('carrega a demonstração com aviso de dados fictícios', async () => {
    const { grid } = await renderWithDemo();
    expect(screen.getAllByText(/dados fictícios/i).length).toBeGreaterThan(0);
    expect(within(grid).getByText(/Ana Ferreira/)).toBeInTheDocument();
    expect(within(grid).getByText('carla.souza')).toBeInTheDocument();
  });

  it('altera uma célula pelo menu e desfaz/refaz', async () => {
    const { user, grid } = await renderWithDemo();

    await user.click(cell(grid, /Carla Souza/, 3));
    const menu = await screen.findByRole('menu', { name: /turno da célula/i });
    await user.click(within(menu).getByRole('menuitem', { name: /Noite/ }));
    expect(cell(grid, /Carla Souza/, 3)).toHaveAccessibleName(/Noite/);

    await user.click(screen.getByRole('button', { name: /^desfazer$/i }));
    expect(cell(grid, /Carla Souza/, 3)).not.toHaveAccessibleName(/Noite/);

    await user.click(screen.getByRole('button', { name: /^refazer$/i }));
    expect(cell(grid, /Carla Souza/, 3)).toHaveAccessibleName(/Noite/);
  });

  it('aplica turno personalizado preservando o texto', async () => {
    const { user, grid } = await renderWithDemo();
    await user.click(cell(grid, /Diego Alves/, 5));
    const menu = await screen.findByRole('menu', { name: /turno da célula/i });
    await user.type(within(menu).getByRole('textbox', { name: /personalizado/i }), 'Treinamento');
    await user.click(within(menu).getByRole('button', { name: /^OK$/i }));
    expect(cell(grid, /Diego Alves/, 5)).toHaveAccessibleName(/Treinamento/);
  });

  it('copia um dia inteiro para outro dia', async () => {
    const { user, grid } = await renderWithDemo();

    // Demo: Ana = 12x36 (dia 1 Plantão, dia 2 Folga).
    expect(cell(grid, /Ana Ferreira/, 1)).toHaveAccessibleName(/Plantão/);
    expect(cell(grid, /Ana Ferreira/, 2)).toHaveAccessibleName(/Folga/);

    await user.click(dayHeader(grid, 1));
    await user.click(await screen.findByRole('button', { name: /^copiar dia$/i }));

    await user.click(dayHeader(grid, 2));
    await user.click(await screen.findByRole('button', { name: /colar dia copiado/i }));

    expect(cell(grid, /Ana Ferreira/, 2)).toHaveAccessibleName(/Plantão/);
    expect(cell(grid, /Bruno Lima/, 2)).toHaveAccessibleName(/Folga/); // Bruno dia 1 era Folga
  });

  it('preenche uma seleção múltipla clicando na legenda', async () => {
    const { user, grid } = await renderWithDemo();

    // Ctrl-clique não abre o menu: monta a seleção {dia 20, dia 21} da Ana.
    fireEvent.click(cell(grid, /Ana Ferreira/, 20), { ctrlKey: true });
    fireEvent.click(cell(grid, /Ana Ferreira/, 21), { ctrlKey: true });

    await user.click(screen.getByRole('button', { name: /FE · Férias/ }));
    expect(cell(grid, /Ana Ferreira/, 20)).toHaveAccessibleName(/Férias/);
    expect(cell(grid, /Ana Ferreira/, 21)).toHaveAccessibleName(/Férias/);
  });

  it('limpa a seleção com o botão da barra', async () => {
    const { user, grid } = await renderWithDemo();
    fireEvent.click(cell(grid, /Carla Souza/, 4), { ctrlKey: true });
    await user.click(screen.getByRole('button', { name: /limpar seleção/i }));
    expect(cell(grid, /Carla Souza/, 4)).toHaveAccessibleName(/Vazio/);
  });

  it('adiciona técnico informando apenas o login', async () => {
    const { user, grid } = await renderWithDemo();
    await user.type(
      within(grid).getByRole('textbox', { name: /login do novo técnico/i }),
      'novo.login',
    );
    await user.click(within(grid).getByRole('button', { name: /^adicionar$/i }));
    expect(within(grid).getByText('novo.login')).toBeInTheDocument();
    expect(cell(grid, /novo\.login/, 15)).toHaveAccessibleName(/Vazio/);
  });

  it('remove técnico', async () => {
    const { user, grid } = await renderWithDemo();
    await user.click(within(grid).getByRole('button', { name: /^remover fabio\.rocha$/i }));
    expect(within(grid).queryByText('fabio.rocha')).not.toBeInTheDocument();
  });

  it('mostra alertas de conflito da demonstração', async () => {
    await renderWithDemo();
    const chip = screen.getByRole('button', { name: /alertas/i });
    expect(chip.textContent).toMatch(/Alertas: [1-9]/);
  });

  it('mantém a publicação Firebase desativada na interface', async () => {
    await renderWithDemo();
    expect(screen.queryByRole('button', { name: /publicar/i })).not.toBeInTheDocument();
  });
});
