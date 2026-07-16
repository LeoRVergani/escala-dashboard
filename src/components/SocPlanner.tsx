import { Fragment, useMemo, useState } from 'react';
import { SHIFT_BY_ID, SHIFTS } from '../constants';
import { scheduleDateHeader, scheduleDates } from '../lib/dates';
import { groupTechniciansByOperationalShift } from '../lib/scheduleGrouping';
import { SOC_SHIFT_IDS, type SocShiftId } from '../lib/socPlanner';
import { calculateConsecutiveWorkdayCounters, isShiftAssignment, isSpecialStatusAssignment } from '../lib/assignments';
import type { CellValue, ScheduleState, ShiftId } from '../types';

type DragItem = { technicianId: string; fromDay?: number; value?: CellValue };
interface Props {
  state: ScheduleState;
  compact: boolean;
  onCompactChange: (value: boolean) => void;
  onMove: (item: DragItem, day: number, shift: SocShiftId) => void;
  onRemove: (technicianId: string, day: number) => void;
  onEdit: (technicianId: string, day: number, value: CellValue) => void;
}

export function SocPlanner({ state, compact, onCompactChange, onMove, onRemove, onEdit }: Props) {
  const dates = useMemo(() => scheduleDates(state), [state]);
  const groups = useMemo(() => groupTechniciansByOperationalShift(state), [state]);
  const workdayCounters = useMemo(() => calculateConsecutiveWorkdayCounters(state), [state]);
  const [editing, setEditing] = useState<{ technicianId: string; day: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const techById = new Map(state.technicians.map((tech) => [tech.id, tech]));

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
    <aside className="soc-roster">
      <header><strong>Colaboradores</strong><span>Arraste para qualquer turno</span></header>
      {groups.map((group) => <div className="soc-roster-group" key={group.id}>
        <h3>{group.label}</h3>
        {group.technicians.map((tech) => <button key={tech.id} draggable onDragStart={(e) => dragStart(e, { technicianId: tech.id })}>
          <strong>{tech.name ?? tech.login ?? 'Sem nome'}</strong><small>{tech.login ?? 'sem login'}</small>
        </button>)}
      </div>)}
    </aside>
    <div className="soc-planner-main">
      <div className="soc-planner-controls">
        <span>Período 25–26 · quatro turnos e situações especiais</span>
        <label><input type="checkbox" checked={compact} onChange={(e) => onCompactChange(e.target.checked)} /> Compactar</label>
      </div>
      <div className="soc-schedule-grid" style={{ gridTemplateColumns: `112px repeat(${dates.length}, minmax(145px, 1fr))` }} role="grid" aria-label="Faixas do Planejador SOC">
        <div className="soc-grid-corner" role="columnheader">Período</div>
        {dates.map((date) => { const head = scheduleDateHeader(date); return <div className="soc-date-head" role="columnheader" key={date}><strong>{head.date}</strong><small>{head.weekday}</small></div>; })}
        {[...SOC_SHIFT_IDS, 'special' as const].map((lane) => <Fragment key={lane}>
          <div className={`soc-row-label lane-${lane}`} role="rowheader">{lane === 'special' ? 'Situações especiais' : SHIFT_BY_ID[lane].label}</div>
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
        </Fragment>)}
      </div>
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
