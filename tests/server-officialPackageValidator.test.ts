import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateOfficialCorporateLink, validateOfficialPackage } from '../server/domain/officialPackageValidator.mjs';

const ARRAY_KEYS = [
  'teams',
  'members',
  'memberTeamMemberships',
  'teamManagerAssignments',
  'scheduleChangeRequests',
  'schedulePeriods',
  'scheduleAssignments',
  'publicationRecords',
] as const;

type ArrayKey = (typeof ARRAY_KEYS)[number];
type OfficialPackage = Record<ArrayKey, Array<Record<string, unknown>>> & {
  schemaVersion: number;
  workspace: Record<string, unknown>;
};

function basePackage(): OfficialPackage {
  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: 'ici-dev',
      workspaceType: 'PRODUCTION',
      scenarioId: null,
      seedVersion: null,
      publicationRevision: 1,
      externalEffectsAllowed: false,
      notificationsEnabled: false,
    },
    teams: [{ id: 'team-ici', workspaceId: 'ici-dev', schemaVersion: 1 }],
    members: [
      { id: 'member-ici-analista', workspaceId: 'ici-dev', active: true, schemaVersion: 1 },
      { id: 'member-ici-lvergani', workspaceId: 'ici-dev', active: true, schemaVersion: 1 },
    ],
    memberTeamMemberships: [{
      id: 'membership-ici',
      workspaceId: 'ici-dev',
      memberId: 'member-ici-analista',
      teamId: 'team-ici',
      active: true,
      schemaVersion: 1,
    }],
    teamManagerAssignments: [{
      id: 'manager-assignment-ici',
      workspaceId: 'ici-dev',
      managerMemberId: 'member-ici-lvergani',
      teamId: 'team-ici',
      schemaVersion: 1,
    }],
    scheduleChangeRequests: [],
    schedulePeriods: [{
      id: 'period-ici',
      workspaceId: 'ici-dev',
      teamId: 'team-ici',
      schemaVersion: 1,
    }],
    scheduleAssignments: [{
      id: 'assignment-ici',
      workspaceId: 'ici-dev',
      periodId: 'period-ici',
      teamId: 'team-ici',
      memberId: 'member-ici-analista',
      schemaVersion: 1,
    }],
    publicationRecords: [],
  };
}

function manifestFor(packageRaw: string, overrides: Record<string, unknown> = {}) {
  const pkg = JSON.parse(packageRaw) as OfficialPackage;
  return JSON.stringify({
    workspaceId: 'ici-dev',
    sha256: createHash('sha256').update(packageRaw, 'utf8').digest('hex'),
    counts: Object.fromEntries(ARRAY_KEYS.map((key) => [key, pkg[key].length])),
    schemaVersion: 1,
    ...overrides,
  });
}

function validate(pkg: OfficialPackage, manifestOverrides: Record<string, unknown> = {}) {
  const packageRaw = JSON.stringify(pkg);
  return validateOfficialPackage({ packageRaw, manifestRaw: manifestFor(packageRaw, manifestOverrides) });
}

describe('validateOfficialPackage', () => {
  it('rejeita JSON invalido', () => {
    const result = validateOfficialPackage({ packageRaw: '{', manifestRaw: '{}' });

    expect(result).toMatchObject({ ok: false, code: 'INVALID_PACKAGE' });
  });

  it('rejeita schema sem suporte ou chaves obrigatorias ausentes', () => {
    const pkg = basePackage();
    delete (pkg as Partial<OfficialPackage>).teams;

    const result = validateOfficialPackage({ packageRaw: JSON.stringify(pkg), manifestRaw: '{}' });

    expect(result).toMatchObject({ ok: false, code: 'SCHEMA_UNSUPPORTED' });
  });

  it('rejeita workspace diferente de ici-dev', () => {
    const pkg = basePackage();
    pkg.members[0].workspaceId = 'demo-v1';

    expect(validate(pkg)).toMatchObject({ ok: false, code: 'WORKSPACE_NOT_ALLOWED' });
  });

  it('rejeita workspace.workspaceId diferente de ici-dev mesmo com itens consistentes entre si', () => {
    const pkg = basePackage();
    pkg.workspace.workspaceId = 'demo-v1';
    pkg.teams[0].workspaceId = 'demo-v1';
    pkg.members.forEach((member) => { member.workspaceId = 'demo-v1'; });
    pkg.memberTeamMemberships[0].workspaceId = 'demo-v1';
    pkg.teamManagerAssignments[0].workspaceId = 'demo-v1';
    pkg.schedulePeriods[0].workspaceId = 'demo-v1';
    pkg.scheduleAssignments[0].workspaceId = 'demo-v1';

    expect(validate(pkg)).toMatchObject({ ok: false, code: 'WORKSPACE_NOT_ALLOWED' });
  });

  it('rejeita checksum divergente', () => {
    const pkg = basePackage();
    const packageRaw = JSON.stringify(pkg);

    const result = validateOfficialPackage({
      packageRaw,
      manifestRaw: manifestFor(packageRaw, { sha256: '0'.repeat(64) }),
    });

    expect(result).toMatchObject({ ok: false, code: 'CHECKSUM_MISMATCH' });
  });

  it('rejeita referencia quebrada', () => {
    const pkg = basePackage();
    pkg.scheduleAssignments[0].memberId = 'member-inexistente';

    expect(validate(pkg)).toMatchObject({ ok: false, code: 'BROKEN_REFERENCE' });
  });

  it('rejeita contagem divergente no manifesto', () => {
    const pkg = basePackage();
    const counts = Object.fromEntries(ARRAY_KEYS.map((key) => [key, pkg[key].length]));
    counts.teams = 99;

    expect(validate(pkg, { counts })).toMatchObject({ ok: false, code: 'INVALID_PACKAGE' });
  });

  it('rejeita efeitos externos ou notificacoes habilitados', () => {
    const pkg = basePackage();
    pkg.workspace.externalEffectsAllowed = true;

    expect(validate(pkg)).toMatchObject({ ok: false, code: 'WORKSPACE_NOT_ALLOWED' });
  });

  it('aceita pacote valido', () => {
    const pkg = basePackage();
    const result = validate(pkg);

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.package).toEqual(pkg);
    }
  });
});

describe('validateOfficialCorporateLink', () => {
  it('rejeita vinculo ausente', () => {
    expect(validateOfficialCorporateLink(basePackage(), undefined)).toMatchObject({
      ok: false,
      code: 'CORPORATE_LINK_INVALID',
    });
  });

  it('rejeita memberId ausente ou vazio', () => {
    expect(validateOfficialCorporateLink(basePackage(), { memberId: '', teamId: 'team-ici' })).toMatchObject({
      ok: false,
      code: 'CORPORATE_LINK_INVALID',
    });
  });

  it('rejeita teamId ausente ou vazio', () => {
    expect(validateOfficialCorporateLink(basePackage(), { memberId: 'member-ici-lvergani', teamId: '' })).toMatchObject({
      ok: false,
      code: 'CORPORATE_LINK_INVALID',
    });
  });

  it('rejeita membro inexistente no pacote', () => {
    const result = validateOfficialCorporateLink(basePackage(), {
      memberId: 'member-que-nao-existe',
      teamId: 'team-ici',
    });

    expect(result).toMatchObject({ ok: false, code: 'CORPORATE_LINK_MEMBER_NOT_FOUND' });
  });

  it('rejeita membro inativo no pacote', () => {
    const pkg = basePackage();
    pkg.members[1].active = false;

    const result = validateOfficialCorporateLink(pkg, {
      memberId: 'member-ici-lvergani',
      teamId: 'team-ici',
    });

    expect(result).toMatchObject({ ok: false, code: 'CORPORATE_LINK_MEMBER_NOT_FOUND' });
  });

  it('rejeita equipe inexistente no pacote', () => {
    const result = validateOfficialCorporateLink(basePackage(), {
      memberId: 'member-ici-analista',
      teamId: 'team-que-nao-existe',
    });

    expect(result).toMatchObject({ ok: false, code: 'CORPORATE_LINK_TEAM_NOT_FOUND' });
  });

  it('rejeita membro sem vinculo ativo de equipe', () => {
    // member-ici-lvergani existe no pacote mas so tem teamManagerAssignment, nao membership.
    const result = validateOfficialCorporateLink(basePackage(), {
      memberId: 'member-ici-lvergani',
      teamId: 'team-ici',
    });

    expect(result).toMatchObject({ ok: false, code: 'CORPORATE_LINK_MEMBERSHIP_NOT_FOUND' });
  });

  it('aceita vinculo valido apontando para membro e equipe existentes com membership ativo', () => {
    const result = validateOfficialCorporateLink(basePackage(), {
      memberId: 'member-ici-analista',
      teamId: 'team-ici',
    });

    expect(result).toEqual({ ok: true });
  });
});
