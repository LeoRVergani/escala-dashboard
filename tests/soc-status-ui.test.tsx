import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SocPlanner } from '../src/components/SocPlanner';
import { ScheduleGrid } from '../src/components/ScheduleGrid';
import type { ScheduleState } from '../src/types';

const state = (): ScheduleState => ({
  monthKey:{year:2026,month:7}, dates:['2026-06-29','2026-06-30','2026-07-01','2026-07-02','2026-07-03','2026-07-04','2026-07-05','2026-07-06'],
  technicians:[{id:'a',name:'Ana Manhã'},{id:'b',name:'Beto Férias'},{id:'c',name:'Caio Noite'}], visualGrouping:'operational-shift',
  cells:{a:{1:{shift:'manha'},2:{shift:'manha'},3:{shift:'noite'},4:{shift:'tarde'},5:{shift:'manha'},6:{shift:'manha'},7:{shift:'manha'},8:{shift:'manha'}},b:{1:{shift:'ferias'},2:{shift:'folga'},3:{shift:'afastamento'}},c:{1:{shift:'noite'}}},
});
const noop=vi.fn();

describe('Planejador SOC com status separados',()=>{
  it('mostra Férias, Folga e Afastamento somente em Situações especiais',()=>{ const {container}=render(<SocPlanner state={state()} compact={false} onCompactChange={noop} onMove={noop} onRemove={noop} onEdit={noop}/>); const special=container.querySelector('.lane-special') as HTMLElement; expect(within(special).getByText('Beto Férias')).toBeInTheDocument(); expect(within(special).getByText('Férias')).toBeInTheDocument(); for(const shift of ['madrugada','manha','tarde','noite']) { const lane=container.querySelector(`.lane-${shift}`) as HTMLElement; expect(within(lane).queryByText('Beto Férias')).not.toBeInTheDocument(); } });
  it('usa a cor do turno real diário e mantém badge 7/8',()=>{ render(<SocPlanner state={state()} compact onCompactChange={noop} onMove={noop} onRemove={noop} onEdit={noop}/>); const nightCard=screen.getAllByText('Ana Manhã').find((node)=>node.closest('.soc-card.shift-noite'))?.closest('.soc-card') as HTMLElement; expect(nightCard.style.getPropertyValue('--card-bg')).toBe('var(--sh-noite-bg)'); expect(screen.getByTitle('7º dia consecutivo de trabalho')).toHaveClass('alert'); expect(screen.getByTitle('8º dia consecutivo de trabalho')).toHaveTextContent('8'); });
});

describe('Grade SOC com sequência derivada',()=>{
  it('mostra badges separados do código e destaca 7+',()=>{ render(<ScheduleGrid state={state()} selection={new Set()} conflicts={[]} onSelectionChange={noop} onApplyShift={noop} onCopyValueTo={noop} onFillRange={noop} onCopyDay={noop} onPasteDay={noop} onClearDay={noop} onCopyWeek={noop} onPasteWeek={noop} canPasteDay={false} canPasteWeek={false} onAddTechnician={noop} onEditTechnician={noop} onRemoveTechnician={noop}/>); const day7=screen.getByRole('button',{name:/Dia 5, Ana Manhã/}); expect(within(day7).getByText('M')).toHaveClass('cell-code'); expect(within(day7).getByLabelText('7º dia consecutivo de trabalho')).toHaveClass('alert'); expect(screen.getByRole('button',{name:/Dia 29, Beto Férias/}).querySelector('.workday-counter')).toBeNull(); });
});
