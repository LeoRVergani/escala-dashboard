import { describe, expect, it } from 'vitest';
import { buildStructuredPublicationPayload, deterministicMemberId, deterministicPeriodId } from '../src/lib/persistence';
import { publicationCriticalErrors } from '../src/lib/publicationPreview';
import { publicationOperationSummary } from '../src/lib/schedulePublishRepository';
import { filterRequestsForManagedTeams } from '../src/lib/swapRequestsRepository';
import { canManageTeam, filterManagedTeams } from '../src/lib/teamsRepository';
import { normalizeLogin } from '../src/lib/authRepository';
import type { AuthenticatedDashboardUser, ScheduleState, ShiftSwapRequest, Team } from '../src/types';

const user = (login = 'responsavel.login', admin = false): AuthenticatedDashboardUser => ({ uid: `uid-${login}`, login, isSystemAdmin: admin, link: { firebaseUid: `uid-${login}`, login, active: true } });
const team = (id: string, responsibleLogin = 'responsavel.login', scheduleKind: Team['scheduleKind'] = 'REGULAR'): Team => ({ id, code: id.toUpperCase(), name: id, responsibleLogin, scheduleKind, active: true, allowedImportLayouts: scheduleKind === 'ON_CALL' ? ['oncall'] : ['soc-daily', 'soc-escalistas', 'n1', 'matrix'] });
const regularState = (): ScheduleState => ({ monthKey: { year: 2026, month: 7 }, dates: ['2026-06-25', '2026-06-26'], technicians: [{ id: 'login', login: ' Tecnico.Login ' }, { id: 'name', name: 'Pessoa Sem Login' }], cells: { login: { 1: { shift: 'manha' } }, name: { 2: { shift: 'ferias' } } }, visualGrouping: 'operational-shift', sourceLayout: 'soc-daily' });

describe('autorização por responsibleLogin', () => {
  it('normaliza login com trim e minúsculas', () => expect(normalizeLogin('  RESPONSAVEL.Login ')).toBe('responsavel.login'));
  it('o mesmo responsável administra três times', () => expect(filterManagedTeams(user(), [team('soc'), team('seguranca'), team('plantao', 'responsavel.login', 'ON_CALL')]).map((item) => item.id)).toEqual(['soc', 'seguranca', 'plantao']));
  it('usuário vê somente os próprios times', () => expect(filterManagedTeams(user(), [team('soc'), team('n1', 'outro.login')]).map((item) => item.id)).toEqual(['soc']));
  it('system admin vê todos os times ativos', () => expect(filterManagedTeams(user('admin.login', true), [team('soc'), team('n1', 'outro.login')])).toHaveLength(2));
  it('bloqueia time não autorizado', () => expect(canManageTeam(user(), team('n1', 'outro.login'))).toBe(false));
});

describe('payload estruturado e determinístico', () => {
  it('publica SOC em schedule_periods/schedule_assignments compatíveis', () => { const payload = buildStructuredPublicationPayload(regularState(), team('soc'), user()); expect(payload.kind).toBe('REGULAR'); expect(payload.period).toMatchObject({ scheduleType: 'SOC', sourceType: 'FIREBASE_DASHBOARD', publishedBy: 'responsavel.login' }); expect(payload.assignments).toHaveLength(2); expect(payload.assignments[0]).toMatchObject({ teamId: 'soc', assignmentType: 'WORK_SHIFT', schemaVersion: 2 }); });
  it('limita assignmentType aos valores aceitos pelo leitor KMP atual', () => { const state = regularState(); state.cells.login![2] = { shift: 'afastamento' }; const payload = buildStructuredPublicationPayload(state, team('soc'), user()); expect(new Set(payload.assignments.map((item) => item.assignmentType))).toEqual(new Set(['WORK_SHIFT', 'OFF', 'VACATION'])); expect(payload.assignments.find((item) => item.statusCode === 'AF')?.assignmentType).toBe('OFF'); });
  it('publica N1 como escala regular', () => { const state = regularState(); state.serviceDeskN1 = { principalRows: [], emailGuaranteeRows: [], principalLegend: [], emailGuaranteeLegend: [] }; expect(buildStructuredPublicationPayload(state, team('n1'), user()).period.scheduleType).toBe('SERVICE_DESK_N1'); });
  it('publica Plantão COSI sem perder início e fim', () => { const state = regularState(); state.viewType = 'oncall'; state.onCallRecords = [{ id: 'p1', technician: 'login', start: '2026-06-25T19:00', end: '2026-06-26T07:00', durationMinutes: 720 }]; state.cells = {}; const payload = buildStructuredPublicationPayload(state, team('plantao-cosi', 'responsavel.login', 'ON_CALL'), user()); expect(payload.onCallAssignments[0]).toMatchObject({ startDateTime: '2026-06-25T19:00', endDateTime: '2026-06-26T07:00', durationMinutes: 720 }); });
  it('aceita membro sem login e membro sem nome sem duplicar', () => { const payload = buildStructuredPublicationPayload(regularState(), team('soc'), user()); expect(payload.members).toHaveLength(2); expect(payload.members.find((item) => item.login === 'tecnico.login')?.fullName).toBeUndefined(); expect(payload.members.find((item) => item.fullName === 'Pessoa Sem Login')?.login).toBeUndefined(); });
  it('não duplica técnico nem assignment com a mesma identidade', () => { const state = regularState(); state.technicians.push({ id: 'duplicado', login: 'tecnico.login', name: 'Outro rótulo' }); state.cells.duplicado = { 1: { shift: 'manha' } }; const payload = buildStructuredPublicationPayload(state, team('soc'), user()); expect(payload.members.filter((item) => item.login === 'tecnico.login')).toHaveLength(1); expect(payload.assignments.filter((item) => item.date === '2026-06-25' && item.shiftCode === 'M')).toHaveLength(1); });
  it('gera IDs determinísticos', () => { const member = { id: 'x', login: 'Pessoa.Login' }; expect(deterministicMemberId('soc', member)).toBe(deterministicMemberId('soc', { ...member, login: ' pessoa.login ' })); expect(deterministicPeriodId('soc', '2026-06-25', '2026-07-26', 'REGULAR')).toBe('soc-schedule-2026-06-25-2026-07-26'); });
  it('bloqueia DEMO e não publica automaticamente', () => { const state = regularState(); state.isDemo = true; const payload = buildStructuredPublicationPayload(state, team('soc'), user()); expect(publicationCriticalErrors(state, team('soc'), user(), payload)).toContain('Escalas de demonstração não podem ser publicadas.'); });
  it('planeja período novo, atualização preservando dados e substituição controlada', () => { const payload = buildStructuredPublicationPayload(regularState(), team('soc'), user()); const base = { payload, alerts: 0, criticalErrors: [], existingAssignments: 9, existingPeriod: true }; expect(publicationOperationSummary(base, 'update')).toMatchObject({ createsPeriod: false, removes: 0, preservesUnrelated: true }); expect(publicationOperationSummary(base, 'replace')).toMatchObject({ removes: 9, preservesUnrelated: false }); expect(publicationOperationSummary({ ...base, existingPeriod: false }, 'update').createsPeriod).toBe(true); });
});

describe('trocas direcionadas pelo time', () => {
  const request = (id: string, teamId: string): ShiftSwapRequest => ({ id, teamId, periodId: 'periodo', requesterMemberId: 'm1', requesterLogin: 'pessoa.login', requesterAssignmentId: 'a1', reason: 'Consulta', status: 'PENDING', createdAt: '2026-07-16' });
  it('chega ao responsável atual do time e não ao responsável de outro time', () => { const requests = [request('s1', 'soc'), request('n1', 'n1')]; expect(filterRequestsForManagedTeams(user(), [team('soc'), team('n1', 'outro.login')], requests).map((item) => item.id)).toEqual(['s1']); expect(filterRequestsForManagedTeams(user('outro.login'), [team('soc'), team('n1', 'outro.login')], requests).map((item) => item.id)).toEqual(['n1']); });
});
