import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function renderWithDemoWorkspaceOnline() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/health')) return Promise.resolve(jsonResponse({ status: 'ok' }));
    if (url.endsWith('/api/demo/status')) {
      return Promise.resolve(jsonResponse({
        configured: true,
        workspaceId: 'demo-v1',
        activePublicationRevision: 1,
        lastPublishedAt: null,
        status: 'ACTIVE',
      }));
    }
    return Promise.reject(new Error(`unexpected fetch to ${url}`));
  }));

  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /^ambiente de demonstração$/i }));
  await screen.findByText('AMBIENTE DE DEMONSTRAÇÃO');
  await screen.findByRole('button', { name: 'Restaurar Demo publicado', hidden: false });
  return { user };
}

describe('App — restaurar cenário local vs. restaurar Demo publicado no Firebase', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restaurar cenário local nunca abre o modal de reset remoto', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await renderWithDemoWorkspaceOnline();

    await user.click(screen.getByRole('button', { name: 'Restaurar cenário de demonstração' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Restaurar Demo publicado no Firebase' })).not.toBeInTheDocument();
  });

  it('restaurar Demo publicado abre o modal remoto distinto do restore local', async () => {
    const { user } = await renderWithDemoWorkspaceOnline();

    await user.click(screen.getByRole('button', { name: 'Restaurar Demo publicado' }));

    expect(await screen.findByRole('dialog', { name: 'Restaurar Demo publicado no Firebase' })).toBeInTheDocument();
  });
});
