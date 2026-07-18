import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateDemoPackage } from '../server/domain/demoPackageValidator.mjs';

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
type DemoPackage = Record<ArrayKey, Array<Record<string, unknown>>> & {
  schemaVersion: number;
  workspace: Record<string, unknown>;
};

function basePackage(): DemoPackage {
  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: 'demo-v1',
      workspaceType: 'DEMO',
      scenarioId: 'unit-test',
      seedVersion: 1,
      publicationRevision: 1,
      externalEffectsAllowed: false,
      notificationsEnabled: false,
    },
    teams: [{ id: 'team-demo', workspaceId: 'demo-v1', schemaVersion: 1 }],
    members: [
      { id: 'member-demo', workspaceId: 'demo-v1', schemaVersion: 1 },
      { id: 'manager-demo', workspaceId: 'demo-v1', schemaVersion: 1 },
    ],
    memberTeamMemberships: [{
      id: 'membership-demo',
      workspaceId: 'demo-v1',
      memberId: 'member-demo',
      teamId: 'team-demo',
      schemaVersion: 1,
    }],
    teamManagerAssignments: [{
      id: 'manager-assignment-demo',
      workspaceId: 'demo-v1',
      managerMemberId: 'manager-demo',
      teamId: 'team-demo',
      schemaVersion: 1,
    }],
    scheduleChangeRequests: [{
      id: 'request-demo',
      workspaceId: 'demo-v1',
      requesterMemberId: 'member-demo',
      requesterTeamId: 'team-demo',
      assignedManagerMemberId: 'manager-demo',
      schedulePeriodId: 'period-demo',
      assignmentId: 'assignment-demo',
      schemaVersion: 1,
    }],
    schedulePeriods: [{
      id: 'period-demo',
      workspaceId: 'demo-v1',
      teamId: 'team-demo',
      schemaVersion: 1,
    }],
    scheduleAssignments: [{
      id: 'assignment-demo',
      workspaceId: 'demo-v1',
      periodId: 'period-demo',
      teamId: 'team-demo',
      memberId: 'member-demo',
      schemaVersion: 1,
    }],
    publicationRecords: [{
      id: 'publication-demo',
      workspaceId: 'demo-v1',
      publicationRevision: 1,
      schemaVersion: 1,
    }],
  };
}

function manifestFor(packageRaw: string, overrides: Record<string, unknown> = {}) {
  const pkg = JSON.parse(packageRaw) as DemoPackage;
  return JSON.stringify({
    workspaceId: 'demo-v1',
    sha256: createHash('sha256').update(packageRaw, 'utf8').digest('hex'),
    counts: Object.fromEntries(ARRAY_KEYS.map((key) => [key, pkg[key].length])),
    schemaVersion: 1,
    ...overrides,
  });
}

function validate(pkg: DemoPackage, manifestOverrides: Record<string, unknown> = {}) {
  const packageRaw = JSON.stringify(pkg);
  return validateDemoPackage({ packageRaw, manifestRaw: manifestFor(packageRaw, manifestOverrides) });
}

describe('validateDemoPackage', () => {
  it('rejeita JSON invalido', () => {
    const result = validateDemoPackage({ packageRaw: '{', manifestRaw: '{}' });

    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_PACKAGE',
      message: 'O pacote enviado não é um JSON válido.',
    });
  });

  it('rejeita schema sem suporte ou chaves obrigatorias ausentes', () => {
    const pkg = basePackage();
    delete (pkg as Partial<DemoPackage>).teams;

    const result = validateDemoPackage({
      packageRaw: JSON.stringify(pkg),
      manifestRaw: '{}',
    });

    expect(result).toMatchObject({ ok: false, code: 'SCHEMA_UNSUPPORTED' });
  });

  it('rejeita workspace diferente de demo-v1', () => {
    const pkg = basePackage();
    pkg.members[0].workspaceId = 'ici';

    expect(validate(pkg)).toMatchObject({ ok: false, code: 'WORKSPACE_NOT_ALLOWED' });
  });

  it('rejeita checksum divergente', () => {
    const pkg = basePackage();
    const packageRaw = JSON.stringify(pkg);

    const result = validateDemoPackage({
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
