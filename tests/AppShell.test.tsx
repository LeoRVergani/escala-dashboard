import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../src/components/AppShell';
import type { AppSection } from '../src/lib/navigation';

function renderShell(overrides: Partial<Parameters<typeof AppShell>[0]> = {}) {
  const onNavigate = vi.fn();
  const onToggleNavCollapsed = vi.fn();
  const onToggleUiCompact = vi.fn();
  const utils = render(
    <AppShell
      activeSection="home"
      onNavigate={onNavigate}
      navCollapsed={false}
      onToggleNavCollapsed={onToggleNavCollapsed}
      uiCompact={false}
      onToggleUiCompact={onToggleUiCompact}
      topBar={<div>topo</div>}
      {...overrides}
    >
      <div>conteúdo</div>
    </AppShell>,
  );
  return { onNavigate, onToggleNavCollapsed, onToggleUiCompact, ...utils };
}

describe('AppShell — navegação principal (FASE 14E)', () => {
  it('indica a seção ativa via aria-selected e navega ao clicar em outro item', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderShell({ activeSection: 'grid' as AppSection });

    expect(screen.getByRole('tab', { name: 'Grade' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Minhas equipes' })).toHaveAttribute('aria-selected', 'false');

    await user.click(screen.getByRole('tab', { name: 'Minhas equipes' }));
    expect(onNavigate).toHaveBeenCalledWith('home');
  });

  it('desabilita item de navegação com explicação (title) quando a seção não está disponível', () => {
    renderShell({
      sectionState: { planner: { disabled: true, reason: 'Disponível apenas para escalas 6x1 rotativas (SOC ou NOC).' } },
    });

    const plannerTab = screen.getByRole('tab', { name: 'Planejador' });
    expect(plannerTab).toBeDisabled();
    expect(plannerTab).toHaveAttribute('title', 'Disponível apenas para escalas 6x1 rotativas (SOC ou NOC).');
  });

  it('mostra um badge no item de navegação quando a seção tem estado ativo', () => {
    renderShell({ sectionState: { demo: { badge: 'ativo' } } });
    expect(screen.getByText('ativo')).toBeInTheDocument();
  });

  it('abre o menu compacto em telas pequenas ao clicar no botão móvel', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();

    const nav = container.querySelector('#shell-nav')!;
    expect(nav).not.toHaveClass('open');

    await user.click(screen.getByRole('button', { name: /menu/i }));
    expect(nav).toHaveClass('open');
  });

  it('marca o modo compacto no elemento raiz quando uiCompact está ativo', () => {
    const { container } = renderShell({ uiCompact: true });
    expect(container.querySelector('.shell')).toHaveClass('ui-compact');
  });

  it('marca o shell com a fundação dark-only Órbita de Turnos', () => {
    const { container } = renderShell();
    expect(container.querySelector('.shell')).toHaveClass('shell--orbit-dark');
  });

  it('chama onToggleUiCompact ao marcar a caixa "Modo compacto"', async () => {
    const user = userEvent.setup();
    const { onToggleUiCompact } = renderShell();
    await user.click(screen.getByLabelText('Modo compacto'));
    expect(onToggleUiCompact).toHaveBeenCalled();
  });

  it('não expõe seletor de tema no shell dark-only', () => {
    renderShell();

    expect(screen.queryByRole('button', { name: /tema/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/tema:\s*claro/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/automático/i)).not.toBeInTheDocument();
  });

  it('mostra o botão de voltar ao topo somente depois de rolar o conteúdo', () => {
    const { container } = renderShell();
    const content = container.querySelector('.shell-content')!;
    expect(screen.queryByRole('button', { name: /voltar ao topo/i })).not.toBeInTheDocument();

    fireEvent.scroll(content, { target: { scrollTop: 500 } });

    expect(screen.getByRole('button', { name: /voltar ao topo/i })).toBeInTheDocument();
  });
});
