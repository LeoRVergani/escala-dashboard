import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

async function renderWithN1() {
  const user = userEvent.setup();
  const rendered = render(<App />);
  const input = rendered.container.querySelector('input[type="file"]') as HTMLInputElement;
  const bytes = readFileSync(resolve('tests/fixtures/equipe-n1-ficticio.xls'));
  const file = new File([bytes], 'equipe-n1-ficticio.xls', { type: 'application/vnd.ms-excel' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => Uint8Array.from(bytes).buffer,
  });
  await user.upload(input, file);
  const dialog = await screen.findByRole('dialog', { name: /prévia da importação/i });
  await user.click(within(dialog).getByRole('button', { name: /importar seleção/i }));
  return { user, ...rendered };
}

describe('modo visual Service Desk N1', () => {
  it('agrupa por turno e mostra matrícula e pausa editável', async () => {
    await renderWithN1();
    const grid = await screen.findByRole('grid', { name: /grade mensal/i });
    expect(screen.getByText('Modo Service Desk N1')).toBeInTheDocument();
    expect(within(grid).getAllByText(/^Madrugada$/).length).toBeGreaterThan(0);
    expect(within(grid).getAllByText(/^Manhã$/).length).toBeGreaterThan(0);
    expect(within(grid).getAllByText(/^Tarde$/).length).toBeGreaterThan(0);
    expect(within(grid).getAllByText(/^Noite$/).length).toBeGreaterThan(0);
    expect(within(grid).getByText('Alice Exemplo')).toBeInTheDocument();
    expect(within(grid).getByText('Matrícula 9001')).toBeInTheDocument();
    expect(within(grid).getByLabelText(/Pausa de Alice Exemplo/i)).toHaveValue('05:00');
  });

  it('troca para a segunda escala vinculada e mostra E, G e T na legenda', async () => {
    const { user } = await renderWithN1();
    fireEvent.change(screen.getByLabelText(/Pausa de Alice Exemplo/i), { target: { value: '05:15' } });
    await user.click(screen.getByRole('tab', { name: /e-mail e garantia/i }));
    expect(screen.getByRole('button', { name: /^E · Executa a atividade de E-mail$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^G · Executa a atividade de garantia$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^T · Todos \(E-mail e Garantia\)$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^DU · DSR — Dia útil$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Folga · Folga — Feriado$/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Pausa de Alice Exemplo/i)).toHaveValue('05:15');
  });
});
