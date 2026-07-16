import { useMemo, useState } from 'react';
import { SHIFT_BY_ID, SHIFTS } from '../constants';
import { scheduleDateHeader, scheduleDates } from '../lib/dates';
import { groupTechniciansByOperationalShift } from '../lib/scheduleGrouping';
import { SOC_SHIFT_IDS, type SocShiftId } from '../lib/socPlanner';
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
  const [editing, setEditing] = useState<{ technicianId: string; day: number } | null>(null);
  const techById = new Map(state.technicians.map((tech) => [tech.id, tech]));

  function dragStart(event: React.DragEvent, item: DragItem) {
    event.dataTransfer.setData('application/x-soc-assignment', JSON.stringify(item));
    event.dataTransfer.effectAllowed = item.fromDay ? 'move' : 'copy';
  }
  function drop(event: React.DragEvent, day: number, shift: SocShiftId) {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/x-soc-assignment');
    if (raw) onMove(JSON.parse(raw) as DragItem, day, shift);
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
        <span>Período 25–26 · quatro áreas por dia</span>
        <label><input type="checkbox" checked={compact} onChange={(e) => onCompactChange(e.target.checked)} /> Compactar</label>
      </div>
      <div className="soc-days">
        {dates.map((date, index) => {
          const day = index + 1;
          const head = scheduleDateHeader(date);
          return <article className="soc-day" key={date}>
            <header><strong>{head.date}</strong><small>{head.weekday}</small></header>
            {SOC_SHIFT_IDS.map((shift) => <div className={`soc-lane lane-${shift}`} key={shift} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, day, shift)}>
              <b>{SHIFT_BY_ID[shift].label}</b>
              {state.technicians.flatMap((tech) => {
                const value = state.cells[tech.id]?.[day];
                if (!value || (value.shift !== shift && SOC_SHIFT_IDS.includes(value.shift as SocShiftId))) return [];
                if (!SOC_SHIFT_IDS.includes(value.shift as SocShiftId) && shift !== 'manha') return [];
                const special = !SOC_SHIFT_IDS.includes(value.shift as SocShiftId);
                return <div className={`soc-card${special ? ' special' : ''}`} key={tech.id} draggable onDragStart={(e) => dragStart(e, { technicianId: tech.id, fromDay: day, value })} onDoubleClick={() => setEditing({ technicianId: tech.id, day })}>
                  <strong>{tech.name ?? tech.login ?? tech.id}</strong><small>{special ? (value.text ?? SHIFT_BY_ID[value.shift].label) : SHIFT_BY_ID[shift].label}</small>
                  <span><button title="Editar" onClick={() => setEditing({ technicianId: tech.id, day })}>✎</button><button title="Remover" onClick={() => onRemove(tech.id, day)}>×</button></span>
                </div>;
              })}
            </div>)}
          </article>;
        })}
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
