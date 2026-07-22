import { createHash } from 'node:crypto';

// Espelha demoPackageValidator.mjs, mas exige workspace ici-dev em vez de demo-v1.
const EXPECTED_SCHEMA_VERSION = 1;
const EXPECTED_WORKSPACE_ID = 'ici-dev';
const WORK_WITHOUT_SHIFT_PREFIX = 'Trabalho sem turno localizado';

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

function hasWorkWithoutLocatedShift(pkg) {
  return pkg.scheduleAssignments.some((item) => (
    item.assignmentType === 'OTHER'
    && typeof item.shiftName === 'string'
    && item.shiftName.startsWith(WORK_WITHOUT_SHIFT_PREFIX)
  ));
}

function hasOnCallAssignmentWithoutGroup(pkg) {
  return pkg.scheduleAssignments.some((item) => (
    item.assignmentType === 'WORK_SHIFT'
    && item.shiftName === 'Plantão'
    && (typeof item.groupId !== 'string' || item.groupId.trim() === '')
  ));
}

function duplicateAssignment(pkg) {
  const seen = new Set();
  return pkg.scheduleAssignments.find((item) => {
    if (typeof item.memberId !== 'string' || typeof item.date !== 'string') return false;
    const key = `${item.memberId}\u0000${item.date}`;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

function assignmentDateOutOfPeriod(pkg) {
  const periodsById = new Map(pkg.schedulePeriods.map((item) => [item.id, item]));

  return pkg.scheduleAssignments.find((item) => {
    if (typeof item.date !== 'string') return false;
    const period = periodsById.get(item.periodId);
    if (!period || typeof period.startDate !== 'string' || typeof period.endDate !== 'string') return false;
    return item.date < period.startDate || item.date > period.endDate;
  });
}

export function validateOfficialPackage({ packageRaw, manifestRaw }) {
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
      message: 'Este pacote de publicação oficial usa uma versão de schema não suportada.',
    };
  }

  if (hasWorkspaceMismatch(parsedPackage)) {
    return {
      ok: false,
      code: 'WORKSPACE_NOT_ALLOWED',
      message: 'O pacote contém dados de um workspace diferente de ici-dev.',
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
      message: 'O pacote de publicação oficial tem uma referência interna quebrada.',
    };
  }

  if (hasInvalidCounts(parsedPackage, parsedManifest)) {
    return {
      ok: false,
      code: 'INVALID_PACKAGE',
      message: 'O pacote de publicação oficial tem contagem divergente em relação ao manifesto.',
    };
  }

  const duplicatedAssignment = duplicateAssignment(parsedPackage);
  if (duplicatedAssignment) {
    return {
      ok: false,
      code: 'DUPLICATE_ASSIGNMENT',
      message: `O pacote contém atribuição duplicada para memberId ${duplicatedAssignment.memberId} na data ${duplicatedAssignment.date}.`,
    };
  }

  const outOfPeriodAssignment = assignmentDateOutOfPeriod(parsedPackage);
  if (outOfPeriodAssignment) {
    return {
      ok: false,
      code: 'ASSIGNMENT_DATE_OUT_OF_PERIOD',
      message: `A atribuição ${outOfPeriodAssignment.id ?? ''} de memberId ${outOfPeriodAssignment.memberId} usa a data ${outOfPeriodAssignment.date} fora do período ${outOfPeriodAssignment.periodId}.`,
    };
  }

  if (hasWorkWithoutLocatedShift(parsedPackage)) {
    return {
      ok: false,
      code: 'SCHEDULE_WORK_SHIFT_NOT_LOCATED',
      message: 'O pacote contém trabalho declarado sem turno localizado na aba Escala.',
    };
  }

  if (hasOnCallAssignmentWithoutGroup(parsedPackage)) {
    return {
      ok: false,
      code: 'ON_CALL_GROUP_REQUIRED',
      message: 'O pacote contém plantão sem grupo definido.',
    };
  }

  if (
    parsedPackage.workspace.externalEffectsAllowed !== false
    || parsedPackage.workspace.notificationsEnabled !== false
  ) {
    return {
      ok: false,
      code: 'WORKSPACE_NOT_ALLOWED',
      message: 'Efeitos externos e notificações não podem estar habilitados no workspace ici-dev.',
    };
  }

  return { ok: true, package: parsedPackage };
}

// Vinculo corporativo (adendo FASE 14D secao "Vinculo da conta lvergani"): o membro
// indicado precisa existir no pacote, pertencer ao time indicado (via
// memberTeamMemberships ativo) e o time precisa existir no pacote. Isso nao grava
// nada sozinho - so valida a forma do vinculo antes de permitir dry-run/commit.
export function validateOfficialCorporateLink(pkg, corporateLink) {
  if (!isRecord(corporateLink)) {
    return {
      ok: false,
      code: 'CORPORATE_LINK_INVALID',
      message: 'O vínculo corporativo é obrigatório para publicar o workspace oficial.',
    };
  }

  const { memberId, teamId } = corporateLink;
  if (typeof memberId !== 'string' || memberId.trim() === '') {
    return {
      ok: false,
      code: 'CORPORATE_LINK_INVALID',
      message: 'O vínculo corporativo precisa indicar um memberId.',
    };
  }

  if (typeof teamId !== 'string' || teamId.trim() === '') {
    return {
      ok: false,
      code: 'CORPORATE_LINK_INVALID',
      message: 'O vínculo corporativo precisa indicar um teamId.',
    };
  }

  const member = pkg.members.find((item) => item.id === memberId);
  if (!member) {
    return {
      ok: false,
      code: 'CORPORATE_LINK_MEMBER_NOT_FOUND',
      message: 'O membro indicado no vínculo corporativo não existe no pacote publicado.',
    };
  }

  if (member.active !== true) {
    return {
      ok: false,
      code: 'CORPORATE_LINK_MEMBER_NOT_FOUND',
      message: 'O membro indicado no vínculo corporativo está inativo no pacote publicado.',
    };
  }

  const team = pkg.teams.find((item) => item.id === teamId);
  if (!team) {
    return {
      ok: false,
      code: 'CORPORATE_LINK_TEAM_NOT_FOUND',
      message: 'A equipe indicada no vínculo corporativo não existe no pacote publicado.',
    };
  }

  const hasActiveMembership = pkg.memberTeamMemberships.some((item) => (
    item.memberId === memberId && item.teamId === teamId && item.active === true
  ));
  if (!hasActiveMembership) {
    return {
      ok: false,
      code: 'CORPORATE_LINK_MEMBERSHIP_NOT_FOUND',
      message: 'O membro indicado no vínculo corporativo não possui vínculo ativo com essa equipe.',
    };
  }

  return { ok: true };
}
