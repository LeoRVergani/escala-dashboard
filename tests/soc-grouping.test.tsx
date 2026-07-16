import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScheduleGrid } from '../src/components/ScheduleGrid';
import {
  groupTechniciansByOperationalShift,
  predominantOperationalShift,
} from '../src/lib/scheduleGrouping';
import type { ScheduleState } from '../src/types';

function groupedState(): ScheduleState {
  return {
    monthKey: { year: 2026, month: 7 },
    dates: ['2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28'],
    visualGrouping: 'operational-shift',
    technicians: [
      { id: 'manha', login: 'alamancio' },
      { id: 'madrugada', login: 'aleilima' },
      { id: 'tarde', login: 'cestradito' },
      { id: 'noite', login: 'dschlottag' },
      { id: 'sem-turno', login: 'ferias.periodo' },
    ],
    cells: {
      manha: {
        1: { shift: 'folga' },
        2: { shift: 'manha' },
        3: { shift: 'manha' },
      },
      madrugada: {
        1: { shift: 'madrugada' },
        2: { shift: 'madrugada' },
        3: { shift: 'folga' },
      },
      tarde: {
        1: { shift: 'tarde' },
        2: { shift: 'tarde' },
      },
      noite: {
        1: { shift: 'noite' },
        2: { shift: 'folga' },
      },
      'sem-turno': {
        1: { shift: 'ferias' },
        2: { shift: 'ferias' },
      },
    },
  };
}

describe('agrupamento visual do SOC por turno no período', () => {
  it('ignora férias/folgas e calcula o turno predominante', () => {
    const state = groupedState();
    expect(predominantOperationalShift(state, 'manha')).toBe('manha');
    expect(predominantOperationalShift(state, 'madrugada')).toBe('madrugada');
    expect(predominantOperationalShift(state, 'sem-turno')).toBe('sem-turno');
  });

  it('usa o primeiro turno cronológico para desempatar', () => {
    const state = groupedState();
    state.cells.manha = {
      1: { shift: 'noite' },
      2: { shift: 'manha' },
    };
    expect(predominantOperationalShift(state, 'manha')).toBe('noite');
  });

  it('ordena Madrugada, Manhã, Tarde, Noite e deixa sem turno por último', () => {
    const groups = groupTechniciansByOperationalShift(groupedState());
    expect(groups.map((group) => group.id)).toEqual([
      'madrugada',
      'manha',
      'tarde',
      'noite',
      'sem-turno',
    ]);
    expect(groups.map((group) => group.technicians[0].login)).toEqual([
      'aleilima',
      'alamancio',
      'cestradito',
      'dschlottag',
      'ferias.periodo',
    ]);
  });

  it('mostra cabeçalhos dos blocos na grade sem alterar as células', () => {
    const state = groupedState();
    const noop = vi.fn();
    const { container } = render(
      <ScheduleGrid
        state={state}
        selection={new Set()}
        conflicts={[]}
        onSelectionChange={noop}
        onApplyShift={noop}
        onCopyValueTo={noop}
        onFillRange={noop}
        onCopyDay={noop}
        onPasteDay={noop}
        onClearDay={noop}
        onCopyWeek={noop}
        onPasteWeek={noop}
        canPasteDay={false}
        canPasteWeek={false}
        onAddTechnician={noop}
        onEditTechnician={noop}
        onRemoveTechnician={noop}
      />,
    );

    expect(screen.getByRole('grid', { name: /organizada por turno/i })).toBeInTheDocument();
    const headers = [...container.querySelectorAll('.soc-group-row')].map((row) => row.textContent?.trim());
    expect(headers).toEqual([
      expect.stringMatching(/^Madrugada/),
      expect.stringMatching(/^Manhã/),
      expect.stringMatching(/^Tarde/),
      expect.stringMatching(/^Noite/),
      expect.stringMatching(/^Sem turno definido/),
    ]);
    expect(screen.getByRole('button', { name: /Dia 26, alamancio: Manhã/i })).toBeInTheDocument();
  });
});
