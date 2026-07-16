import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ConflictAlertsPanel } from '../src/components/ConflictAlertsPanel';
import { SocPlanner } from '../src/components/SocPlanner';
import { detectConflicts } from '../src/lib/conflicts';
import type { ScheduleState } from '../src/types';

if (!window.PointerEvent) window.PointerEvent = MouseEvent as typeof PointerEvent;

function state(): ScheduleState {
  return {
    monthKey: { year: 2026, month: 7 },
    dates: Array.from({ length: 10 }, (_, index) => `2026-07-${String(index + 1).padStart(2, '0')}`),
    visualGrouping: 'operational-shift',
    technicians: [{ id: 'ana', login: 'ana.login', name: 'Ana' }],
    cells: { ana: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 1, { shift: 'manha' }])) },
  };
}

const noop = vi.fn();
const planner = (compact = false) => render(<SocPlanner state={state()} compact={compact} onCompactChange={noop} onMove={noop} onRemove={noop} onEdit={noop} />);

describe('navegação horizontal do Planejador SOC', () => {
  it('possui uma única fonte de scrollLeft e uma barra inferior acessível nos dois modos', () => {
    const normal = planner(false);
    expect(screen.getAllByTestId('soc-horizontal-scroll-container')).toHaveLength(1);
    expect(screen.getByRole('scrollbar', { name: /navegação horizontal/i })).toBeInTheDocument();
    normal.unmount();
    planner(true);
    expect(screen.getByTestId('soc-horizontal-scroll-container').closest('.soc-planner')).toHaveClass('compact');
    expect(screen.getByRole('scrollbar', { name: /navegação horizontal/i })).toBeInTheDocument();
  });

  it('sincroniza tabela e barra inferior nos dois sentidos e recalcula ao redimensionar', () => {
    planner();
    const source = screen.getByTestId('soc-horizontal-scroll-container');
    const scrollbar = screen.getByRole('scrollbar', { name: /navegação horizontal/i });
    Object.defineProperty(source, 'scrollWidth', { configurable: true, value: 1234 });
    fireEvent(window, new Event('resize'));
    expect(scrollbar.firstElementChild).toHaveStyle({ width: '1234px' });
    source.scrollLeft = 240;
    fireEvent.scroll(source);
    expect(scrollbar.scrollLeft).toBe(240);
    scrollbar.scrollLeft = 90;
    fireEvent.scroll(scrollbar);
    expect(source.scrollLeft).toBe(90);
  });

  it('faz pan somente com botão do meio e encerra em up, cancel e perda de captura', () => {
    planner();
    const source = screen.getByTestId('soc-horizontal-scroll-container');
    source.scrollLeft = 100;
    fireEvent.pointerDown(source, { button: 0, pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(source, { pointerId: 1, clientX: 50 });
    expect(source.scrollLeft).toBe(100);
    fireEvent.pointerDown(source, { button: 2, pointerId: 2, clientX: 100 });
    fireEvent.pointerMove(source, { pointerId: 2, clientX: 50 });
    expect(source.scrollLeft).toBe(100);

    fireEvent.pointerDown(source, { button: 1, pointerId: 3, clientX: 100 });
    expect(source).toHaveClass('is-panning');
    fireEvent.pointerMove(source, { pointerId: 3, clientX: 50 });
    expect(source.scrollLeft).toBe(150);
    fireEvent.pointerMove(source, { pointerId: 3, clientX: 130 });
    expect(source.scrollLeft).toBe(70);
    fireEvent.pointerUp(source, { pointerId: 3 });
    expect(source).not.toHaveClass('is-panning');

    fireEvent.pointerDown(source, { button: 1, pointerId: 4, clientX: 100 });
    fireEvent.pointerCancel(source, { pointerId: 4 });
    expect(source).not.toHaveClass('is-panning');
    fireEvent.pointerDown(source, { button: 1, pointerId: 5, clientX: 100 });
    fireEvent.lostPointerCapture(source, { pointerId: 5 });
    expect(source).not.toHaveClass('is-panning');
  });

  it('não inicia pan em controles e não altera assignments nem chama drag-and-drop', () => {
    const input = state();
    const before = JSON.stringify(input.cells);
    const onMove = vi.fn();
    render(<SocPlanner state={input} compact={false} onCompactChange={noop} onMove={onMove} onRemove={noop} onEdit={noop} />);
    const source = screen.getByTestId('soc-horizontal-scroll-container');
    const checkbox = within(source).getByRole('checkbox');
    fireEvent.pointerDown(checkbox, { button: 1, pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(source, { pointerId: 1, clientX: 20 });
    expect(source).not.toHaveClass('is-panning');
    expect(onMove).not.toHaveBeenCalled();
    expect(JSON.stringify(input.cells)).toBe(before);
  });

  it('mantém overflow horizontal no container e não o oculta no pai', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css).toMatch(/\.soc-planner-main \{[^}]*overflow-x:auto/);
    expect(css).toMatch(/\.soc-planner \{[^}]*overflow:visible/);
    expect(css).toMatch(/\.soc-horizontal-scrollbar \{[^}]*position:sticky;bottom:0/);
    expect(css).toMatch(/\.soc-planner-main\.is-panning \{[^}]*cursor:grabbing;user-select:none/);
  });
});

describe('alertas compartilhados', () => {
  it('exibe na Grade e no Planejador a mesma lista produzida por detectConflicts', () => {
    const conflicts = detectConflicts(state());
    const grade = render(<ConflictAlertsPanel conflicts={conflicts} />);
    const gradeTexts = within(grade.container).getAllByRole('button').map((button) => button.textContent);
    grade.unmount();
    const plannerPanel = render(<ConflictAlertsPanel conflicts={conflicts} />);
    expect(within(plannerPanel.container).getAllByRole('button').map((button) => button.textContent)).toEqual(gradeTexts);
    expect(gradeTexts).toHaveLength(conflicts.length);
    expect(screen.getByText(/não bloqueiam a edição/i)).toBeInTheDocument();
  });

  it('painel permite navegar usando os metadados do alerta sem alterar dados', () => {
    const conflicts = detectConflicts(state());
    const onNavigate = vi.fn();
    const before = JSON.stringify(state().cells);
    render(<ConflictAlertsPanel conflicts={conflicts} onNavigate={onNavigate} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onNavigate).toHaveBeenCalledWith(conflicts[0]);
    expect(JSON.stringify(state().cells)).toBe(before);
  });
});
