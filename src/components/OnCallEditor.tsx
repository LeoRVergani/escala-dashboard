import { useMemo, useState, type DragEvent } from 'react';
import {
  addMonths,
  createOnCallRecord,
  duplicateCycleStartDates,
  missingCycleStartDates,
  monthValue,
  onCallCycleAccounting,
  overlapsOperationalCycle,
  segmentsForDay,
  startsInOperationalCycle,
} from '../lib/onCall';
import { cycle25To26 } from '../lib/dates';
import { automaticTechnicianColor, technicianStyle } from '../lib/technicianStyle';
import type { MonthKey, OnCallRecord, Technician } from '../types';

interface Props {
  records: OnCallRecord[];
  technicians: Technician[];
  monthKey: MonthKey;
  onChange: (record: OnCallRecord) => void;
  onAddRecord: (record: OnCallRecord) => void;
  onDeleteRecord: (recordId: string) => void;
  onMoveRecord: (recordId: string, dateIso: string) => void;
  onAddTechnicians: (names: string[]) => void;
  onRenameTechnician: (technicianId: string, name: string) => void;
  onSetTechnicianColor: (technicianId: string, color: string) => void;
  onRemoveTechnician: (technicianId: string) => void;
  onSetMonth: (monthKey: MonthKey) => void;
  onAutoFill: () => void;
  onClearMonth: () => void;
}

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type CardMode = 'single' | 'edges' | 'segments';

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length <= 2 ? name.trim() : `${parts[0]} ${parts[parts.length - 1]}`;
}

function hours(minutes: number): string {
  const value = minutes / 60;
  return Number.isInteger(value) ? `${value}h` : `${value.toFixed(1).replace('.', ',')}h`;
}

function brDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLocaleLowerCase('pt-BR');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface RecordDialogProps {
  record: OnCallRecord;
  technicians: Technician[];
  isNew: boolean;
  onCancel: () => void;
  onSave: (record: OnCallRecord) => void;
  onDelete?: () => void;
}

function RecordDialog({ record, technicians, isNew, onCancel, onSave, onDelete }: RecordDialogProps) {
  const [draft, setDraft] = useState(record);
  const valid = Boolean(draft.technician.trim() && draft.start && draft.end && draft.end > draft.start);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="modal oncall-dialog" role="dialog" aria-modal="true" aria-labelledby="oncall-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 id="oncall-dialog-title">{isNew ? 'Novo plantão' : 'Editar plantão'}</h2>
            <p>Os horários completos permanecem preservados, inclusive quando atravessam a meia-noite.</p>
          </div>
          <button className="btn btn-ghost" onClick={onCancel} aria-label="Fechar">×</button>
        </div>
        <div className="modal-body oncall-form">
          <label>
            Plantonista
            <input list="oncall-technicians" value={draft.technician} onChange={(event) => setDraft({ ...draft, technician: event.target.value })} />
          </label>
          <datalist id="oncall-technicians">
            {technicians.map((technician) => technician.name && <option key={technician.id} value={technician.name} />)}
          </datalist>
          <div className="oncall-form-grid">
            <label>Data inicial<input type="date" value={draft.start.slice(0, 10)} onChange={(event) => setDraft({ ...draft, start: `${event.target.value}T${draft.start.slice(11, 16)}` })} /></label>
            <label>Horário inicial<input type="time" value={draft.start.slice(11, 16)} onChange={(event) => setDraft({ ...draft, start: `${draft.start.slice(0, 10)}T${event.target.value}` })} /></label>
            <label>Data final<input type="date" value={draft.end.slice(0, 10)} onChange={(event) => setDraft({ ...draft, end: `${event.target.value}T${draft.end.slice(11, 16)}` })} /></label>
            <label>Horário final<input type="time" value={draft.end.slice(11, 16)} onChange={(event) => setDraft({ ...draft, end: `${draft.end.slice(0, 10)}T${event.target.value}` })} /></label>
          </div>
          {!valid && <p className="oncall-form-error">Informe o plantonista e um horário final posterior ao horário inicial.</p>}
        </div>
        <div className="modal-actions">
          {onDelete && <button className="btn btn-danger" onClick={onDelete}>Excluir plantão</button>}
          <span className="modal-actions-spacer" />
          <button className="btn" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" disabled={!valid} onClick={() => onSave(draft)}>Salvar</button>
        </div>
      </section>
    </div>
  );
}

export function OnCallEditor({
  records,
  technicians,
  monthKey,
  onChange,
  onAddRecord,
  onDeleteRecord,
  onMoveRecord,
  onAddTechnicians,
  onRenameTechnician,
  onSetTechnicianColor,
  onRemoveTechnician,
  onSetMonth,
  onAutoFill,
  onClearMonth,
}: Props) {
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [cardMode, setCardMode] = useState<CardMode>('single');
  const [compact, setCompact] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ record: OnCallRecord; isNew: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const cycle = useMemo(() => cycle25To26(monthKey), [monthKey]);
  const dates = cycle.dates;
  const startDateSet = useMemo(() => new Set(cycle.startDates), [cycle.startDates]);
  const monthRecords = useMemo(() => records.filter((record) => overlapsOperationalCycle(record, monthKey)), [records, monthKey]);
  const accounting = useMemo(() => onCallCycleAccounting(records, monthKey, technicians), [records, monthKey, technicians]);
  const missing = useMemo(() => missingCycleStartDates(records, monthKey), [records, monthKey]);
  const duplicates = useMemo(() => duplicateCycleStartDates(records, monthKey), [records, monthKey]);
  const totalMinutes = accounting.reduce((sum, row) => sum + row.minutes, 0);
  const calendarMinutes = accounting.reduce((sum, row) => sum + row.calendarMinutes, 0);
  const totalShifts = accounting.reduce((sum, row) => sum + row.shifts, 0);
  const weekendMinutes = accounting.reduce((sum, row) => sum + row.weekendMinutes, 0);
  const unusualRecords = monthRecords.filter((record) => record.durationMinutes <= 0 || record.durationMinutes > 24 * 60);

  const createForDate = (technician: string, dateIso: string) => {
    const record = createOnCallRecord(technician, dateIso, `plantao-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    onAddRecord(record);
    setMessage(`${shortName(technician)} adicionado em ${brDate(dateIso)}.`);
  };

  const openNew = (dateIso?: string) => {
    const date = dateIso ?? missing[0] ?? cycle.start;
    const technician = technicians.find((item) => item.name)?.name ?? '';
    setEditing({
      record: createOnCallRecord(technician, date, `plantao-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      isNew: true,
    });
  };

  const handleDrop = (event: DragEvent, dateIso: string) => {
    event.preventDefault();
    if (!startDateSet.has(dateIso)) return;
    const payload = event.dataTransfer.getData('text/plain');
    if (payload.startsWith('technician:')) {
      const id = payload.slice('technician:'.length);
      const technician = technicians.find((item) => item.id === id);
      if (technician?.name) createForDate(technician.name, dateIso);
    } else if (payload.startsWith('record:')) {
      onMoveRecord(payload.slice('record:'.length), dateIso);
      setMessage(`Plantão movido para ${brDate(dateIso)}.`);
    }
  };

  const addName = () => {
    const names = uniqueNames(newName.split(/[\n;,]+/));
    if (!names.length) return;
    onAddTechnicians(names);
    setNewName('');
    setMessage(`${names.length} plantonista${names.length === 1 ? '' : 's'} adicionado${names.length === 1 ? '' : 's'}.`);
  };

  const copyPreviousNames = () => {
    const previous = addMonths(monthKey, -1);
    const names = uniqueNames(records.filter((record) => startsInOperationalCycle(record, previous)).map((record) => record.technician));
    if (!names.length) {
      setMessage('O mês anterior não possui plantonistas para copiar.');
      return;
    }
    onAddTechnicians(names);
    setMessage(`${names.length} nome${names.length === 1 ? '' : 's'} copiado${names.length === 1 ? '' : 's'} do mês anterior.`);
  };

  const renderRecordCards = (dateIso: string) => {
    const starting = records.filter((record) => record.start.slice(0, 10) === dateIso);
    const ending = records.filter((record) => record.end.slice(0, 10) === dateIso && record.end.slice(0, 10) !== record.start.slice(0, 10));
    const titleFor = (record: OnCallRecord) => `${record.technician} · ${record.start.replace('T', ' ')} até ${record.end.replace('T', ' ')}`;
    const dragStart = (event: DragEvent, record: OnCallRecord) => {
      event.stopPropagation();
      event.dataTransfer.setData('text/plain', `record:${record.id}`);
    };

    if (cardMode === 'single') {
      return starting.map((record) => (
        <button
          key={`single-${record.id}`}
          className={`oncall-record-card oncall-record-single${record.start.slice(0, 10) !== record.end.slice(0, 10) ? ' cross-day' : ''}`}
          style={technicianStyle(record.technician, technicians)}
          draggable
          onDragStart={(event) => dragStart(event, record)}
          onClick={() => setEditing({ record, isNew: false })}
          title={titleFor(record)}
        >
          <span className="record-name">{shortName(record.technician)}</span>
          <span className="record-range"><b>Entrada</b> {brDate(record.start.slice(0, 10))} {record.start.slice(11, 16)}</span>
          <span className="record-range"><b>Saída</b> {brDate(record.end.slice(0, 10))} {record.end.slice(11, 16)}</span>
          <span className="record-duration">{hours(record.durationMinutes)}</span>
        </button>
      ));
    }

    if (cardMode === 'edges') {
      return [
        ...starting.map((record) => (
          <button
            key={`entry-${record.id}`}
            className="oncall-record-card oncall-record-edge entry"
            style={technicianStyle(record.technician, technicians)}
            draggable
            onDragStart={(event) => dragStart(event, record)}
            onClick={() => setEditing({ record, isNew: false })}
            title={titleFor(record)}
          >
            <span className="record-name">{shortName(record.technician)}</span>
            <span className="record-edge-label">Entrada · {record.start.slice(11, 16)}</span>
            {record.start.slice(0, 10) === record.end.slice(0, 10) && <span className="record-edge-label">Saída · {record.end.slice(11, 16)}</span>}
          </button>
        )),
        ...ending.map((record) => (
          <button
            key={`exit-${record.id}`}
            className="oncall-record-card oncall-record-edge exit"
            style={technicianStyle(record.technician, technicians)}
            onClick={() => setEditing({ record, isNew: false })}
            title={titleFor(record)}
          >
            <span className="record-name">{shortName(record.technician)}</span>
            <span className="record-edge-label">Saída · {record.end.slice(11, 16)}</span>
          </button>
        )),
      ];
    }

    return segmentsForDay(records, dateIso).map((segment) => (
      <button
        key={`${segment.record.id}-${dateIso}`}
        className="oncall-record-card"
        style={technicianStyle(segment.record.technician, technicians)}
        draggable={segment.startsHere}
        onDragStart={(event) => {
          if (segment.startsHere) dragStart(event, segment.record);
        }}
        onClick={() => setEditing({ record: segment.record, isNew: false })}
        title={titleFor(segment.record)}
      >
        <span className="record-name">{shortName(segment.record.technician)}</span>
        <span className="record-time">{segment.startTime}–{segment.endTime}</span>
        {!segment.startsHere && <span className="record-continuation">continuação</span>}
      </button>
    ));
  };

  return (
    <main className="oncall-planner">
      <section className="oncall-modebar">
        <div>
          <strong>Modo Plantão COSI</strong>
          <span>ciclo 25–26; dias úteis cobrem somente 19h–07h e finais de semana mantêm cobertura contínua</span>
        </div>
        <div className="oncall-view-controls">
          <div className="oncall-tabs" role="tablist" aria-label="Visualização dos plantões">
            <button className="btn" role="tab" aria-selected={view === 'calendar'} onClick={() => setView('calendar')}>Calendário</button>
            <button className="btn" role="tab" aria-selected={view === 'list'} onClick={() => setView('list')}>Lista detalhada</button>
          </div>
          {view === 'calendar' && (
            <>
              <div className="oncall-tabs oncall-card-modes" role="group" aria-label="Formato dos cartões">
                <button className="btn" aria-pressed={cardMode === 'single'} onClick={() => setCardMode('single')}>Card único</button>
                <button className="btn" aria-pressed={cardMode === 'edges'} onClick={() => setCardMode('edges')}>Entrada e saída</button>
                <button className="btn" aria-pressed={cardMode === 'segments'} onClick={() => setCardMode('segments')}>Dividido por dia</button>
              </div>
              <button className="btn" aria-pressed={compact} onClick={() => setCompact((value) => !value)}>{compact ? 'Visual normal' : 'Compactar'}</button>
            </>
          )}
        </div>
      </section>

      <section className="oncall-commandbar">
        <div className="oncall-month-nav">
          <button className="btn btn-ghost" onClick={() => onSetMonth(addMonths(monthKey, -1))} aria-label="Mês anterior">←</button>
          <label>
            Ciclo que termina em
            <input type="month" value={monthValue(monthKey)} onChange={(event) => onSetMonth({ year: Number(event.target.value.slice(0, 4)), month: Number(event.target.value.slice(5, 7)) })} />
          </label>
          <button className="btn btn-ghost" onClick={() => onSetMonth(addMonths(monthKey, 1))} aria-label="Próximo mês">→</button>
        </div>
        <div className="oncall-command-actions">
          <button className="btn" onClick={() => { onSetMonth(addMonths(monthKey, 1)); setMessage('Próximo ciclo aberto com os mesmos plantonistas disponíveis.'); }}>Criar próximo ciclo</button>
          <button className="btn" onClick={copyPreviousNames}>Copiar nomes do mês anterior</button>
          <button className="btn btn-primary" disabled={!technicians.some((item) => item.name) || missing.length === 0} onClick={() => { onAutoFill(); setMessage('Inícios vazios do ciclo distribuídos de forma equilibrada entre os plantonistas.'); }}>Autocompletar ciclo</button>
          <button className="btn" onClick={() => openNew()}>Novo plantão</button>
        </div>
      </section>

      {message && <div className="oncall-message" role="status"><span>{message}</span><button className="btn btn-ghost" onClick={() => setMessage(null)}>×</button></div>}

      <section className="oncall-coverage-rule" aria-label="Regra operacional do plantão">
        <strong>Como a cobertura funciona</strong>
        <span><b>Segunda a sexta, 07h–19h:</b> equipe presencial — não conta como plantão.</span>
        <span><b>Domingo a quinta:</b> plantão 19h–07h.</span>
        <span><b>Sexta e sábado:</b> plantão contínuo 19h–19h.</span>
      </section>

      <section className="oncall-summary" aria-label="Resumo do ciclo">
        <article><span>Plantões iniciados no ciclo</span><strong>{totalShifts}</strong><small>{brDate(cycle.start)} a {brDate(cycle.lastStart)}</small></article>
        <article><span>Horas dos plantões iniciados</span><strong>{hours(totalMinutes)}</strong><small>12h nos dias úteis; 24h nas entradas de sexta e sábado</small></article>
        <article><span>Horas dentro da tela 25–26</span><strong>{hours(calendarMinutes)}</strong><small>de {brDate(cycle.start)} até o fim de {brDate(cycle.end)}</small></article>
        <article><span>Horas em fins de semana</span><strong>{hours(weekendMinutes)}</strong><small>sábados e domingos destacados</small></article>
        <article className={missing.length ? 'summary-alert' : 'summary-ok'}><span>Dias sem início de plantão</span><strong>{missing.length}</strong><small>{duplicates.length ? `${duplicates.length} dia(s) com mais de um início` : 'um início por dia até o dia 25'}</small></article>
      </section>

      {unusualRecords.length > 0 && (
        <section className="oncall-time-warning" aria-label="Horários para conferir">
          <div>
            <strong>Horários para conferir</strong>
            <span>{unusualRecords.length} plantão{unusualRecords.length === 1 ? '' : 'ões'} possui duração acima de 24 horas ou inválida. Revise o registro ou salve novamente para aplicar uma exceção manual consciente.</span>
          </div>
          <div className="oncall-time-warning-list">
            {unusualRecords.slice(0, 4).map((record) => (
              <button key={record.id} className="btn" onClick={() => setEditing({ record, isNew: false })}>
                {shortName(record.technician)} · {brDate(record.start.slice(0, 10))} {record.start.slice(11, 16)} → {brDate(record.end.slice(0, 10))} {record.end.slice(11, 16)} · {hours(record.durationMinutes)}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="oncall-layout">
        <aside className="oncall-roster">
          <div className="oncall-roster-head">
            <div><strong>Plantonistas</strong><span>arraste um nome para o dia</span></div>
            <span className="oncall-roster-count">{technicians.length}</span>
          </div>
          <div className="oncall-add-tech">
            <textarea rows={2} placeholder="Digite um ou vários nomes" value={newName} onChange={(event) => setNewName(event.target.value)} />
            <button className="btn btn-primary" disabled={!newName.trim()} onClick={addName}>Adicionar</button>
          </div>
          <div className="oncall-roster-list">
            {technicians.map((technician) => {
              const row = accounting.find((item) => item.technician === technician.name);
              return (
                <div
                  key={technician.id}
                  className="oncall-roster-item"
                  draggable={Boolean(technician.name)}
                  style={technicianStyle(technician.name ?? technician.id, technicians)}
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', `technician:${technician.id}`)}
                >
                  <span className="oncall-avatar">{technician.name?.trim().charAt(0).toUpperCase() || '?'}</span>
                  <div>
                    <input aria-label={`Nome de ${technician.name ?? 'plantonista'}`} value={technician.name ?? ''} onChange={(event) => onRenameTechnician(technician.id, event.target.value)} />
                    <small>{row?.shifts ?? 0} plantões · {hours(row?.minutes ?? 0)}</small>
                  </div>
                  <label className="oncall-color-picker" title={`Cor de ${technician.name ?? 'plantonista'}`}>
                    <span className="sr-only">Cor de {technician.name ?? 'plantonista'}</span>
                    <input
                      type="color"
                      aria-label={`Cor de ${technician.name ?? 'plantonista'}`}
                      value={technician.color ?? automaticTechnicianColor(technician.name ?? technician.id)}
                      onChange={(event) => onSetTechnicianColor(technician.id, event.target.value)}
                    />
                  </label>
                  <button className="oncall-remove-tech" title="Remover da lista" aria-label={`Remover ${technician.name ?? 'plantonista'}`} onClick={() => onRemoveTechnician(technician.id)}>×</button>
                </div>
              );
            })}
            {!technicians.length && <p className="oncall-empty-note">Adicione os nomes para montar uma escala vazia ou use a importação do relatório.</p>}
          </div>
          <div className="oncall-default-rule">
            <strong>Padrão usado no arraste</strong>
            <span>Dom–Qui: 19:00–07:00 (12h)</span>
            <span>Sex–Sáb: 19:00–19:00 (24h)</span>
            <span>Seg–Sex 07:00–19:00: equipe presencial</span>
            <small>Depois do arraste, clique no cartão para editar qualquer horário.</small>
          </div>
        </aside>

        <section className="oncall-workspace">
          {view === 'calendar' ? (
            <>
              <div className="oncall-calendar-title">
                <div>
                  <strong>25 {MONTHS[Number(cycle.start.slice(5, 7)) - 1]} {cycle.start.slice(0, 4)} → 26 {MONTHS[monthKey.month - 1]} {monthKey.year}</strong>
                  <span>{monthRecords.length} registro{monthRecords.length === 1 ? '' : 's'} tocando o ciclo; inícios programados até o dia 25</span>
                </div>
                <div className="oncall-calendar-key"><span className="weekday-key" />Dia útil <span className="weekend-key" />Fim de semana</div>
              </div>
              <div className="oncall-cycle-months" aria-label="Meses exibidos" style={{ gridTemplateColumns: `${cycle.dates.filter((date) => date.slice(0, 7) === cycle.start.slice(0, 7)).length}fr ${cycle.dates.filter((date) => date.slice(0, 7) === monthValue(monthKey)).length}fr` }}>
                <span>{MONTHS[Number(cycle.start.slice(5, 7)) - 1]} {cycle.start.slice(0, 4)} · 25–{new Date(Number(cycle.start.slice(0, 4)), Number(cycle.start.slice(5, 7)), 0).getDate()}</span>
                <span>{MONTHS[monthKey.month - 1]} {monthKey.year} · 01–26</span>
              </div>
              <div className="oncall-week-header">{WEEK_DAYS.map((day, index) => <div key={day} className={index === 0 || index === 6 ? 'weekend' : ''}>{day}</div>)}</div>
              <div className={`oncall-calendar${compact ? ' compact' : ''}`} aria-label={`Calendário operacional de ${brDate(cycle.start)} a ${brDate(cycle.end)}`}>
                {dates.map((dateIso) => {
                  const [year, month, day] = dateIso.split('-').map(Number);
                  const weekday = new Date(year, month - 1, day).getDay();
                  const inCycle = dateIso >= cycle.start && dateIso <= cycle.end;
                  const canStart = startDateSet.has(dateIso);
                  const isCycleEnd = dateIso === cycle.end;
                  const cards = renderRecordCards(dateIso);
                  const hasMissing = canStart && missing.includes(dateIso);
                  const hasDuplicate = canStart && duplicates.includes(dateIso);
                  return (
                    <article
                      key={dateIso}
                      className={`oncall-day${weekday === 0 || weekday === 6 ? ' weekend' : ''}${inCycle ? '' : ' outside'}${hasMissing ? ' missing' : ''}${hasDuplicate ? ' duplicate' : ''}${isCycleEnd ? ' cycle-end' : ''}${day === 1 ? ' month-start' : ''}`}
                      style={dateIso === cycle.start ? { gridColumnStart: weekday + 1 } : undefined}
                      onDragOver={(event) => { if (canStart) event.preventDefault(); }}
                      onDrop={(event) => handleDrop(event, dateIso)}
                    >
                      <header>
                        <div><strong>{String(day).padStart(2, '0')}</strong>{(dateIso === cycle.start || day === 1 || isCycleEnd) && <span>{MONTHS[month - 1].slice(0, 3)}</span>}</div>
                        {canStart && <button className="oncall-day-add" onClick={() => openNew(dateIso)} title="Adicionar início de plantão neste dia">＋</button>}
                      </header>
                      <div className="oncall-day-records">
                        {cards}
                        {cards.length === 0 && canStart && <span className="oncall-drop-hint">Arraste um nome aqui</span>}
                        {cards.length === 0 && isCycleEnd && <span className="oncall-cycle-end-note">Dia de saída do último plantão do ciclo</span>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="oncall-table-scroll">
              <table className="oncall-table">
                <thead><tr><th>Plantonista</th><th>Data inicial</th><th>Horário inicial</th><th>Data final</th><th>Horário final</th><th>Duração</th><th /></tr></thead>
                <tbody>
                  {[...monthRecords].sort((a, b) => a.start.localeCompare(b.start)).map((record) => (
                    <tr key={record.id}>
                      <td><input value={record.technician} onChange={(event) => onChange({ ...record, technician: event.target.value })} /></td>
                      <td><input type="date" value={record.start.slice(0, 10)} onChange={(event) => onChange({ ...record, start: `${event.target.value}T${record.start.slice(11, 16)}` })} /></td>
                      <td><input type="time" value={record.start.slice(11, 16)} onChange={(event) => onChange({ ...record, start: `${record.start.slice(0, 10)}T${event.target.value}` })} /></td>
                      <td><input type="date" value={record.end.slice(0, 10)} onChange={(event) => onChange({ ...record, end: `${event.target.value}T${record.end.slice(11, 16)}` })} /></td>
                      <td><input type="time" value={record.end.slice(11, 16)} onChange={(event) => onChange({ ...record, end: `${record.end.slice(0, 10)}T${event.target.value}` })} /></td>
                      <td>{hours(record.durationMinutes)}</td>
                      <td><button className="btn btn-ghost" onClick={() => setEditing({ record, isNew: false })}>Editar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section className="oncall-accounting">
            <div className="oncall-section-title">
              <div><strong>Contabilidade dos plantões</strong><span>o total principal usa os plantões iniciados de 25 a 25; a coluna 25–26 mostra apenas as horas visíveis no ciclo</span></div>
              <button className="btn btn-danger" disabled={!records.some((record) => startsInOperationalCycle(record, monthKey))} onClick={() => { if (window.confirm(`Excluir os plantões iniciados no ciclo ${brDate(cycle.start)} a ${brDate(cycle.lastStart)}?`)) onClearMonth(); }}>Limpar plantões do ciclo</button>
            </div>
            <div className="oncall-accounting-scroll">
              <table>
                <thead><tr><th>Plantonista</th><th>Plantões iniciados</th><th>Horas dos plantões</th><th>Horas na tela 25–26</th><th>Inícios no fim de semana</th><th>Horas no fim de semana</th></tr></thead>
                <tbody>
                  {accounting.map((row) => (
                    <tr key={row.technician}>
                      <td><span className="accounting-dot" style={technicianStyle(row.technician, technicians)} />{row.technician}</td>
                      <td>{row.shifts}</td><td>{hours(row.minutes)}</td><td>{hours(row.calendarMinutes)}</td><td>{row.weekendStarts}</td><td>{hours(row.weekendMinutes)}</td>
                    </tr>
                  ))}
                  {!accounting.length && <tr><td colSpan={6} className="oncall-empty-note">Ainda não há plantonistas ou plantões neste mês.</td></tr>}
                </tbody>
                {accounting.length > 0 && <tfoot><tr><th>Total</th><th>{totalShifts}</th><th>{hours(totalMinutes)}</th><th>{hours(calendarMinutes)}</th><th>{accounting.reduce((sum, row) => sum + row.weekendStarts, 0)}</th><th>{hours(weekendMinutes)}</th></tr></tfoot>}
              </table>
            </div>
          </section>
        </section>
      </div>

      {editing && (
        <RecordDialog
          key={`${editing.record.id}-${editing.isNew ? 'new' : 'edit'}`}
          record={editing.record}
          technicians={technicians}
          isNew={editing.isNew}
          onCancel={() => setEditing(null)}
          onSave={(record) => {
            if (editing.isNew) onAddRecord(record);
            else onChange(record);
            setEditing(null);
          }}
          onDelete={editing.isNew ? undefined : () => { onDeleteRecord(editing.record.id); setEditing(null); }}
        />
      )}
    </main>
  );
}
