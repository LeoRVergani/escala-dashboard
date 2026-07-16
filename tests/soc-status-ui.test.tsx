import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SocPlanner } from '../src/components/SocPlanner';
import { ScheduleGrid } from '../src/components/ScheduleGrid';
import type { ScheduleState } from '../src/types';
import { readFileSync } from 'node:fs';

const state = (): ScheduleState => ({
  monthKey:{year:2026,month:7}, dates:['2026-06-29','2026-06-30','2026-07-01','2026-07-02','2026-07-03','2026-07-04','2026-07-05','2026-07-06'],
  technicians:[{id:'a',name:'Ana Manhã'},{id:'b',name:'Beto Férias'},{id:'c',name:'Caio Noite'}], visualGrouping:'operational-shift',
  cells:{a:{1:{shift:'manha'},2:{shift:'manha'},3:{shift:'noite'},4:{shift:'tarde'},5:{shift:'manha'},6:{shift:'manha'},7:{shift:'manha'},8:{shift:'manha'}},b:{1:{shift:'ferias'},2:{shift:'folga'},3:{shift:'afastamento'}},c:{1:{shift:'noite'}}},
});
const noop=vi.fn();

describe('Planejador SOC com status separados',()=>{
  it('mostra Férias, Folga e Afastamento somente em Situações especiais',()=>{ render(<SocPlanner state={state()} compact={false} onCompactChange={noop} onMove={noop} onRemove={noop} onEdit={noop}/>); const special=screen.getByRole('gridcell',{name:'Situações especiais em 29/06/2026'}); expect(within(special).getByText('Beto Férias')).toBeInTheDocument(); expect(within(special).getByText('Férias')).toBeInTheDocument(); for(const label of ['Madrugada','Manhã','Tarde','Noite']) { const lane=screen.getByRole('gridcell',{name:`${label} em 29/06/2026`}); expect(within(lane).queryByText('Beto Férias')).not.toBeInTheDocument(); } });
  it('usa a cor do turno real diário e mantém badge 7/8',()=>{ render(<SocPlanner state={state()} compact onCompactChange={noop} onMove={noop} onRemove={noop} onEdit={noop}/>); const nightCard=screen.getAllByText('Ana Manhã').find((node)=>node.closest('.soc-card.shift-noite'))?.closest('.soc-card') as HTMLElement; expect(nightCard.style.getPropertyValue('--card-bg')).toBe('var(--sh-noite-bg)'); expect(screen.getByTitle('7º dia consecutivo de trabalho')).toHaveClass('alert'); expect(screen.getByTitle('8º dia consecutivo de trabalho')).toHaveTextContent('8'); });
  it('usa cinco faixas fixas na ordem e mantém células vazias',()=>{ const {container}=render(<SocPlanner state={state()} compact={false} onCompactChange={noop} onMove={noop} onRemove={noop} onEdit={noop}/>); expect([...container.querySelectorAll('.soc-row-label')].map((node)=>node.textContent)).toEqual(['Madrugada','Manhã','Tarde','Noite','Situações especiais']); expect(container.querySelectorAll('.soc-lane')).toHaveLength(5*8); expect(container.querySelector('[aria-label="Madrugada em 29/06/2026"]')).toBeEmptyDOMElement(); });
  it('mantém a mesma matriz no modo compacto sem alterar assignments',()=>{ const input=state(); const before=JSON.stringify(input.cells); const {container}=render(<SocPlanner state={input} compact onCompactChange={noop} onMove={noop} onRemove={noop} onEdit={noop}/>); expect(container.querySelector('.soc-planner')).toHaveClass('compact'); expect(container.querySelectorAll('.soc-lane')).toHaveLength(40); expect(JSON.stringify(input.cells)).toBe(before); });
});

describe('Grade SOC com sequência derivada',()=>{
  it('mostra badges separados do código e destaca 7+',()=>{ render(<ScheduleGrid state={state()} selection={new Set()} conflicts={[]} onSelectionChange={noop} onApplyShift={noop} onCopyValueTo={noop} onFillRange={noop} onCopyDay={noop} onPasteDay={noop} onClearDay={noop} onCopyWeek={noop} onPasteWeek={noop} canPasteDay={false} canPasteWeek={false} onAddTechnician={noop} onEditTechnician={noop} onRemoveTechnician={noop}/>); const day7=screen.getByRole('button',{name:/Dia 5, Ana Manhã/}); expect(within(day7).getByText('M')).toHaveClass('cell-code'); expect(within(day7).getByLabelText('7º dia consecutivo de trabalho')).toHaveClass('alert'); expect(screen.getByRole('button',{name:/Dia 29, Beto Férias/}).querySelector('.workday-counter')).toBeNull(); });
});

describe('contador visual simplificado',()=>{
  it('não usa fundo, borda, cápsula ou sombra',()=>{ const css=readFileSync('src/styles.css','utf8'); const rule=css.match(/\.workday-counter \{([^}]*)\}/)?.[1] ?? ''; expect(rule).toMatch(/background:none/); expect(rule).toMatch(/border:0/); expect(rule).toMatch(/border-radius:0/); expect(rule).toMatch(/box-shadow:none/); expect(rule).toMatch(/right:4px/); expect(rule).toMatch(/bottom:3px/); });
});
