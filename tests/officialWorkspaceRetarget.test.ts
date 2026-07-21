import { describe, expect, it } from 'vitest';
import { toOfficialPackage, validateCorporateLinkLocally } from '../src/lib/officialWorkspace/retarget';
import type { DemoPublicationPackage } from '../src/lib/demoWorkspace/dto';
import fixturePackage from '../fixtures/demo/demo-v1-publication-package.json';

const pkg = fixturePackage as DemoPublicationPackage;

describe('toOfficialPackage', () => {
  it('retitula workspace.workspaceId e workspaceType para o workspace oficial', () => {
    const official = toOfficialPackage(pkg);

    expect(official.workspace.workspaceId).toBe('ici-dev');
    expect(official.workspace.workspaceType).toBe('PRODUCTION');
  });

  it('retitula workspaceId em todas as colecoes de entidades', () => {
    const official = toOfficialPackage(pkg);

    expect(official.teams.every((item) => item.workspaceId === 'ici-dev')).toBe(true);
    expect(official.members.every((item) => item.workspaceId === 'ici-dev')).toBe(true);
    expect(official.memberTeamMemberships.every((item) => item.workspaceId === 'ici-dev')).toBe(true);
    expect(official.teamManagerAssignments.every((item) => item.workspaceId === 'ici-dev')).toBe(true);
    expect(official.schedulePeriods.every((item) => item.workspaceId === 'ici-dev')).toBe(true);
    expect(official.scheduleAssignments.every((item) => item.workspaceId === 'ici-dev')).toBe(true);
  });

  it('nao muda a contagem de nenhuma colecao (so retitula, nao remove nem duplica)', () => {
    const official = toOfficialPackage(pkg);

    expect(official.teams).toHaveLength(pkg.teams.length);
    expect(official.members).toHaveLength(pkg.members.length);
    expect(official.scheduleAssignments).toHaveLength(pkg.scheduleAssignments.length);
  });

  it('nao muta o pacote original', () => {
    const original = JSON.parse(JSON.stringify(pkg)) as DemoPublicationPackage;

    toOfficialPackage(pkg);

    expect(pkg).toEqual(original);
  });
});

describe('validateCorporateLinkLocally', () => {
  it('rejeita quando memberId ou teamId estao ausentes', () => {
    expect(validateCorporateLinkLocally(pkg, {})).toMatch(/selecione/i);
    expect(validateCorporateLinkLocally(pkg, { memberId: pkg.members[0].id })).toMatch(/selecione/i);
  });

  it('rejeita membro inexistente no pacote', () => {
    const result = validateCorporateLinkLocally(pkg, { memberId: 'nao-existe', teamId: pkg.teams[0].id });

    expect(result).toMatch(/membro selecionado não existe/i);
  });

  it('rejeita equipe inexistente no pacote', () => {
    const result = validateCorporateLinkLocally(pkg, { memberId: pkg.members[0].id, teamId: 'nao-existe' });

    expect(result).toMatch(/equipe selecionada não existe/i);
  });

  it('rejeita membro sem vinculo ativo com a equipe informada', () => {
    const membership = pkg.memberTeamMemberships[0];
    const otherTeam = pkg.teams.find((team) => team.id !== membership.teamId);
    expect(otherTeam).toBeDefined();

    const result = validateCorporateLinkLocally(pkg, { memberId: membership.memberId, teamId: otherTeam!.id });

    expect(result).toMatch(/não possui vínculo ativo/i);
  });

  it('aceita vinculo valido apontando para um membership ativo real do pacote', () => {
    const membership = pkg.memberTeamMemberships.find((item) => item.active);
    expect(membership).toBeDefined();

    const result = validateCorporateLinkLocally(pkg, {
      memberId: membership!.memberId,
      teamId: membership!.teamId,
    });

    expect(result).toBeNull();
  });
});
