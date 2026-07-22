import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

/** Sobe o App já com a demonstração carregada e devolve a grade. */
async function renderWithDemo() {
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
    expect(within(grid).getByText(/Analista SOC\/NOC Fictício 01/)).toBeInTheDocument();
    expect(within(grid).getByText(/Analista SOC\/NOC Fictício 06/)).toBeInTheDocument();
  });

  it('mostra a legenda SOC canônica em duas seções e na ordem da spec', async () => {
    await renderWithDemo();
    const legend = screen.getByLabelText('Legenda e preenchimento rápido');
    const chipTexts = Array.from(legend.querySelectorAll('button.chip:not(.chip-clear)'))
      .map((button) => button.textContent?.trim());

    expect(within(legend).getByText('Turnos:')).toBeInTheDocument();
    expect(within(legend).getByText('Situações:')).toBeInTheDocument();
    expect(chipTexts).toEqual([
      'Md · Madrugada',
      'M · Manhã',
      'T · Tarde',
      'N · Noite',
      'DU · DSR — Dia útil',
      'DF · DSR — Final de semana',
      'BH · Compensação BH',
      'AN · Folga Aniversário',
      'X · Férias',
      '# · Afastamento/Atestado',
      'Folga · Folga — Feriado',
      'HE · Hora Extra',
    ]);
    expect(within(legend).queryByRole('button', { name: /^MAD · Madrugada$/ })).not.toBeInTheDocument();
    expect(within(legend).queryByRole('button', { name: /^F · Folga$/ })).not.toBeInTheDocument();
    expect(within(legend).queryByRole('button', { name: /^FE · Férias$/ })).not.toBeInTheDocument();
    expect(within(legend).queryByRole('button', { name: /^AF · Afastamento$/ })).not.toBeInTheDocument();
  });

  it('altera uma célula pelo menu e desfaz/refaz', async () => {
    const { user, grid } = await renderWithDemo();

    await user.click(cell(grid, /Analista SOC\/NOC Fictício 06/, 3));
    const menu = await screen.findByRole('menu', { name: /turno da célula/i });
    await user.click(within(menu).getByRole('menuitem', { name: /Noite/ }));
    expect(cell(grid, /Analista SOC\/NOC Fictício 06/, 3)).toHaveAccessibleName(/Noite/);

    await user.click(screen.getByRole('button', { name: /^desfazer$/i }));
    expect(cell(grid, /Analista SOC\/NOC Fictício 06/, 3)).not.toHaveAccessibleName(/Noite/);

    await user.click(screen.getByRole('button', { name: /^refazer$/i }));
    expect(cell(grid, /Analista SOC\/NOC Fictício 06/, 3)).toHaveAccessibleName(/Noite/);
  });

  it('aplica turno personalizado preservando o texto', async () => {
    const { user, grid } = await renderWithDemo();
    await user.click(cell(grid, /Analista SOC\/NOC Fictício 03/, 5));
    const menu = await screen.findByRole('menu', { name: /turno da célula/i });
    await user.type(within(menu).getByRole('textbox', { name: /personalizado/i }), 'Treinamento');
    await user.click(within(menu).getByRole('button', { name: /^OK$/i }));
    expect(cell(grid, /Analista SOC\/NOC Fictício 03/, 5)).toHaveAccessibleName(/Treinamento/);
  });

  it('copia um dia inteiro para outro dia', async () => {
    const { user, grid } = await renderWithDemo();

    expect(cell(grid, /Analista SOC\/NOC Fictício 01/, 1)).toHaveAccessibleName(/Folga/);
    expect(cell(grid, /Analista SOC\/NOC Fictício 02/, 1)).toHaveAccessibleName(/Madrugada/);

    await user.click(dayHeader(grid, 1));
    await user.click(await screen.findByRole('button', { name: /^copiar dia$/i }));

    await user.click(dayHeader(grid, 2));
    await user.click(await screen.findByRole('button', { name: /colar dia copiado/i }));

    expect(cell(grid, /Analista SOC\/NOC Fictício 01/, 2)).toHaveAccessibleName(/Folga/);
    expect(cell(grid, /Analista SOC\/NOC Fictício 02/, 2)).toHaveAccessibleName(/Madrugada/);
  });

  it('preenche uma seleção múltipla clicando na legenda', async () => {
    const { user, grid } = await renderWithDemo();

    fireEvent.click(cell(grid, /Analista SOC\/NOC Fictício 01/, 20), { ctrlKey: true });
    fireEvent.click(cell(grid, /Analista SOC\/NOC Fictício 01/, 21), { ctrlKey: true });

    await user.click(screen.getByRole('button', { name: /X · Férias/ }));
    expect(cell(grid, /Analista SOC\/NOC Fictício 01/, 20)).toHaveAccessibleName(/Férias/);
    expect(cell(grid, /Analista SOC\/NOC Fictício 01/, 21)).toHaveAccessibleName(/Férias/);
  });

  it('limpa a seleção com o botão da barra', async () => {
    const { user, grid } = await renderWithDemo();
    fireEvent.click(cell(grid, /Analista SOC\/NOC Fictício 06/, 4), { ctrlKey: true });
    await user.click(screen.getByRole('button', { name: /limpar seleção/i }));
    expect(cell(grid, /Analista SOC\/NOC Fictício 06/, 4)).toHaveAccessibleName(/Vazio/);
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
    await user.click(within(grid).getByRole('button', { name: /^remover Analista SOC\/NOC Fictício 09$/i }));
    expect(within(grid).queryByText('Analista SOC/NOC Fictício 09')).not.toBeInTheDocument();
  });

  it('mostra painel de alertas da demonstração', async () => {
    const { user } = await renderWithDemo();
    const chip = screen.getByRole('button', { name: /alertas/i });
    expect(chip.textContent).toMatch(/Alertas: 0/);
    await user.click(chip);
    expect(await screen.findByRole('region', { name: /alertas de conflito/i })).toHaveTextContent(/Nenhum conflito detectado/i);
  });

  it('não permite publicar sem autenticação/time e bloqueia dados de demonstração', async () => {
    await renderWithDemo();
    expect(screen.getByRole('button', { name: /publicar escala/i })).toBeDisabled();
  });
});
