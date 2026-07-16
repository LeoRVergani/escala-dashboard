import { Fragment, useMemo, useRef, useState } from 'react';
import {
  N1_SHIFT_LABELS,
  SHIFT_BY_ID,
} from '../constants';
import { parseIsoDate, scheduleDateHeader, scheduleDates } from '../lib/dates';
import {
  groupTechniciansByOperationalShift,
  type OperationalShiftGroup,
} from '../lib/scheduleGrouping';
import type {
  CellValue,
  Conflict,
  ScheduleState,
  ServiceDeskN1Layer,
  ServiceDeskN1Row,
  ServiceDeskN1Shift,
  ShiftId,
  Technician,
} from '../types';
import { CellMenu } from './CellMenu';

export type CellKey = `${string}:${number}`;
export const cellKey = (techId: string, day: number): CellKey => `${techId}:${day}`;

interface MenuState {
  x: number;
  y: number;
  techId: string;
  day: number;
}

interface Props {
  state: ScheduleState;
  selection: Set<CellKey>;
  conflicts: Conflict[];
  onSelectionChange: (next: Set<CellKey>) => void;
  onApplyShift: (keys: CellKey[], value: CellValue | null) => void;
  onCopyValueTo: (source: CellKey, target: CellKey) => void;
  onFillRange: (techId: string, fromDay: number, toDay: number, value: CellValue | null) => void;
  onCopyDay: (day: number) => void;
  onPasteDay: (day: number) => void;
  onClearDay: (day: number) => void;
  onCopyWeek: (startDay: number) => void;
  onPasteWeek: (startDay: number) => void;
  canPasteDay: boolean;
  canPasteWeek: boolean;
  onAddTechnician: (login: string, name: string) => void;
  onEditTechnician: (id: string, login: string, name: string) => void;
  onRemoveTechnician: (id: string) => void;
  serviceDeskN1?: {
    layer: ServiceDeskN1Layer;
    rowsById: Record<string, ServiceDeskN1Row>;
    legend: Array<{ code: string; label: string; description?: string }>;
    onUpdatePause: (rowId: string, pauseTime: string) => void;
    onUpdateShift: (rowId: string, shift: ServiceDeskN1Shift) => void;
  };
}

export function ScheduleGrid(props: Props) {
  const { state, selection, conflicts } = props;
  const dateList = useMemo(() => scheduleDates(state), [state]);
  const total = dateList.length;
  const days = useMemo(() => Array.from({ length: total }, (_, i) => i + 1), [total]);
  const weekdayOf = (index: number) => parseIsoDate(dateList[index - 1]).getDay();
  const spansMonths = new Set(dateList.map((date) => date.slice(0, 7))).size > 1;
  const monthGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; count: number }> = [];
    for (const date of dateList) {
      const parsed = parseIsoDate(date);
      const key = date.slice(0, 7);
      const label = parsed.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const current = groups[groups.length - 1];
      if (current?.key === key) current.count += 1;
      else groups.push({ key, label, count: 1 });
    }
    return groups;
  }, [dateList]);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dayMenu, setDayMenu] = useState<{ x: number; y: number; day: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<CellKey | null>(null);
  const [editingTech, setEditingTech] = useState<string | null>(null);
  const anchorRef = useRef<CellKey | null>(null);

  const operationalGrouping = state.visualGrouping === 'operational-shift' && !props.serviceDeskN1;
  const operationalGroups = useMemo(
    () => (operationalGrouping ? groupTechniciansByOperationalShift(state) : []),
    [operationalGrouping, state],
  );
  const operationalGroupByTech = useMemo(() => {
    const result = new Map<string, OperationalShiftGroup>();
    for (const group of operationalGroups) {
      for (const technician of group.technicians) result.set(technician.id, group.id);
    }
    return result;
  }, [operationalGroups]);
  const operationalGroupInfo = useMemo(
    () => new Map(operationalGroups.map((group) => [group.id, group])),
    [operationalGroups],
  );

  const displayTechnicians = useMemo(() => {
    if (props.serviceDeskN1) {
      const order: Record<ServiceDeskN1Shift, number> = { madrugada: 0, manha: 1, tarde: 2, noite: 3 };
      return [...state.technicians].sort((a, b) => {
        const rowA = props.serviceDeskN1!.rowsById[a.id];
        const rowB = props.serviceDeskN1!.rowsById[b.id];
        return (order[rowA?.shift ?? 'manha'] - order[rowB?.shift ?? 'manha']) ||
          ((rowA?.sourceRow ?? 0) - (rowB?.sourceRow ?? 0));
      });
    }
    if (operationalGrouping) return operationalGroups.flatMap((group) => group.technicians);
    return state.technicians;
  }, [operationalGrouping, operationalGroups, props.serviceDeskN1, state.technicians]);

  const conflictKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of conflicts) if (c.day) set.add(cellKey(c.techId, c.day));
    return set;
  }, [conflicts]);

  const techIndex = useMemo(
    () => new Map(displayTechnicians.map((t, i) => [t.id, i])),
    [displayTechnicians],
  );

  function handleCellClick(e: React.MouseEvent, techId: string, day: number) {
    const key = cellKey(techId, day);
    const next = new Set(props.selection);
    if (e.shiftKey && anchorRef.current) {
      const [aTech, aDayStr] = anchorRef.current.split(':');
      const aRow = techIndex.get(aTech) ?? 0;
      const bRow = techIndex.get(techId) ?? 0;
      const [r1, r2] = [Math.min(aRow, bRow), Math.max(aRow, bRow)];
      const aDay = Number(aDayStr);
      const [d1, d2] = [Math.min(aDay, day), Math.max(aDay, day)];
      if (!e.ctrlKey && !e.metaKey) next.clear();
      for (let r = r1; r <= r2; r++) {
        for (let d = d1; d <= d2; d++) {
          next.add(cellKey(displayTechnicians[r].id, d));
        }
      }
    } else if (e.ctrlKey || e.metaKey) {
      if (next.has(key)) next.delete(key);
      else next.add(key);
      anchorRef.current = key;
    } else {
      next.clear();
      next.add(key);
      anchorRef.current = key;
      setMenu({ x: e.clientX, y: e.clientY, techId, day });
    }
    props.onSelectionChange(next);
  }

  function menuTargets(): CellKey[] {
    if (!menu) return [];
    const key = cellKey(menu.techId, menu.day);
    return selection.size > 1 && selection.has(key) ? [...selection] : [key];
  }

  function pick(shift: ShiftId, text?: string) {
    props.onApplyShift(menuTargets(), text ? { shift, text } : { shift });
    setMenu(null);
  }

  /* ---------- Drag and drop ---------- */

  function onDragStart(e: React.DragEvent, techId: string, day: number) {
    e.dataTransfer.setData('text/plain', cellKey(techId, day));
    e.dataTransfer.effectAllowed = 'copy';
  }

  function onDrop(e: React.DragEvent, techId: string, day: number) {
    e.preventDefault();
    setDropTarget(null);
    const source = e.dataTransfer.getData('text/plain') as CellKey;
    if (!source || !source.includes(':')) return;
    const [srcTech, srcDayStr] = source.split(':');
    const srcDay = Number(srcDayStr);
    if (srcTech === techId && srcDay !== day) {
      // Arrastar na mesma linha preenche o intervalo (estilo planilha).
      props.onFillRange(techId, srcDay, day, state.cells[srcTech]?.[srcDay] ?? null);
    } else if (source !== cellKey(techId, day)) {
      props.onCopyValueTo(source, cellKey(techId, day));
    }
  }

  /* ---------- Técnicos ---------- */

  const cellFor = (t: Technician, d: number) => {
    const v = state.cells[t.id]?.[d];
    const key = cellKey(t.id, d);
    const classes = ['cell'];
    if (v) classes.push('filled');
    if (v?.shift === 'custom') classes.push('custom');
    if (props.serviceDeskN1 && v?.text) {
      classes.push(`n1-code-${v.text.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`);
    }
    if (selection.has(key)) classes.push('selected');
    if (conflictKeys.has(key)) classes.push('conflict');
    if (dropTarget === key) classes.push('drop-target');
    const style = v
      ? {
          ['--chip-bg' as string]: `var(--sh-${v.shift}-bg)`,
          ['--chip-fg' as string]: `var(--sh-${v.shift}-fg)`,
        }
      : undefined;
    const label = v ? (v.shift === 'custom' ? (v.text ?? '*') : SHIFT_BY_ID[v.shift].code) : '';
    const n1Definition = props.serviceDeskN1 && v?.text
      ? props.serviceDeskN1.legend.find((item) => item.code === v.text?.toUpperCase())
      : undefined;
    const title = v
      ? v.shift === 'custom'
        ? n1Definition
          ? `${n1Definition.code} · ${n1Definition.description}`
          : `Personalizado: ${v.text}`
        : SHIFT_BY_ID[v.shift].label + (v.text && v.text !== label ? ` (importado: ${v.text})` : '')
      : 'Vazio';
    return (
      <td key={d} className={weekdayOf(d) % 6 === 0 ? 'weekend' : undefined}>
        <button
          type="button"
          className={classes.join(' ')}
          style={style}
          title={title}
          aria-label={`Dia ${parseIsoDate(dateList[d - 1]).getDate()}, ${t.name ?? t.login ?? 'técnico'}: ${title} (${dateList[d - 1]})`}
          draggable
          onDragStart={(e) => onDragStart(e, t.id, d)}
          onDragOver={(e) => {
            e.preventDefault();
            setDropTarget(key);
          }}
          onDragLeave={() => setDropTarget((cur) => (cur === key ? null : cur))}
          onDrop={(e) => onDrop(e, t.id, d)}
          onClick={(e) => handleCellClick(e, t.id, d)}
        >
          {label}
        </button>
      </td>
    );
  };

  const weeks = useMemo(() => {
    const list: { start: number; end: number }[] = [];
    for (let s = 1; s <= total; s += 7) list.push({ start: s, end: Math.min(s + 6, total) });
    return list;
  }, [total]);

  return (
    <div className="grid-wrap">
      <table className={`grid${props.serviceDeskN1 ? ' grid-n1' : ''}${operationalGrouping ? ' grid-soc-grouped' : ''}`} role="grid" aria-label={operationalGrouping ? 'Grade mensal de escalas organizada por turno' : 'Grade mensal de escalas'}>
        <thead>
          {spansMonths && (
            <tr className="period-month-bar">
              <th colSpan={props.serviceDeskN1 ? 3 : 1}>Período 25–26</th>
              {monthGroups.map((group) => (
                <th key={group.key} colSpan={group.count}>{group.label}</th>
              ))}
            </tr>
          )}
          <tr className="week-bar">
            {props.serviceDeskN1 ? (
              <>
                <th className="col-shift" aria-hidden="true" />
                <th className="col-tech" aria-hidden="true" />
                <th className="col-pause" aria-hidden="true" />
              </>
            ) : (
              <th className="col-tech" aria-hidden="true" />
            )}
            {weeks.map((w, i) => (
              <th key={w.start} colSpan={w.end - w.start + 1} className="week-cell">
                Sem {i + 1}{' '}
                <button
                  className="btn btn-ghost"
                  title={`Copiar semana ${i + 1} (dias ${w.start}–${w.end})`}
                  onClick={() => props.onCopyWeek(w.start)}
                >
                  ⧉
                </button>
                <button
                  className="btn btn-ghost"
                  title={`Colar semana copiada a partir do dia ${w.start}`}
                  disabled={!props.canPasteWeek}
                  onClick={() => props.onPasteWeek(w.start)}
                >
                  ⇩
                </button>
              </th>
            ))}
          </tr>
          <tr>
            {props.serviceDeskN1 && <th className="col-shift">Turno</th>}
            <th className="col-tech">Técnico</th>
            {props.serviceDeskN1 && <th className="col-pause">Pausa</th>}
            {days.map((d) => (
              <th
                key={d}
                className={`day-head${weekdayOf(d) % 6 === 0 ? ' weekend' : ''}`}
                title={`${dateList[d - 1]} — clique para copiar/colar/limpar este dia`}
                onClick={(e) => setDayMenu({ x: e.clientX, y: e.clientY, day: d })}
              >
                <span className="day-date">{scheduleDateHeader(dateList[d - 1]).date}</span>
                <span className="day-dow">{scheduleDateHeader(dateList[d - 1]).weekday}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayTechnicians.map((t, index) => {
            const n1Row = props.serviceDeskN1?.rowsById[t.id];
            const previous = index > 0 ? props.serviceDeskN1?.rowsById[displayTechnicians[index - 1].id] : undefined;
            const startsGroup = Boolean(n1Row && previous?.shift !== n1Row.shift);
            const groupCount = n1Row
              ? displayTechnicians.filter((item) => props.serviceDeskN1?.rowsById[item.id]?.shift === n1Row.shift).length
              : 0;
            const operationalGroup = operationalGroupByTech.get(t.id);
            const previousOperationalGroup = index > 0
              ? operationalGroupByTech.get(displayTechnicians[index - 1].id)
              : undefined;
            const startsOperationalGroup = Boolean(
              operationalGrouping && operationalGroup && previousOperationalGroup !== operationalGroup,
            );
            const operationalInfo = operationalGroup ? operationalGroupInfo.get(operationalGroup) : undefined;
            return (
              <Fragment key={t.id}>
                {startsGroup && n1Row && (
                  <tr className={`n1-group-row n1-group-${n1Row.shift}`}>
                    <th colSpan={total + 3}>
                      <span>{N1_SHIFT_LABELS[n1Row.shift].label}</span>
                      <small>{N1_SHIFT_LABELS[n1Row.shift].hours} · {groupCount} técnico{groupCount === 1 ? '' : 's'}</small>
                    </th>
                  </tr>
                )}
                {startsOperationalGroup && operationalInfo && (
                  <tr className={`soc-group-row soc-group-${operationalInfo.id}`}>
                    <th colSpan={total + 1}>
                      <span>{operationalInfo.label}</span>
                      <small>
                        {operationalInfo.hours ? `${operationalInfo.hours} · ` : ''}
                        {operationalInfo.technicians.length} colaborador{operationalInfo.technicians.length === 1 ? '' : 'es'}
                        {' · '}turno predominante no período
                      </small>
                    </th>
                  </tr>
                )}
                <tr>
                  {props.serviceDeskN1 && n1Row && (
                    <td className="col-shift">
                      <select
                        aria-label={`Turno de ${n1Row.fullName}`}
                        value={n1Row.shift}
                        onChange={(event) => props.serviceDeskN1?.onUpdateShift(t.id, event.target.value as ServiceDeskN1Shift)}
                      >
                        {Object.entries(N1_SHIFT_LABELS).map(([value, info]) => (
                          <option key={value} value={value}>{info.label}</option>
                        ))}
                      </select>
                    </td>
                  )}
                  <th className="col-tech" scope="row">
                    {editingTech === t.id ? (
                      <TechEditor
                        tech={n1Row ? { ...t, name: n1Row.fullName } : t}
                        serviceDeskN1={Boolean(props.serviceDeskN1)}
                        onSave={(login, name) => {
                          props.onEditTechnician(t.id, login, name);
                          setEditingTech(null);
                        }}
                        onCancel={() => setEditingTech(null)}
                      />
                    ) : (
                      <span className="tech-cell">
                        <span
                          className="tech-text"
                          onClick={() => setEditingTech(t.id)}
                          title={n1Row ? `${n1Row.fullName}${n1Row.employeeCode ? ` · matrícula ${n1Row.employeeCode}` : ''}` : 'Clique para editar'}
                        >
                          <span className={t.name ? 'tech-name' : 'tech-name tech-missing'}>
                            {t.name ?? 'sem nome'}
                          </span>
                          <span className={t.login ? 'tech-login' : 'tech-login tech-missing'}>
                            {props.serviceDeskN1
                              ? (t.login ? `Matrícula ${t.login}` : 'sem matrícula')
                              : (t.login ?? 'sem login')}
                          </span>
                        </span>
                        <span className="tech-actions">
                          <button
                            className="icon-btn"
                            title="Editar técnico"
                            aria-label={`Editar ${t.name ?? t.login}`}
                            onClick={() => setEditingTech(t.id)}
                          >
                            ✎
                          </button>
                          <button
                            className="icon-btn danger"
                            title={props.serviceDeskN1 ? 'Remover linha da escala' : 'Remover técnico'}
                            aria-label={`Remover ${t.name ?? t.login}`}
                            onClick={() => props.onRemoveTechnician(t.id)}
                          >
                            ✕
                          </button>
                        </span>
                      </span>
                    )}
                  </th>
                  {props.serviceDeskN1 && n1Row && (
                    <td className="col-pause">
                      <input
                        type="time"
                        aria-label={`Pausa de ${n1Row.fullName}`}
                        value={n1Row.pauseTime ?? ''}
                        onChange={(event) => props.serviceDeskN1?.onUpdatePause(t.id, event.target.value)}
                      />
                    </td>
                  )}
                  {days.map((d) => cellFor(t, d))}
                </tr>
              </Fragment>
            );
          })}
          <tr className="add-tech-row">
            <td colSpan={total + (props.serviceDeskN1 ? 3 : 1)}>
              <AddTechForm onAdd={props.onAddTechnician} serviceDeskN1={Boolean(props.serviceDeskN1)} />
            </td>
          </tr>
        </tbody>
      </table>

      {menu && (
        <CellMenu
          x={menu.x}
          y={menu.y}
          selectionCount={menuTargets().length}
          initialCustom={
            state.cells[menu.techId]?.[menu.day]?.shift === 'custom'
              ? state.cells[menu.techId]?.[menu.day]?.text
              : undefined
          }
          onPick={pick}
          onClear={() => {
            props.onApplyShift(menuTargets(), null);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
          customOptions={props.serviceDeskN1?.legend}
        />
      )}

      {dayMenu && (
        <div
          className="popover"
          role="menu"
          aria-label={`Ações do dia ${dayMenu.day}`}
          style={{ left: dayMenu.x, top: dayMenu.y }}
          onMouseLeave={() => setDayMenu(null)}
        >
          <div className="menu-note">Dia {dayMenu.day}</div>
          <div className="menu-footer" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <button
              className="btn"
              onClick={() => {
                props.onCopyDay(dayMenu.day);
                setDayMenu(null);
              }}
            >
              Copiar dia
            </button>
            <button
              className="btn"
              disabled={!props.canPasteDay}
              onClick={() => {
                props.onPasteDay(dayMenu.day);
                setDayMenu(null);
              }}
            >
              Colar dia copiado
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                props.onClearDay(dayMenu.day);
                setDayMenu(null);
              }}
            >
              Limpar dia
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddTechForm({
  onAdd,
  serviceDeskN1 = false,
}: {
  onAdd: (login: string, name: string) => void;
  serviceDeskN1?: boolean;
}) {
  const [login, setLogin] = useState('');
  const [name, setName] = useState('');
  const canAdd = login.trim() !== '' || name.trim() !== '';
  const submit = () => {
    if (!canAdd) return;
    onAdd(login.trim(), name.trim());
    setLogin('');
    setName('');
  };
  return (
    <div className="add-tech-form">
      <strong>Adicionar técnico:</strong>
      <input
        aria-label="Login do novo técnico"
        placeholder={serviceDeskN1 ? 'matrícula (opcional)' : 'login (opcional)'}
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <input
        aria-label="Nome completo do novo técnico"
        placeholder="Nome completo (opcional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button className="btn btn-primary" disabled={!canAdd} onClick={submit}>
        Adicionar
      </button>
      <span className="field-hint">
        {serviceDeskN1 ? 'A nova linha começa no turno da manhã; ajuste turno e pausa na própria grade.' : 'Informe login, nome ou os dois.'}
      </span>
    </div>
  );
}

function TechEditor({
  tech,
  onSave,
  onCancel,
  serviceDeskN1 = false,
}: {
  tech: Technician;
  onSave: (login: string, name: string) => void;
  onCancel: () => void;
  serviceDeskN1?: boolean;
}) {
  const [login, setLogin] = useState(tech.login ?? '');
  const [name, setName] = useState(tech.name ?? '');
  return (
    <span className="add-tech-form" style={{ gap: 4 }}>
      <input
        aria-label="Editar login"
        style={{ width: 90 }}
        value={login}
        placeholder={serviceDeskN1 ? 'matrícula' : 'login'}
        onChange={(e) => setLogin(e.target.value)}
        autoFocus
      />
      <input
        aria-label="Editar nome"
        style={{ width: 130 }}
        value={name}
        placeholder="Nome completo"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSave(login.trim(), name.trim())}
      />
      <button className="icon-btn" title="Salvar" onClick={() => onSave(login.trim(), name.trim())}>
        ✔
      </button>
      <button className="icon-btn" title="Cancelar" onClick={onCancel}>
        ↩
      </button>
    </span>
  );
}
