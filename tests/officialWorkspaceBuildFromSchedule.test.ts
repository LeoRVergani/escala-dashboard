import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import fixturePackage from '../fixtures/demo/demo-v1-publication-package.json';
import type { DemoPublicationPackage } from '../src/lib/demoWorkspace/dto';
import { buildOfficialPackageFromSchedule, type OfficialImportMemberInput } from '../src/lib/officialWorkspace/buildFromSchedule';
import {
  eligibleOfficialMembers,
  eligibleOfficialTeams,
  isEligibleOfficialMember,
  isEligibleOfficialTeam,
  toOfficialPackage,
} from '../src/lib/officialWorkspace/retarget';
import { analyzeWorkbook, buildSchedule, readWorkbook } from '../src/lib/parser';
import { createEmptyScheduleFromCatalog } from '../src/lib/scheduleFactories';
import type { ScheduleState } from '../src/types';

function importedSocSchedule(): ScheduleState {
  const bytes = readFileSync(resolve('tests/fixtures/soc-controle-julho-ficticio.xlsx'));
  const wb = readWorkbook(new Uint8Array(bytes));
  const analysis = analyzeWorkbook(wb, 'soc-controle-julho-ficticio.xlsx');
  const option = analysis.options.find((candidate) => candidate.layout === 'soc-daily')!;
  return buildSchedule(wb, analysis, option.key).state;
}

function importedSocCombinedSchedule(): ScheduleState {
  const bytes = readFileSync(resolve('tests/fixtures/soc-combinado-regressao-ficticio.xlsx'));
  const wb = readWorkbook(new Uint8Array(bytes));
  const analysis = analyzeWorkbook(wb, 'soc-combinado-regressao-ficticio.xlsx');
  const option = analysis.options.find((candidate) => candidate.layout === 'soc-combined')!;
  return buildSchedule(wb, analysis, option.key).state;
}

function membersFromSchedule(schedule: ScheduleState): OfficialImportMemberInput[] {
  return schedule.technicians.map((technician) => ({
    displayName: technician.name ?? technician.login ?? technician.id,
    login: technician.login ?? technician.name ?? technician.id,
  }));
}

function packageFromSchedule(schedule: ScheduleState): DemoPublicationPackage {
  return buildOfficialPackageFromSchedule(
    schedule,
    { name: 'SOC/NOC', hierarchy: 'SOC_NOC' },
    membersFromSchedule(schedule),
  );
}

function assignment(pkg: DemoPublicationPackage, memberId: string, date: string) {
  const found = pkg.scheduleAssignments.find((item) => item.memberId === memberId && item.date === date);
  if (!found) throw new Error(`Assignment não encontrado: ${memberId} ${date}`);
  return found;
}

function allGeneratedIds(pkg: DemoPublicationPackage): string[] {
  return [
    pkg.workspace.workspaceId,
    ...pkg.teams.map((item) => item.id),
    ...pkg.members.map((item) => item.id),
    ...pkg.memberTeamMemberships.map((item) => item.id),
    ...pkg.teamManagerAssignments.map((item) => item.id),
    ...pkg.scheduleChangeRequests.map((item) => item.id),
    ...pkg.schedulePeriods.map((item) => item.id),
    ...pkg.scheduleAssignments.map((item) => item.id),
    ...pkg.publicationRecords.map((item) => item.id),
  ];
}

describe('buildOfficialPackageFromSchedule', () => {
  it('transforma importação de escala válida em pacote com membros e times elegíveis', () => {
    const schedule = importedSocSchedule();
    const pkg = packageFromSchedule(schedule);

    expect(eligibleOfficialMembers(pkg).length).toBeGreaterThan(0);
    expect(eligibleOfficialTeams(pkg).length).toBeGreaterThan(0);
    expect(pkg.scheduleAssignments.length).toBeGreaterThan(0);
  });

  it('deriva corporateLogin/emailNormalized como e-mail corporativo real a partir do login nu do XLS', () => {
    const schedule = createEmptyScheduleFromCatalog('soc-noc-6x1', '2026-07-01');
    const pkg = buildOfficialPackageFromSchedule(
      schedule,
      { name: 'SOC/NOC', hierarchy: 'SOC_NOC' },
      [{ displayName: 'lvergani', login: 'lvergani' }],
    );

    expect(pkg.members).toHaveLength(1);
    expect(pkg.members[0].corporateLogin).toBe('lvergani@ici.tec.br');
    expect(pkg.members[0].emailNormalized).toBe('lvergani@ici.tec.br');
  });

  it('preserva o login como e-mail quando o XLS já traz um endereço completo', () => {
    const schedule = createEmptyScheduleFromCatalog('soc-noc-6x1', '2026-07-01');
    const pkg = buildOfficialPackageFromSchedule(
      schedule,
      { name: 'SOC/NOC', hierarchy: 'SOC_NOC' },
      [{ displayName: 'Fulano', login: 'fulano@outraempresa.com' }],
    );

    expect(pkg.members[0].corporateLogin).toBe('fulano@outraempresa.com');
    expect(pkg.members[0].emailNormalized).toBe('fulano@outraempresa.com');
  });

  it('aceita criação vazia com time elegível e sem membros', () => {
    const schedule = createEmptyScheduleFromCatalog('soc-noc-6x1', '2026-07-01');
    const pkg = buildOfficialPackageFromSchedule(
      schedule,
      { name: 'SOC/NOC', hierarchy: 'SOC_NOC' },
      [],
    );

    expect(eligibleOfficialMembers(pkg)).toHaveLength(0);
    expect(eligibleOfficialTeams(pkg)).toHaveLength(1);
    expect(pkg.memberTeamMemberships).toHaveLength(0);
  });

  it('gera o mesmo memberId para logins equivalentes por caixa, espaço e acento', () => {
    const schedule = createEmptyScheduleFromCatalog('soc-noc-6x1', '2026-07-01');
    const pkg = buildOfficialPackageFromSchedule(
      schedule,
      { name: 'SOC/NOC', hierarchy: 'SOC_NOC' },
      [
        { displayName: 'Ana Paula', login: 'Ana Paula' },
        { displayName: 'Ana Paula', login: ' ana paula ' },
        { displayName: 'Ana Paula', login: 'Ána  Páula' },
      ],
    );

    expect(pkg.members.map((member) => member.id)).toEqual(['ana-paula']);
  });

  it('gera ids determinísticos para a mesma entrada normalizada', () => {
    const schedule = importedSocSchedule();
    const team = { name: 'SOC/NOC', hierarchy: 'SOC_NOC' } as const;
    const members = membersFromSchedule(schedule);

    const first = buildOfficialPackageFromSchedule(schedule, team, members);
    const second = buildOfficialPackageFromSchedule(schedule, team, members);

    expect(first.teams.map((teamItem) => teamItem.id)).toEqual(second.teams.map((teamItem) => teamItem.id));
    expect(first.members.map((member) => member.id)).toEqual(second.members.map((member) => member.id));
    expect(first.schedulePeriods.map((period) => period.id)).toEqual(second.schedulePeriods.map((period) => period.id));
  });

  it('não colide teamId para times com nomes diferentes', () => {
    const schedule = createEmptyScheduleFromCatalog('soc-noc-6x1', '2026-07-01');
    const first = buildOfficialPackageFromSchedule(schedule, { name: 'SOC Alfa', hierarchy: 'SOC_NOC' }, []);
    const second = buildOfficialPackageFromSchedule(schedule, { name: 'SOC Beta', hierarchy: 'SOC_NOC' }, []);

    expect(first.teams[0].id).not.toBe(second.teams[0].id);
  });

  it('não gera ids com a substring demo e passa pelas guards reais de elegibilidade', () => {
    const schedule = importedSocSchedule();
    const pkg = buildOfficialPackageFromSchedule(
      schedule,
      { name: 'Service Desk N1 Demo Oficial', hierarchy: 'SERVICE_DESK_N1' },
      [
        ...membersFromSchedule(schedule),
        { displayName: 'Pessoa Demo', login: 'pessoa.demo' },
      ],
    );

    expect(allGeneratedIds(pkg).some((id) => /demo/i.test(id))).toBe(false);
    expect(pkg.teams.every(isEligibleOfficialTeam)).toBe(true);
    expect(pkg.members.every(isEligibleOfficialMember)).toBe(true);
  });

  it('mantém o pacote Demo retitulado bloqueado por elegibilidade', () => {
    const officialDemoPackage = toOfficialPackage(fixturePackage as DemoPublicationPackage);

    expect(eligibleOfficialMembers(officialDemoPackage)).toHaveLength(0);
    expect(eligibleOfficialTeams(officialDemoPackage)).toHaveLength(0);
  });

  it('materializa exatamente uma atribuição por membro/data no SOC combinado', () => {
    const schedule = importedSocCombinedSchedule();
    const pkg = packageFromSchedule(schedule);
    const dates = schedule.dates!;

    expect(dates[0]).toBe('2026-06-26');
    expect(dates[dates.length - 1]).toBe('2026-07-25');
    expect(dates).toHaveLength(30);
    expect(pkg.schedulePeriods[0]).toMatchObject({ startDate: '2026-06-26', endDate: '2026-07-25' });
    expect(pkg.scheduleAssignments).toHaveLength(pkg.members.length * dates.length);

    for (const member of pkg.members) {
      for (const date of dates) {
        expect(pkg.scheduleAssignments.filter((item) => item.memberId === member.id && item.date === date)).toHaveLength(1);
      }
    }
  });

  it.each([
    ['2026-06-26', 'WORK_SHIFT', 'Madrugada'],
    ['2026-06-27', 'WORK_SHIFT', 'Manhã'],
    ['2026-06-28', 'WORK_SHIFT', 'Tarde'],
    ['2026-06-29', 'WORK_SHIFT', 'Noite'],
    ['2026-06-30', 'WORK_SHIFT', 'Madrugada'],
    ['2026-07-01', 'WORK_SHIFT', 'Manhã'],
    ['2026-07-02', 'OFF', null],
    ['2026-07-03', 'OFF', null],
    ['2026-07-04', 'OFF', null],
    ['2026-07-05', 'VACATION', null],
    ['2026-07-06', 'OFF', 'BH'],
    ['2026-07-07', 'OFF', 'Aniversário'],
    ['2026-07-08', 'WORK_SHIFT', 'HE'],
    ['2026-07-09', 'ABSENCE', null],
    ['2026-07-10', 'OTHER', 'Sem dado importado'],
  ] as const)('converte o código da Escalistas em DTO oficial (%s)', (date, assignmentType, shiftName) => {
    const pkg = packageFromSchedule(importedSocCombinedSchedule());

    expect(assignment(pkg, 'codeprobe', date)).toMatchObject({ assignmentType, shiftName });
  });

  it('preserva a regressão 25 trabalhados, 5 folgas, 150 horas e folgas explícitas do usuário fictício', () => {
    const pkg = packageFromSchedule(importedSocCombinedSchedule());
    const ffonseca = pkg.scheduleAssignments.filter((item) => item.memberId === 'ffonseca');
    const worked = ffonseca.filter((item) => item.assignmentType === 'WORK_SHIFT');
    const off = ffonseca.filter((item) => item.assignmentType === 'OFF');
    const totalHours = worked.reduce((sum, item) => {
      if (!item.startTime || !item.endTime) return sum;
      const [startHour] = item.startTime.split(':').map(Number);
      const [endHour] = item.endTime.split(':').map(Number);
      return sum + (endHour - startHour);
    }, 0);

    expect(worked).toHaveLength(25);
    expect(off).toHaveLength(5);
    expect(totalHours).toBe(150);
    expect(assignment(pkg, 'ffonseca', '2026-07-11')).toMatchObject({ assignmentType: 'OFF', shiftName: null });
    expect(assignment(pkg, 'ffonseca', '2026-07-18')).toMatchObject({ assignmentType: 'OFF', shiftName: null });
    expect(assignment(pkg, 'ffonseca', '2026-07-25')).toMatchObject({ assignmentType: 'OFF', shiftName: null });
  });

  it('agrupa 22/07 por turno sem incluir férias ou ausência nos turnos', () => {
    const pkg = packageFromSchedule(importedSocCombinedSchedule());
    const dayAssignments = pkg.scheduleAssignments.filter((item) => item.date === '2026-07-22' && item.assignmentType === 'WORK_SHIFT');
    const counts = dayAssignments.reduce<Record<string, number>>((acc, item) => {
      acc[item.shiftName ?? ''] = (acc[item.shiftName ?? ''] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts).toEqual({ Madrugada: 2, Manhã: 2, Tarde: 2, Noite: 2 });
    expect(dayAssignments.map((item) => item.memberId)).toContain('ffonseca');
    expect(dayAssignments.map((item) => item.memberId)).not.toEqual(expect.arrayContaining(['ferias01', 'afast01']));
  });

  it('buraco de importação vira Sem dado importado e nunca continuação de trabalho', () => {
    const pkg = packageFromSchedule(importedSocCombinedSchedule());

    expect(assignment(pkg, 'buraco', '2026-07-15')).toMatchObject({
      assignmentType: 'OTHER',
      shiftName: 'Sem dado importado',
      startTime: null,
      endTime: null,
    });
  });
});
