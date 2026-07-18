import { SHIFT_BY_ID } from '../../constants';
import type { CellValue, ScheduleState, ShiftId, Technician } from '../../types';
import { dateRange, scheduleDates } from '../dates';
import type { DemoPublicationPackage, DemoScheduleAssignmentDto } from './dto';

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

export function demoPackageToScheduleState(pkg: DemoPublicationPackage, teamId: string): ScheduleState {
  const period = pkg.schedulePeriods.find((item) => item.teamId === teamId);
  if (!period) {
    throw new Error(`Período de escala não encontrado para o time de demonstração: ${teamId}`);
  }

  const team = pkg.teams.find((item) => item.id === teamId);
  if (!team) {
    throw new Error(`Time de demonstração não encontrado: ${teamId}`);
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
