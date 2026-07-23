import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/components/AppShell';

const root = resolve(__dirname, '..');

describe('fundação visual dark-only', () => {
  it('não oferece controles ou opções de tema ao usuário', () => {
    render(
      <AppShell
        activeSection="home"
        onNavigate={vi.fn()}
        navCollapsed={false}
        onToggleNavCollapsed={vi.fn()}
        uiCompact={false}
        onToggleUiCompact={vi.fn()}
        topBar={<div>topo</div>}
      >
        <div>conteúdo</div>
      </AppShell>,
    );

    expect(screen.queryByRole('button', { name: /tema/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/tema claro/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/automático/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/segue o sistema/i)).not.toBeInTheDocument();
  });

  it('usa fundo escuro antes da inicialização do React e no manifesto', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8')) as {
      background_color: string;
      theme_color: string;
    };

    expect(html).toContain('background:#060B18');
    expect(html).toContain('color-scheme:dark');
    expect(html).toContain('<meta name="theme-color" content="#0E2035"');
    expect(manifest.background_color).toBe('#060B18');
    expect(manifest.theme_color).toBe('#0E2035');
  });

  it('centraliza tokens escuros Órbita de Turnos e remove prefers-color-scheme', () => {
    const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8');
    const appSource = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');

    for (const token of [
      '--orbit-background: #060B18',
      '--orbit-surface: #0B1728',
      '--orbit-card: #0E2035',
      '--orbit-card-elevated: #122844',
      '--orbit-border: #1D4778',
      '--orbit-primary: #3B82F6',
      '--orbit-violet: #6D28D9',
      '--orbit-success: #18B884',
      '--orbit-warning: #F5B82E',
      '--orbit-danger: #EF4444',
      '--orbit-text-primary: #F8FAFC',
      '--orbit-text-secondary: #A9B6C8',
    ]) {
      expect(css).toContain(token);
    }
    expect(css).not.toContain('prefers-color-scheme');
    expect(css).not.toContain('color-scheme: light');
    expect(appSource).not.toContain('loadStoredTheme');
    expect(appSource).not.toContain('storeTheme');
  });

  it('mantém modais e popovers na superfície elevada escura', () => {
    const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8');

    expect(css).toMatch(/\.modal(?:,|\s|\{)[\s\S]*background:\s*var\(--card-elevated\)/);
    expect(css).toMatch(/\.popover\s*\{[\s\S]*background:\s*var\(--card-elevated\)/);
    expect(css).toMatch(/\.modal-backdrop[\s\S]*background:\s*var\(--orbit-backdrop\)/);
  });
});
