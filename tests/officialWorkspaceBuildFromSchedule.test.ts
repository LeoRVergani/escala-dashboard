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

function membersFromSchedule(schedule: ScheduleState): OfficialImportMemberInput[] {
  return schedule.technicians.map((technician) => ({
    displayName: technician.name ?? technician.login ?? technician.id,
    login: technician.login ?? technician.name ?? technician.id,
  }));
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
    const pkg = buildOfficialPackageFromSchedule(
      schedule,
      { name: 'SOC/NOC', hierarchy: 'SOC_NOC' },
      membersFromSchedule(schedule),
    );

    expect(eligibleOfficialMembers(pkg).length).toBeGreaterThan(0);
    expect(eligibleOfficialTeams(pkg).length).toBeGreaterThan(0);
    expect(pkg.scheduleAssignments.length).toBeGreaterThan(0);
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
});
