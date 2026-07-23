import { SHIFT_BY_ID } from '../../constants';
import type { CellValue, ScheduleState, ShiftId, Technician } from '../../types';
import { dateRange, scheduleDates } from '../dates';
import type {
  DemoPublicationPackage,
  DemoScheduleAssignmentDto,
  DemoSchedulePeriodDto,
} from './dto';

type AssignmentShape = Pick<DemoScheduleAssignmentDto, 'assignmentType' | 'shiftName' | 'startTime' | 'endTime'>;

const ASSIGNMENT_BY_SHIFT: Record<ShiftId, (value: CellValue | undefined) => AssignmentShape> = {
  madrugada: () => ({ assignmentType: 'WORK_SHIFT', shiftName: 'Madrugada', startTime: null, endTime: null }),
  manha: () => ({ assignmentType: 'WORK_SHIFT', shiftName: 'Manhã', startTime: '07:00', endTime: '13:00' }),
  tarde: () => ({ assignmentType: 'WORK_SHIFT', shiftName: 'Tarde', startTime: '13:00', endTime: '19:00' }),
  noite: () => ({ assignmentType: 'WORK_SHIFT', shiftName: 'Noite', startTime: null, endTime: null }),
  folga: () => ({ assignmentType: 'OFF', shiftName: null, startTime: null, endTime: null }),
  ferias: () => ({ assignmentType: 'VACATION', shiftName: null, startTime: null, endTime: null }),
  plantao: () => ({ assignmentType: 'WORK_SHIFT', shiftName: 'Plantão', startTime: null, endTime: null }),
  comercial: () => ({ assignmentType: 'WORK_SHIFT', shiftName: 'Comercial', startTime: '08:00', endTime: '18:00' }),
  extra: () => ({ assignmentType: 'WORK_SHIFT', shiftName: 'Extra', startTime: null, endTime: null }),
  afastamento: () => ({ assignmentType: 'ABSENCE', shiftName: null, startTime: null, endTime: null }),
  custom: (value) => ({ assignmentType: 'OTHER', shiftName: value?.text ?? null, startTime: null, endTime: null }),
};

function monthKeyFromIso(dateIso: string): ScheduleState['monthKey'] {
  const [year, month] = dateIso.slice(0, 10).split('-').map(Number);
  return { year, month };
}

function cell(shift: ShiftId): CellValue {
  return { shift: SHIFT_BY_ID[shift].id };
}

function assignmentToCell(assignment: DemoScheduleAssignmentDto | undefined): CellValue {
  // O pacote oficial deve ter uma atribuição por pessoa/data/time; folga evita uma célula vazia em pacotes incompletos.
  if (!assignment) return cell('folga');

  switch (assignment.assignmentType) {
    case 'WORK_SHIFT':
      if (assignment.shiftName === 'Manhã') return cell('manha');
      if (assignment.shiftName === 'Tarde') return cell('tarde');
      if (assignment.shiftName === 'Comercial') return cell('comercial');
      return cell('custom');
    case 'OFF':
      return cell('folga');
    case 'VACATION':
      return cell('ferias');
    case 'ABSENCE':
      return cell('afastamento');
    case 'TRAINING':
    case 'OTHER':
      return cell('custom');
    default:
      return cell('custom');
  }
}

function schedulePeriodForTeam(pkg: DemoPublicationPackage, teamId: string): DemoSchedulePeriodDto {
  const period = pkg.schedulePeriods.find((item) => item.teamId === teamId);
  if (!period) {
    throw new Error(`Período de escala não encontrado para o time de demonstração: ${teamId}`);
  }
  return period;
}

export function demoPackageToScheduleState(pkg: DemoPublicationPackage, teamId: string): ScheduleState {
  const period = schedulePeriodForTeam(pkg, teamId);

  const team = pkg.teams.find((item) => item.id === teamId);
  if (!team) {
    throw new Error(`Equipe de demonstração não encontrada: ${teamId}`);
  }

  const periodDates = dateRange(period.startDate, period.endDate);
  const memberIdsWithAssignments = Array.from(
    new Set(pkg.scheduleAssignments.filter((item) => item.teamId === teamId).map((item) => item.memberId)),
  ).sort((a, b) => a.localeCompare(b));

  const technicians: Technician[] = memberIdsWithAssignments.map((memberId) => {
    const member = pkg.members.find((item) => item.id === memberId);
    if (!member) {
      throw new Error(`Membro de demonstração não encontrado: ${memberId}`);
    }
    return {
      id: member.id,
      name: member.displayName,
      login: member.corporateLogin ?? member.id,
    };
  });

  const assignmentsByMemberDate = new Map<string, DemoScheduleAssignmentDto>();
  for (const assignment of pkg.scheduleAssignments) {
    if (assignment.teamId === teamId) {
      assignmentsByMemberDate.set(`${assignment.memberId}|${assignment.date}`, assignment);
    }
  }

  const cells: ScheduleState['cells'] = {};
  for (const technician of technicians) {
    const row: Record<number, CellValue | undefined> = {};
    periodDates.forEach((date, index) => {
      row[index + 1] = assignmentToCell(assignmentsByMemberDate.get(`${technician.id}|${date}`));
    });
    cells[technician.id] = row;
  }

  const workShiftNames = new Set(
    pkg.scheduleAssignments
      .filter((item) => item.teamId === teamId && item.assignmentType === 'WORK_SHIFT' && item.shiftName)
      .map((item) => item.shiftName),
  );

  const state: ScheduleState = {
    monthKey: monthKeyFromIso(period.startDate),
    dates: periodDates,
    viewType: 'schedule',
    technicians,
    cells,
    sourceLabel: `Ambiente de Demonstração — ${team.name}`,
    isDemo: true,
    origin: 'demo-workspace-package',
    demoTeamId: teamId,
  };

  // Mais de um turno de trabalho indica escala rotativa, onde o agrupamento visual por turno ajuda a leitura.
  if (workShiftNames.size > 1) state.visualGrouping = 'operational-shift';

  return { ...state, dates: scheduleDates(state) };
}

function cellToAssignmentShape(value: CellValue | undefined): AssignmentShape {
  const shift = value?.shift ?? 'folga';
  return ASSIGNMENT_BY_SHIFT[shift](value);
}

export function applyScheduleStateToPackage(
  pkg: DemoPublicationPackage,
  state: ScheduleState,
  teamId: string,
): DemoPublicationPackage {
  const period = schedulePeriodForTeam(pkg, teamId);
  const periodDates = dateRange(period.startDate, period.endDate);
  const validDates = new Set(periodDates);
  const dates = scheduleDates(state);

  for (const date of dates) {
    if (!validDates.has(date)) {
      throw new Error(`Data fora do período de demonstração para ${teamId}: ${date}`);
    }
  }

  const originalAssignmentsByMemberDate = new Map<string, DemoScheduleAssignmentDto>();
  for (const assignment of pkg.scheduleAssignments) {
    if (assignment.teamId === teamId) {
      originalAssignmentsByMemberDate.set(`${assignment.memberId}|${assignment.date}`, assignment);
    }
  }

  const recalculatedAssignmentsByMemberDate = new Map<string, DemoScheduleAssignmentDto>();
  for (const technician of state.technicians) {
    dates.forEach((date, index) => {
      const original = originalAssignmentsByMemberDate.get(`${technician.id}|${date}`);
      if (!original) {
        throw new Error(`Assignment de demonstração ausente para ${teamId}/${technician.id}/${date}.`);
      }
      if (original.periodId !== period.id) {
        throw new Error(`Assignment de demonstração com periodId inesperado para ${teamId}/${technician.id}/${date}.`);
      }
      const shape = cellToAssignmentShape(state.cells[technician.id]?.[index + 1]);
      recalculatedAssignmentsByMemberDate.set(`${technician.id}|${date}`, {
        ...original,
        assignmentType: shape.assignmentType,
        shiftName: shape.shiftName,
        startTime: shape.startTime,
        endTime: shape.endTime,
      });
    });
  }

  return {
    ...pkg,
    scheduleAssignments: pkg.scheduleAssignments.flatMap((assignment) => {
      if (assignment.teamId !== teamId) return [assignment];
      const recalculated = recalculatedAssignmentsByMemberDate.get(`${assignment.memberId}|${assignment.date}`);
      return recalculated ? [recalculated] : [];
    }),
  };
}
