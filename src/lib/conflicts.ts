import { fold } from './normalize';
import { formatBrDate, parseIsoDate, scheduleDates, workInterval } from './dates';
import type { Conflict, ScheduleState } from '../types';
import { isWorkAssignment } from './assignments';

function techLabel(t: { login?: string; name?: string }): string {
  return t.name ?? t.login ?? '(sem identificação)';
}

function consecutiveDates(previous: string | undefined, current: string): boolean {
  if (!previous) return false;
  return (parseIsoDate(current).getTime() - parseIsoDate(previous).getTime()) / 86_400_000 === 1;
}

function n1Interval(date: string, shift: 'madrugada' | 'manha' | 'tarde' | 'noite') {
  const base = parseIsoDate(date);
  const start = new Date(base);
  const end = new Date(base);
  if (shift === 'madrugada') {
    start.setHours(1, 0, 0, 0);
    end.setHours(7, 0, 0, 0);
  } else if (shift === 'manha') {
    start.setHours(7, 0, 0, 0);
    end.setHours(13, 0, 0, 0);
  } else if (shift === 'tarde') {
    start.setHours(13, 0, 0, 0);
    end.setHours(19, 0, 0, 0);
  } else {
    start.setHours(19, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    end.setHours(1, 0, 0, 0);
  }
  return { start, end };
}

function detectN1Conflicts(state: ScheduleState): Conflict[] {
  const data = state.serviceDeskN1;
  if (!data) return [];
  const conflicts: Conflict[] = [];
  const dates = scheduleDates(state);
  const technicians = new Map(state.technicians.map((technician) => [technician.id, technician]));
  const assignments = new Map<
    string,
    Map<number, { value: NonNullable<(typeof data.principalRows)[number]['cells'][number]>; shift: (typeof data.principalRows)[number]['shift'] }>
  >();

  for (const row of data.principalRows) {
    const byDay = assignments.get(row.technicianId) ?? new Map();
    for (const [dayText, value] of Object.entries(row.cells)) {
      if (value) byDay.set(Number(dayText), { value, shift: row.shift });
    }
    assignments.set(row.technicianId, byDay);
  }

  for (const [technicianId, byDay] of assignments) {
    const technician = technicians.get(technicianId) ?? { id: technicianId, name: '(sem identificação)' };
    let streak = 0;
    let previousWorkDate: string | undefined;
    const intervals: Array<{ day: number; date: string; start: Date; end: Date; label: string }> = [];

    for (let day = 1; day <= dates.length; day++) {
      const date = dates[day - 1];
      const current = byDay.get(day);
      const before = byDay.get(day - 1);
      const next = byDay.get(day + 1);
      const works = Boolean(current && isWorkAssignment(current.value));

      if (
        current?.value.shift === 'ferias' &&
        before && isWorkAssignment(before.value) &&
        next && isWorkAssignment(next.value)
      ) {
        conflicts.push({
          kind: 'ferias-interrompidas',
          techId: technicianId,
          day,
          message: `${techLabel(technician)}: um único dia de férias entre dias trabalhados em ${formatBrDate(date)}.`,
        });
      }

      if (works && current) {
        streak = consecutiveDates(previousWorkDate, date) ? streak + 1 : 1;
        previousWorkDate = date;
        if (streak === 7) {
          conflicts.push({
            kind: 'sequencia',
            techId: technicianId,
            day,
            message: `${techLabel(technician)}: 7+ dias consecutivos de trabalho até ${formatBrDate(date)} sem folga registrada.`,
          });
        }
        const interval = n1Interval(date, current.shift);
        intervals.push({
          day,
          date,
          ...interval,
          label: `${current.value.text ?? current.value.shift} · ${current.shift}`,
        });
      } else {
        streak = 0;
        previousWorkDate = undefined;
      }
    }

    intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let index = 1; index < intervals.length; index++) {
      const previous = intervals[index - 1];
      const current = intervals[index];
      const restHours = (current.start.getTime() - previous.end.getTime()) / 3_600_000;
      if (restHours >= 11) continue;
      conflicts.push({
        kind: 'descanso',
        techId: technicianId,
        day: current.day,
        message: `${techLabel(technician)}: descanso de ${Math.max(0, restHours).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h entre ${formatBrDate(previous.date)} (${previous.label}) e ${formatBrDate(current.date)} (${current.label}); mínimo esperado: 11h.`,
      });
    }
  }

  return conflicts;
}

/** Alertas informativos; nunca bloqueiam a edição. */
export function detectConflicts(state: ScheduleState): Conflict[] {
  if (state.viewType === 'oncall') return [];
  if (state.serviceDeskN1) return detectN1Conflicts(state);
  const conflicts: Conflict[] = [];
  const dates = scheduleDates(state);

  const seen = new Map<string, string>();
  for (const technician of state.technicians) {
    for (const key of [technician.login?.toLowerCase(), technician.name ? fold(technician.name) : undefined]) {
      if (!key) continue;
      const previous = seen.get(key);
      if (previous && previous !== technician.id) {
        conflicts.push({
          kind: 'tecnico-duplicado',
          techId: technician.id,
          message: `“${techLabel(technician)}” aparece mais de uma vez na lista de técnicos.`,
        });
        break;
      }
      seen.set(key, technician.id);
    }
  }

  for (const technician of state.technicians) {
    const row = state.cells[technician.id] ?? {};
    let streak = 0;
    let previousWorkDate: string | undefined;
    const intervals: Array<{ day: number; date: string; start: Date; end: Date; label: string }> = [];

    for (let index = 1; index <= dates.length; index++) {
      const date = dates[index - 1];
      const current = row[index];
      const next = row[index + 1];
      const before = row[index - 1];

      if (current?.shift === 'ferias' && isWorkAssignment(before) && isWorkAssignment(next)) {
        conflicts.push({
          kind: 'ferias-interrompidas',
          techId: technician.id,
          day: index,
          message: `${techLabel(technician)}: um único dia de férias entre dias trabalhados em ${formatBrDate(date)}.`,
        });
      }

      if (current && isWorkAssignment(current)) {
        streak = consecutiveDates(previousWorkDate, date) ? streak + 1 : 1;
        previousWorkDate = date;
        if (streak === 7) {
          conflicts.push({
            kind: 'sequencia',
            techId: technician.id,
            day: index,
            message: `${techLabel(technician)}: 7+ dias consecutivos de trabalho até ${formatBrDate(date)} sem folga registrada.`,
          });
        }
        const interval = workInterval(date, current);
        if (interval) intervals.push({ day: index, date, ...interval, label: current.text ?? current.shift });
      } else {
        streak = 0;
        previousWorkDate = undefined;
      }
    }

    intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let index = 1; index < intervals.length; index++) {
      const previous = intervals[index - 1];
      const current = intervals[index];
      const restHours = (current.start.getTime() - previous.end.getTime()) / 3_600_000;
      if (restHours >= 11) continue;
      const shown = Math.max(0, restHours);
      conflicts.push({
        kind: 'descanso',
        techId: technician.id,
        day: current.day,
        message: `${techLabel(technician)}: descanso de ${shown.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h entre ${formatBrDate(previous.date)} (${previous.label}) e ${formatBrDate(current.date)} (${current.label}); mínimo esperado: 11h.`,
      });
    }
  }
  return conflicts;
}
