import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { SHIFT_BY_ID, SHIFTS } from '../constants';
import { scheduleDateHeader, scheduleDates } from '../lib/dates';
import { groupTechniciansByOperationalShift } from '../lib/scheduleGrouping';
import { SOC_SHIFT_IDS, type SocShiftId } from '../lib/socPlanner';
import { calculateConsecutiveWorkdayCounters, isShiftAssignment, isSpecialStatusAssignment } from '../lib/assignments';
import type { CellValue, ScheduleState, ShiftId } from '../types';
import { useMiddleMouseHorizontalPan } from '../hooks/useMiddleMouseHorizontalPan';

type DragItem = { technicianId: string; fromDay?: number; value?: CellValue };
interface Props {
  state: ScheduleState;
  compact: boolean;
  onCompactChange: (value: boolean) => void;
  onMove: (item: DragItem, day: number, shift: SocShiftId) => void;
  onRemove: (technicianId: string, day: number) => void;
  onEdit: (technicianId: string, day: number, value: CellValue) => void;
  focusedCell?: { technicianId: string; day: number } | null;
}

export function SocPlanner({ state, compact, onCompactChange, onMove, onRemove, onEdit, focusedCell }: Props) {
  const dates = useMemo(() => scheduleDates(state), [state]);
  const groups = useMemo(() => groupTechniciansByOperationalShift(state), [state]);
  const workdayCounters = useMemo(() => calculateConsecutiveWorkdayCounters(state), [state]);
  const [editing, setEditing] = useState<{ technicianId: string; day: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [scrollViewportWidth, setScrollViewportWidth] = useState(0);
  const [scrollPosition, setScrollPosition] = useState(0);
  const pan = useMiddleMouseHorizontalPan(scrollRef);
  const techById = new Map(state.technicians.map((tech) => [tech.id, tech]));
  const rosterColumnWidth = useMemo(() => {
    const longestLabel = state.technicians.reduce((longest, tech) => {
      const label = tech.login ?? tech.name ?? 'Sem nome';
      return Math.max(longest, label.length);
    }, 'Colaboradores'.length);
    return Math.min(190, Math.max(118, longestLabel * 7 + 24));
  }, [state.technicians]);

  useEffect(() => {
    const source = scrollRef.current;
    if (!source) return;
    const measure = () => {
      setScrollWidth(source.scrollWidth);
      setScrollViewportWidth(source.clientWidth);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(source);
    const grid = source.querySelector('.soc-schedule-grid');
    if (grid) observer?.observe(grid);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [compact, dates.length, rosterColumnWidth]);

  useEffect(() => {
    if (!focusedCell || !scrollRef.current) return;
    const target = [...scrollRef.current.querySelectorAll<HTMLElement>('[data-tech-id][data-day]')]
      .find((node) => node.dataset.techId === focusedCell.technicianId && node.dataset.day === String(focusedCell.day));
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' });
    target?.focus({ preventScroll: true });
  }, [focusedCell]);

  function syncFromTable() {
    if (scrollRef.current && scrollbarRef.current && scrollbarRef.current.scrollLeft !== scrollRef.current.scrollLeft) {
      scrollbarRef.current.scrollLeft = scrollRef.current.scrollLeft;
    }
    if (scrollRef.current) setScrollPosition(scrollRef.current.scrollLeft);
  }

  function syncFromScrollbar() {
    if (scrollRef.current && scrollbarRef.current && scrollRef.current.scrollLeft !== scrollbarRef.current.scrollLeft) {
      scrollRef.current.scrollLeft = scrollbarRef.current.scrollLeft;
    }
    if (scrollbarRef.current) setScrollPosition(scrollbarRef.current.scrollLeft);
  }

  function dragStart(event: React.DragEvent, item: DragItem) {
    event.dataTransfer.setData('application/x-soc-assignment', JSON.stringify(item));
    event.dataTransfer.effectAllowed = item.fromDay ? 'move' : 'copy';
  }
  function drop(event: React.DragEvent, day: number, shift: SocShiftId) {
    event.preventDefault();
    setDropTarget(null);
    const raw = event.dataTransfer.getData('application/x-soc-assignment');
    if (raw) onMove(JSON.parse(raw) as DragItem, day, shift);
  }

  function card(techId: string, day: number, value: CellValue, special = false) {
    const tech = techById.get(techId);
    const counter = workdayCounters[techId]?.[day];
    const label = value.text ?? SHIFT_BY_ID[value.shift].label;
    return <div
      className={`soc-card shift-${value.shift}${special ? ' special' : ''}`}
      style={{ ['--card-bg' as string]: `var(--sh-${value.shift}-bg)`, ['--card-fg' as string]: `var(--sh-${value.shift}-fg)` }}
      key={`${techId}-${value.shift}`}
      data-tech-id={techId}
      data-day={day}
      tabIndex={-1}
      draggable
      onDragStart={(e) => dragStart(e, { technicianId: techId, fromDay: day, value })}
      onDoubleClick={() => setEditing({ technicianId: techId, day })}
    >
      <strong>{tech?.name ?? tech?.login ?? techId}</strong><small>{label}</small>
      <span className="soc-card-actions"><button title="Editar" onClick={() => setEditing({ technicianId: techId, day })}>✎</button><button title="Remover" onClick={() => onRemove(techId, day)}>×</button></span>
      {counter && !special && <em className={`workday-counter${counter >= 7 ? ' alert' : ''}`} title={`${counter}º dia consecutivo de trabalho`}>{counter}</em>}
    </div>;
  }

  return <section className={`soc-planner${compact ? ' compact' : ''}`} aria-label="Planejador SOC">
    <div
      ref={scrollRef}
      className={`soc-planner-main${pan.isPanning ? ' is-panning' : ''}`}
      data-testid="soc-horizontal-scroll-container"
      onScroll={syncFromTable}
      onPointerDown={pan.onPointerDown}
      onPointerMove={pan.onPointerMove}
      onPointerUp={pan.onPointerUp}
      onPointerCancel={pan.onPointerCancel}
      onLostPointerCapture={pan.onLostPointerCapture}
      onAuxClick={pan.onAuxClick}
    >
      <div className="soc-planner-controls">
        <span>Período 25–26 · quatro turnos e situações especiais</span>
        <label><input type="checkbox" checked={compact} onChange={(e) => onCompactChange(e.target.checked)} /> Compactar</label>
      </div>
      <div className="soc-schedule-grid" style={{ gridTemplateColumns: `${rosterColumnWidth}px repeat(${dates.length}, minmax(124px, 1fr))` }} role="grid" aria-label="Faixas do Planejador SOC">
        <div className="soc-grid-corner" role="columnheader"><strong>Colaboradores</strong><small>Arraste pelo login</small></div>
        {dates.map((date) => { const head = scheduleDateHeader(date); return <div className="soc-date-head" role="columnheader" key={date}><strong>{head.date}</strong><small>{head.weekday}</small></div>; })}
        {[...SOC_SHIFT_IDS, 'special' as const].map((lane) => {
          const rosterGroup = groups.find((group) => group.id === (lane === 'special' ? 'sem-turno' : lane));
          return <Fragment key={lane}>
          <div className={`soc-roster-lane lane-${lane}`} role="rowheader">
            <div className="soc-row-label">{lane === 'special' ? 'Situações especiais' : SHIFT_BY_ID[lane].label}</div>
            <div className="soc-roster-logins">
              {rosterGroup?.technicians.map((tech) => <button key={tech.id} draggable title={tech.name ?? tech.login} onDragStart={(e) => dragStart(e, { technicianId: tech.id })}>
                {tech.login ?? tech.name ?? 'Sem nome'}
              </button>)}
            </div>
          </div>
          {dates.map((date, index) => {
            const day = index + 1;
            const targetKey = `${lane}:${day}`;
            const targetShift: SocShiftId = lane === 'special' ? 'manha' : lane;
            return <div
              className={`soc-lane lane-${lane}${dropTarget === targetKey ? ' drop-target' : ''}`}
              role="gridcell"
              aria-label={`${lane === 'special' ? 'Situações especiais' : SHIFT_BY_ID[lane].label} em ${date.split('-').reverse().join('/')}`}
              key={date}
              onDragOver={(e) => { e.preventDefault(); setDropTarget(targetKey); }}
              onDragLeave={() => setDropTarget((current) => current === targetKey ? null : current)}
              onDrop={(e) => drop(e, day, targetShift)}
            >
              {state.technicians.flatMap((tech) => {
                const value = state.cells[tech.id]?.[day];
                if (!value) return [];
                if (lane === 'special') return isSpecialStatusAssignment(value) ? card(tech.id, day, value, true) : [];
                return isShiftAssignment(value) && value.shift === lane ? card(tech.id, day, value) : [];
              })}
            </div>;
          })}
        </Fragment>;})}
      </div>
    </div>
    <div ref={scrollbarRef} className="soc-horizontal-scrollbar" role="scrollbar" aria-label="Navegação horizontal do Planejador" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={Math.max(0, scrollWidth - scrollViewportWidth)} aria-valuenow={Math.round(scrollPosition)} tabIndex={0} onScroll={syncFromScrollbar}>
      <div style={{ width: scrollWidth, height: 1 }} />
    </div>
    {editing && <div className="soc-edit-dialog" role="dialog" aria-label="Editar alocação"><div>
      <strong>Editar {techById.get(editing.technicianId)?.name ?? 'colaborador'}</strong>
      <select defaultValue={state.cells[editing.technicianId]?.[editing.day]?.shift} onChange={(e) => { const shift = e.target.value as ShiftId; onEdit(editing.technicianId, editing.day, { shift }); setEditing(null); }}>
        {SHIFTS.map((shift) => <option value={shift.id} key={shift.id}>{shift.label}</option>)}
      </select>
      <button className="btn" onClick={() => setEditing(null)}>Cancelar</button>
    </div></div>}
  </section>;
}
