import { createHash } from 'node:crypto';

const EXPECTED_SCHEMA_VERSION = 1;
const EXPECTED_WORKSPACE_ID = 'demo-v1';

export const REQUIRED_ARRAY_KEYS = [
  'teams',
  'members',
  'memberTeamMemberships',
  'teamManagerAssignments',
  'scheduleChangeRequests',
  'schedulePeriods',
  'scheduleAssignments',
  'publicationRecords',
];

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasSupportedTopLevelShape(value) {
  if (!isRecord(value) || value.schemaVersion !== EXPECTED_SCHEMA_VERSION || !isRecord(value.workspace)) {
    return false;
  }

  return REQUIRED_ARRAY_KEYS.every((key) => Array.isArray(value[key]));
}

function hasWorkspaceMismatch(pkg) {
  if (pkg.workspace.workspaceId !== EXPECTED_WORKSPACE_ID) {
    return true;
  }

  return REQUIRED_ARRAY_KEYS.some((key) => (
    pkg[key].some((item) => isRecord(item) && item.workspaceId !== EXPECTED_WORKSPACE_ID)
  ));
}

function sha256Hex(raw) {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function ids(items) {
  return new Set(items.map((item) => item.id));
}

function hasBrokenReference(pkg) {
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

function hasInvalidCounts(pkg, manifest) {
  if (!isRecord(manifest.counts)) {
    return true;
  }

  return REQUIRED_ARRAY_KEYS.some((key) => manifest.counts[key] !== pkg[key].length);
}

export function validateDemoPackage({ packageRaw, manifestRaw }) {
  let parsedPackage;
  let parsedManifest;

  try {
    parsedPackage = JSON.parse(packageRaw);
    parsedManifest = JSON.parse(manifestRaw);
  } catch {
    return {
      ok: false,
      code: 'INVALID_PACKAGE',
      message: 'O pacote enviado não é um JSON válido.',
    };
  }

  if (!hasSupportedTopLevelShape(parsedPackage)) {
    return {
      ok: false,
      code: 'SCHEMA_UNSUPPORTED',
      message: 'Este pacote de demonstração usa uma versão de schema não suportada.',
    };
  }

  if (hasWorkspaceMismatch(parsedPackage)) {
    return {
      ok: false,
      code: 'WORKSPACE_NOT_ALLOWED',
      message: 'O pacote contém dados de um workspace diferente de demo-v1.',
    };
  }

  if (!isRecord(parsedManifest) || parsedManifest.sha256 !== sha256Hex(packageRaw)) {
    return {
      ok: false,
      code: 'CHECKSUM_MISMATCH',
      message: 'O checksum do pacote não confere com o manifesto enviado.',
    };
  }

  if (hasBrokenReference(parsedPackage)) {
    return {
      ok: false,
      code: 'BROKEN_REFERENCE',
      message: 'O pacote de demonstração tem uma referência interna quebrada.',
    };
  }

  if (hasInvalidCounts(parsedPackage, parsedManifest)) {
    return {
      ok: false,
      code: 'INVALID_PACKAGE',
      // Não há código dedicado para divergência de contagem no servidor nesta fase.
      message: 'O pacote de demonstração tem contagem divergente em relação ao manifesto.',
    };
  }

  if (
    parsedPackage.workspace.externalEffectsAllowed !== false
    || parsedPackage.workspace.notificationsEnabled !== false
  ) {
    return {
      ok: false,
      code: 'WORKSPACE_NOT_ALLOWED',
      message: 'Efeitos externos e notificações não podem estar habilitados no workspace demo-v1.',
    };
  }

  return { ok: true, package: parsedPackage };
}
