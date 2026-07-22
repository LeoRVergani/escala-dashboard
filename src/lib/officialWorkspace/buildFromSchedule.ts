import type { CellValue, ScheduleState, ShiftId } from '../../types';
import { normalizeLogin } from '../authRepository';
import { scheduleDates } from '../dates';
import type { DemoPublicationPackage, DemoScheduleAssignmentDto } from '../demoWorkspace/dto';
import { fold } from '../normalize';
import { OFFICIAL_WORKSPACE_ID } from './retarget';

export interface OfficialImportMemberInput {
  displayName: string;
  login: string;
  entraTenantId?: string;
  entraObjectId?: string;
}

export interface OfficialImportTeamInput {
  id?: string;
  name: string;
  hierarchy: 'SOC_NOC' | 'PLANTAO_COSI' | 'SERVICE_DESK_N1';
}

export interface OfficialImportOnCallGroupInput {
  id: string;
  teamId: string;
  name: string;
}

const TEAM_PREFIX_BY_HIERARCHY: Record<OfficialImportTeamInput['hierarchy'], string> = {
  SOC_NOC: 'soc-',
  PLANTAO_COSI: 'cosi-plantao-',
  SERVICE_DESK_N1: 'service-desk-n1-',
};

type AssignmentShape = Pick<DemoScheduleAssignmentDto, 'assignmentType' | 'shiftName' | 'startTime' | 'endTime'>;
const NO_DATA_SHIFT_NAME = 'Sem dado importado';
const WORK_WITHOUT_SHIFT_PREFIX = 'Trabalho sem turno localizado';

function statusCodeFromText(value: CellValue | undefined): string {
  return fold(value?.text ?? '').split(/\s*-\s*/)[0].trim();
}

function offShiftName(value: CellValue | undefined): string | null {
  const code = statusCodeFromText(value);
  if (code === 'bh') return 'BH';
  if (code === 'an') return 'Aniversário';
  return null;
}

const ASSIGNMENT_BY_SHIFT: Record<ShiftId, (value: CellValue | undefined) => AssignmentShape> = {
  madrugada: () => ({ assignmentType: 'WORK_SHIFT', shiftName: 'Madrugada', startTime: null, endTime: null }),
  manha: () => ({ assignmentType: 'WORK_SHIFT', shiftName: 'Manhã', startTime: '07:00', endTime: '13:00' }),
  tarde: () => ({ assignmentType: 'WORK_SHIFT', shiftName: 'Tarde', startTime: '13:00', endTime: '19:00' }),
  noite: () => ({ assignmentType: 'WORK_SHIFT', shiftName: 'Noite', startTime: null, endTime: null }),
  folga: (value) => ({ assignmentType: 'OFF', shiftName: offShiftName(value), startTime: null, endTime: null }),
  ferias: () => ({ assignmentType: 'VACATION', shiftName: null, startTime: null, endTime: null }),
  plantao: () => ({ assignmentType: 'WORK_SHIFT', shiftName: 'Plantão', startTime: null, endTime: null }),
  comercial: () => ({ assignmentType: 'WORK_SHIFT', shiftName: 'Comercial', startTime: '08:00', endTime: '18:00' }),
  extra: (value) => ({ assignmentType: 'WORK_SHIFT', shiftName: value?.text ?? 'Extra', startTime: null, endTime: null }),
  afastamento: () => ({ assignmentType: 'ABSENCE', shiftName: null, startTime: null, endTime: null }),
  custom: (value) => ({ assignmentType: 'OTHER', shiftName: value?.text ?? null, startTime: null, endTime: null }),
};

function slugify(value: string): string {
  const slug = fold(value)
    .replace(/demo/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'sem-identificador';
}

function teamId(team: OfficialImportTeamInput): string {
  if (team.id?.trim()) return slugify(team.id);
  const prefix = TEAM_PREFIX_BY_HIERARCHY[team.hierarchy];
  const slug = slugify(team.name);
  return slug.startsWith(prefix) ? slug : `${prefix}${slug}`;
}

function acronym(name: string): string {
  const letters = fold(name)
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  return letters.slice(0, 12) || 'ICI';
}

function memberIdFromLogin(login: string): string {
  return slugify(normalizeLogin(login));
}

// XLS de escala real so tem logins nus (sem dominio) - sem isso, corporateLogin/emailNormalized
// nunca batem com o e-mail/username normalizado que o MSAL devolve na resolucao de identidade
// (ver contrato em RemoteFirstDemoMemberDirectoryRepositoryTest, KMP), e "Minha Escala" nunca
// encontra o cadastro corporativo do usuario real. Achado na FASE 14G ao testar ponta-a-ponta
// com login MSAL real pela primeira vez.
const OFFICIAL_CORPORATE_EMAIL_DOMAIN = 'ici.tec.br';

function corporateEmailFromLogin(login: string): string {
  const normalized = normalizeLogin(login);
  return normalized.includes('@') ? normalized : `${normalized}@${OFFICIAL_CORPORATE_EMAIL_DOMAIN}`;
}

function periodName(schedule: ScheduleState): string {
  const dates = scheduleDates(schedule);
  if (!dates.length) return `${String(schedule.monthKey.month).padStart(2, '0')}/${schedule.monthKey.year}`;
  return `${dates[0]} a ${dates[dates.length - 1]}`;
}

function technicianKey(login?: string, name?: string): string {
  return login ? memberIdFromLogin(login) : slugify(name ?? '');
}

function scheduleMemberIdByTechnician(schedule: ScheduleState, membersByKey: Map<string, string>): Map<string, string> {
  const result = new Map<string, string>();
  for (const technician of schedule.technicians) {
    const keys = [
      technician.login ? memberIdFromLogin(technician.login) : '',
      technician.name ? slugify(technician.name) : '',
      technicianKey(technician.login, technician.name),
    ].filter(Boolean);
    const memberId = keys.map((key) => membersByKey.get(key)).find(Boolean);
    if (memberId) result.set(technician.id, memberId);
  }
  return result;
}

function timePart(value: string): string | null {
  const raw = value.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(raw) ? raw : null;
}

function cellToAssignment(value: CellValue | undefined): AssignmentShape {
  if (!value) return { assignmentType: 'OTHER', shiftName: NO_DATA_SHIFT_NAME, startTime: null, endTime: null };
  if (value.shift === 'custom' && fold(value.text ?? '').startsWith(fold(WORK_WITHOUT_SHIFT_PREFIX))) {
    return { assignmentType: 'OTHER', shiftName: value.text ?? WORK_WITHOUT_SHIFT_PREFIX, startTime: null, endTime: null };
  }
  const shift = value?.shift ?? 'folga';
  return ASSIGNMENT_BY_SHIFT[shift](value);
}

function matrixAssignments(
  schedule: ScheduleState,
  periodId: string,
  teamIdValue: string,
  memberIdByTechnician: Map<string, string>,
): DemoScheduleAssignmentDto[] {
  const dates = scheduleDates(schedule);
  const assignments: DemoScheduleAssignmentDto[] = [];

  for (const technician of schedule.technicians) {
    const memberId = memberIdByTechnician.get(technician.id);
    if (!memberId) continue;
    dates.forEach((date, index) => {
      const value = schedule.cells[technician.id]?.[index + 1];
      const shape = cellToAssignment(value);
      assignments.push({
        id: `assignment-${teamIdValue}-${memberId}-${date}`,
        workspaceId: OFFICIAL_WORKSPACE_ID,
        periodId,
        teamId: teamIdValue,
        memberId,
        date,
        ...shape,
        schemaVersion: 1,
      });
    });
  }

  return assignments;
}

function onCallAssignments(
  schedule: ScheduleState,
  periodId: string,
  teamIdValue: string,
  group: OfficialImportOnCallGroupInput,
  membersByKey: Map<string, string>,
): DemoScheduleAssignmentDto[] {
  if (slugify(group.teamId) !== teamIdValue) {
    throw new Error(`Grupo de plantão ${group.name} não pertence à equipe selecionada.`);
  }

  return (schedule.onCallRecords ?? []).flatMap((record) => {
    const memberId = membersByKey.get(slugify(record.technician));
    if (!memberId) return [];
    const startDate = record.start.slice(0, 10);
    return [{
      id: `assignment-${teamIdValue}-${memberId}-${startDate}-${slugify(record.start.slice(11, 16))}`,
      workspaceId: OFFICIAL_WORKSPACE_ID,
      periodId,
      teamId: teamIdValue,
      groupId: group.id,
      memberId,
      date: startDate,
      assignmentType: 'WORK_SHIFT',
      shiftName: 'Plantão',
      startTime: timePart(record.start),
      endTime: timePart(record.end),
      schemaVersion: 1,
    }];
  });
}

export function buildOfficialPackageFromSchedule(
  schedule: ScheduleState,
  team: OfficialImportTeamInput,
  members: OfficialImportMemberInput[],
  onCallGroup?: OfficialImportOnCallGroupInput,
): DemoPublicationPackage {
  const resolvedTeamId = teamId(team);
  const dates = scheduleDates(schedule);
  const startDate = dates[0] ?? `${schedule.monthKey.year}-${String(schedule.monthKey.month).padStart(2, '0')}-01`;
  const endDate = dates[dates.length - 1] ?? startDate;
  const periodId = `period-${resolvedTeamId}-${startDate}-${endDate}`;

  const membersById = new Map<string, OfficialImportMemberInput>();
  for (const member of members) {
    const id = memberIdFromLogin(member.login);
    const previous = membersById.get(id);
    if (!previous) {
      membersById.set(id, { ...member, displayName: member.displayName.trim(), login: normalizeLogin(member.login) });
    } else if (!previous.displayName && member.displayName.trim()) {
      membersById.set(id, { ...previous, displayName: member.displayName.trim() });
    }
  }

  const membersByKey = new Map<string, string>();
  for (const [id, member] of membersById) {
    membersByKey.set(id, id);
    membersByKey.set(slugify(member.displayName), id);
  }

  const memberIdByTechnician = scheduleMemberIdByTechnician(schedule, membersByKey);
  const hasOnCallRecords = Boolean(schedule.onCallRecords?.length);
  if (hasOnCallRecords && !onCallGroup) {
    throw new Error('Selecione a equipe e o grupo de plantão antes de preparar o pacote oficial.');
  }
  const scheduleAssignments = hasOnCallRecords
    ? onCallAssignments(schedule, periodId, resolvedTeamId, onCallGroup!, membersByKey)
    : matrixAssignments(schedule, periodId, resolvedTeamId, memberIdByTechnician);

  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: OFFICIAL_WORKSPACE_ID,
      workspaceType: 'PRODUCTION',
      scenarioId: null,
      seedVersion: null,
      publicationRevision: 0,
      externalEffectsAllowed: false,
      notificationsEnabled: false,
    },
    teams: [{
      id: resolvedTeamId,
      workspaceId: OFFICIAL_WORKSPACE_ID,
      name: team.name.trim(),
      acronym: acronym(team.name),
      active: true,
      schemaVersion: 1,
    }],
    members: [...membersById.entries()].map(([id, member]) => ({
      id,
      workspaceId: OFFICIAL_WORKSPACE_ID,
      displayName: member.displayName.trim() || normalizeLogin(member.login),
      corporateLogin: corporateEmailFromLogin(member.login),
      emailNormalized: corporateEmailFromLogin(member.login),
      active: true,
      schemaVersion: 1,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    memberTeamMemberships: [...membersById.keys()].map((memberId) => ({
      id: `membership-${resolvedTeamId}-${memberId}`,
      workspaceId: OFFICIAL_WORKSPACE_ID,
      memberId,
      teamId: resolvedTeamId,
      startDate,
      endDate: null,
      active: true,
      isPrimary: true,
      schemaVersion: 1,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    teamManagerAssignments: [],
    scheduleChangeRequests: [],
    schedulePeriods: [{
      id: periodId,
      workspaceId: OFFICIAL_WORKSPACE_ID,
      teamId: resolvedTeamId,
      groupId: hasOnCallRecords ? onCallGroup!.id : null,
      name: periodName(schedule),
      startDate,
      endDate,
      active: true,
      publicationRevision: 0,
      schemaVersion: 1,
    }],
    scheduleAssignments: scheduleAssignments.sort((a, b) => a.id.localeCompare(b.id)),
    publicationRecords: [],
  };
}
