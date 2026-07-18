import type { DemoPublicationPackage } from './dto';

const EXPECTED_SCHEMA_VERSION = 1;
const EXPECTED_WORKSPACE_ID = 'demo-v1';
const REQUIRED_ARRAY_KEYS = [
  'teams',
  'members',
  'memberTeamMemberships',
  'teamManagerAssignments',
  'scheduleChangeRequests',
  'schedulePeriods',
  'scheduleAssignments',
  'publicationRecords',
] as const;

type DemoValidationFailureCode =
  | 'INVALID_JSON'
  | 'UNSUPPORTED_SCHEMA'
  | 'WORKSPACE_MISMATCH'
  | 'CHECKSUM_MISMATCH'
  | 'BROKEN_REFERENCE'
  | 'INVALID_COUNTS';

export type DemoPackageValidationResult =
  | { status: 'VALID'; package: DemoPublicationPackage }
  | { status: DemoValidationFailureCode; message: string };

interface DemoManifestDto {
  workspaceId?: unknown;
  sha256?: unknown;
  counts?: Partial<Record<(typeof REQUIRED_ARRAY_KEYS)[number], unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasSupportedTopLevelShape(value: unknown): value is DemoPublicationPackage {
  if (!isRecord(value) || value.schemaVersion !== EXPECTED_SCHEMA_VERSION || !isRecord(value.workspace)) {
    return false;
  }
  return REQUIRED_ARRAY_KEYS.every((key) => Array.isArray(value[key]));
}

function hasWorkspaceMismatch(pkg: DemoPublicationPackage, manifest: DemoManifestDto): boolean {
  if (pkg.workspace.workspaceId !== EXPECTED_WORKSPACE_ID || manifest.workspaceId !== EXPECTED_WORKSPACE_ID) {
    return true;
  }

  return REQUIRED_ARRAY_KEYS.some((key) => pkg[key].some((item) => (
    isRecord(item) && 'workspaceId' in item && item.workspaceId !== EXPECTED_WORKSPACE_ID
  )));
}

async function sha256Hex(raw: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle ?? (await import('node:crypto')).webcrypto.subtle;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function ids(items: Array<{ id: string }>): Set<string> {
  return new Set(items.map((item) => item.id));
}

function hasBrokenReference(pkg: DemoPublicationPackage): boolean {
  const teamIds = ids(pkg.teams);
  const memberIds = ids(pkg.members);
  const periodIds = ids(pkg.schedulePeriods);
  const assignmentIds = ids(pkg.scheduleAssignments);

  if (pkg.memberTeamMemberships.some((item) => !memberIds.has(item.memberId) || !teamIds.has(item.teamId))) {
    return true;
  }
  if (pkg.teamManagerAssignments.some((item) => !memberIds.has(item.managerMemberId) || !teamIds.has(item.teamId))) {
    return true;
  }
  if (pkg.schedulePeriods.some((item) => !teamIds.has(item.teamId))) {
    return true;
  }
  if (pkg.scheduleAssignments.some((item) => (
    !periodIds.has(item.periodId) || !teamIds.has(item.teamId) || !memberIds.has(item.memberId)
  ))) {
    return true;
  }
  return pkg.scheduleChangeRequests.some((item) => (
    !memberIds.has(item.requesterMemberId)
    || !memberIds.has(item.assignedManagerMemberId)
    || !teamIds.has(item.requesterTeamId)
    || !periodIds.has(item.schedulePeriodId)
    || (item.assignmentId != null && !assignmentIds.has(item.assignmentId))
  ));
}

function hasInvalidCounts(pkg: DemoPublicationPackage, manifest: DemoManifestDto): boolean {
  if (!isRecord(manifest.counts)) return true;
  return REQUIRED_ARRAY_KEYS.some((key) => manifest.counts?.[key] !== pkg[key].length);
}

export async function validateDemoPublicationPackage(
  packageRaw: string,
  manifestRaw: string,
): Promise<DemoPackageValidationResult> {
  try {
    let parsedPackage: unknown;
    let parsedManifest: unknown;

    try {
      parsedPackage = JSON.parse(packageRaw);
      parsedManifest = JSON.parse(manifestRaw);
    } catch {
      return { status: 'INVALID_JSON', message: 'Não foi possível ler o pacote de demonstração.' };
    }

    if (!hasSupportedTopLevelShape(parsedPackage)) {
      return {
        status: 'UNSUPPORTED_SCHEMA',
        message: 'Este pacote de demonstração usa uma versão de schema não suportada por este Dashboard.',
      };
    }

    const manifest = isRecord(parsedManifest) ? parsedManifest as DemoManifestDto : {};
    if (hasWorkspaceMismatch(parsedPackage, manifest)) {
      return {
        status: 'WORKSPACE_MISMATCH',
        message: 'O pacote contém dados de um workspace diferente do esperado (demo-v1).',
      };
    }

    if (manifest.sha256 !== await sha256Hex(packageRaw)) {
      return {
        status: 'CHECKSUM_MISMATCH',
        message: 'O pacote de demonstração não confere com o checksum esperado. Rode npm run demo:sync novamente.',
      };
    }

    if (hasBrokenReference(parsedPackage)) {
      return {
        status: 'BROKEN_REFERENCE',
        message: 'O pacote de demonstração tem uma referência interna quebrada e não pode ser carregado.',
      };
    }

    if (hasInvalidCounts(parsedPackage, manifest)) {
      return {
        status: 'INVALID_COUNTS',
        message: 'O pacote de demonstração está com contagens inconsistentes em relação ao manifesto.',
      };
    }

    return { status: 'VALID', package: parsedPackage };
  } catch {
    return { status: 'UNSUPPORTED_SCHEMA', message: 'Este pacote de demonstração usa uma versão de schema não suportada por este Dashboard.' };
  }
}
