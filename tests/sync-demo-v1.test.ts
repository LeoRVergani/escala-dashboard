import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeSha256, validateSyncPayload } from '../scripts/sync-demo-v1.mjs';

type ValidationResult = ReturnType<typeof validateSyncPayload>;

const emptyArrays = {
  teams: [{ id: 'team-demo', workspaceId: 'demo-v1' }],
  members: [{ id: 'member-demo', workspaceId: 'demo-v1' }],
  memberTeamMemberships: [{ id: 'membership-demo', workspaceId: 'demo-v1' }],
  teamManagerAssignments: [{ id: 'manager-demo', workspaceId: 'demo-v1' }],
  schedulePeriods: [{ id: 'period-demo', workspaceId: 'demo-v1' }],
  scheduleAssignments: [{ id: 'assignment-demo', workspaceId: 'demo-v1' }],
  scheduleChangeRequests: [{ id: 'request-demo', workspaceId: 'demo-v1' }],
  publicationRecords: [{ id: 'publication-demo', workspaceId: 'demo-v1' }],
};

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

function makePackage(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: 'demo-v1',
      publicationRevision: 1,
    },
    ...emptyArrays,
    ...overrides,
  };
}

function countsFor(publicationPackage: ReturnType<typeof makePackage>) {
  return {
    teams: publicationPackage.teams.length,
    members: publicationPackage.members.length,
    memberTeamMemberships: publicationPackage.memberTeamMemberships.length,
    teamManagerAssignments: publicationPackage.teamManagerAssignments.length,
    schedulePeriods: publicationPackage.schedulePeriods.length,
    scheduleAssignments: publicationPackage.scheduleAssignments.length,
    scheduleChangeRequests: publicationPackage.scheduleChangeRequests.length,
    publicationRecords: publicationPackage.publicationRecords.length,
  };
}

function makePayload(options: {
  packageOverrides?: Record<string, unknown>;
  manifestOverrides?: Record<string, unknown>;
  packageRaw?: string;
  manifestRaw?: string;
  schemaRaw?: string;
  sourceRoot?: string;
  destRoot?: string;
} = {}) {
  const publicationPackage = makePackage(options.packageOverrides);
  const packageRaw = options.packageRaw ?? stringify(publicationPackage);
  const manifest = {
    workspaceId: 'demo-v1',
    publicationRevision: 1,
    sha256: computeSha256(packageRaw),
    counts: countsFor(publicationPackage),
    ...options.manifestOverrides,
  };

  return {
    packageJson: packageRaw,
    packageBytes: packageRaw,
    manifestJson: options.manifestRaw ?? stringify(manifest),
    schemaJson: options.schemaRaw ?? stringify({ type: 'object' }),
    sourceRoot: options.sourceRoot ?? '/tmp/source-kmp',
    destRoot: options.destRoot ?? '/tmp/dashboard',
  };
}

function expectFailure(result: ValidationResult, messagePart: string) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.reason).toContain(messagePart);
  }
}

describe('sync-demo-v1 validation', () => {
  it('aceita payload valido', () => {
    expect(validateSyncPayload(makePayload())).toMatchObject({ ok: true });
  });

  it('falha com workspaceId errado no pacote', () => {
    const result = validateSyncPayload(makePayload({
      packageOverrides: {
        workspace: { workspaceId: 'ici', publicationRevision: 1 },
      },
    }));

    expectFailure(result, 'Pacote com workspaceId invalido');
  });

  it('falha com workspaceId errado no manifesto', () => {
    const result = validateSyncPayload(makePayload({
      manifestOverrides: { workspaceId: 'ici' },
    }));

    expectFailure(result, 'Manifesto com workspaceId invalido');
  });

  it('falha quando checksum nao confere', () => {
    const result = validateSyncPayload(makePayload({
      manifestOverrides: { sha256: 'sha-invalido' },
    }));

    expectFailure(result, 'Checksum do pacote nao confere');
  });

  it('falha quando contagem diverge', () => {
    const result = validateSyncPayload(makePayload({
      manifestOverrides: {
        counts: {
          teams: 2,
          members: 1,
          memberTeamMemberships: 1,
          teamManagerAssignments: 1,
          schedulePeriods: 1,
          scheduleAssignments: 1,
          scheduleChangeRequests: 1,
          publicationRecords: 1,
        },
      },
    }));

    expectFailure(result, 'Contagem divergente em teams');
  });

  it('falha quando item de array mistura outro workspaceId', () => {
    const result = validateSyncPayload(makePayload({
      packageOverrides: {
        teams: [{ id: 'team-demo', workspaceId: 'outro-workspace' }],
      },
    }));

    expectFailure(result, 'Item com workspaceId invalido em teams[0]');
  });

  it('falha quando destino e origem sao iguais', () => {
    const root = '/tmp/mesmo-root';
    const result = validateSyncPayload(makePayload({
      sourceRoot: root,
      destRoot: root,
    }));

    expectFailure(result, 'Destino nao pode ser igual a origem');
  });

  it('falha com JSON invalido no pacote', () => {
    const result = validateSyncPayload(makePayload({ packageRaw: '{"workspace":' }));

    expectFailure(result, 'Pacote JSON invalido');
  });

  it('falha com JSON invalido no manifesto', () => {
    const result = validateSyncPayload(makePayload({ manifestRaw: '{"workspaceId":' }));

    expectFailure(result, 'Manifesto JSON invalido');
  });

  it('falha com JSON invalido no schema', () => {
    const result = validateSyncPayload(makePayload({ schemaRaw: '{"type":' }));

    expectFailure(result, 'Schema JSON invalido');
  });

  it('valida os arquivos reais espelhados', () => {
    const root = resolve(__dirname, '..');
    const packageBytes = readFileSync(resolve(root, 'fixtures/demo/demo-v1-publication-package.json'));
    const manifestBytes = readFileSync(resolve(root, 'fixtures/demo/demo-v1-manifest.json'));
    const schemaBytes = readFileSync(resolve(root, 'contracts/organization-approval-v1.schema.json'));
    const manifest = JSON.parse(manifestBytes.toString('utf8'));

    expect(computeSha256(packageBytes)).toBe(manifest.sha256);
    expect(validateSyncPayload({
      packageJson: packageBytes,
      packageBytes,
      manifestJson: manifestBytes,
      schemaJson: schemaBytes,
      sourceRoot: '/tmp/source-kmp',
      destRoot: root,
    })).toMatchObject({ ok: true });
  });
});
