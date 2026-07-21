import type { DemoPublicationPackage } from '../demoWorkspace/dto';

export const OFFICIAL_WORKSPACE_ID = 'ici-dev';

/**
 * Clona o pacote atualmente carregado (de onde quer que ele tenha vindo - import de XLS,
 * Test Drive, etc.) e retitula workspaceId para o workspace oficial `ici-dev` em todo lugar
 * onde ele aparece. Não faz nenhuma chamada de rede - é só a transformação de dados que
 * antecede o preview/dry-run/commit oficiais. O servidor nunca confia nesse campo (ele
 * decide o workspace efetivo sozinho), mas o pacote enviado precisa já vir rotulado como
 * ici-dev para passar em `validateOfficialPackage`.
 */
export function toOfficialPackage(source: DemoPublicationPackage): DemoPublicationPackage {
  return {
    ...source,
    workspace: {
      ...source.workspace,
      workspaceId: OFFICIAL_WORKSPACE_ID,
      workspaceType: 'PRODUCTION',
    },
    teams: source.teams.map((item) => ({ ...item, workspaceId: OFFICIAL_WORKSPACE_ID })),
    members: source.members.map((item) => ({ ...item, workspaceId: OFFICIAL_WORKSPACE_ID })),
    memberTeamMemberships: source.memberTeamMemberships.map((item) => ({ ...item, workspaceId: OFFICIAL_WORKSPACE_ID })),
    teamManagerAssignments: source.teamManagerAssignments.map((item) => ({ ...item, workspaceId: OFFICIAL_WORKSPACE_ID })),
    scheduleChangeRequests: source.scheduleChangeRequests.map((item) => ({ ...item, workspaceId: OFFICIAL_WORKSPACE_ID })),
    schedulePeriods: source.schedulePeriods.map((item) => ({ ...item, workspaceId: OFFICIAL_WORKSPACE_ID })),
    scheduleAssignments: source.scheduleAssignments.map((item) => ({ ...item, workspaceId: OFFICIAL_WORKSPACE_ID })),
    publicationRecords: source.publicationRecords.map((item) => ({ ...item, workspaceId: OFFICIAL_WORKSPACE_ID })),
  };
}

export interface OfficialCorporateLink {
  memberId: string;
  teamId: string;
  entraTenantId?: string;
  entraObjectId?: string;
  email?: string;
  login?: string;
}

// Guarda de contaminação (FASE 14E, seção "Vínculo corporativo oficial"): o servidor
// (assertOfficialOnlyWritePlan.mjs) já rejeita qualquer id que contenha "demo" no plano
// de publicação. Antes desta fase, nada equivalente existia no cliente - o pacote oficial
// de hoje é sempre `toOfficialPackage(demoWorkspaceState.draftPackage)`, e todo id da
// fixture demo-v1 contém "demo" (ex.: `member-demo-gestor-seguranca`), então o vínculo
// corporativo nunca tinha, na prática, uma opção que sobrevivesse ao COMMIT. Estas funções
// espelham a mesma checagem no cliente, para nunca oferecer nem aceitar essas opções antes
// de chegar ao servidor. Deliberadamente NÃO alteram `validateCorporateLinkLocally` (ver
// tests/officialWorkspaceRetarget.test.ts) - continuam sendo verificações adicionais, não
// uma substituição da validação referencial existente.
const DEMO_TAINT_PATTERN = /demo/i;

export function isEligibleOfficialMember(member: { id: string; workspaceId: string }): boolean {
  return member.workspaceId === OFFICIAL_WORKSPACE_ID && !DEMO_TAINT_PATTERN.test(member.id);
}

export function isEligibleOfficialTeam(team: { id: string; workspaceId: string }): boolean {
  return team.workspaceId === OFFICIAL_WORKSPACE_ID && !DEMO_TAINT_PATTERN.test(team.id);
}

export function eligibleOfficialMembers(pkg: DemoPublicationPackage) {
  return pkg.members.filter((member) => member.active && isEligibleOfficialMember(member));
}

export function eligibleOfficialTeams(pkg: DemoPublicationPackage) {
  return pkg.teams.filter(isEligibleOfficialTeam);
}

/**
 * Verifica se um vínculo corporativo já escolhido aponta para um membro e uma equipe que
 * sobrevivem à guarda de contaminação. Usada além de `validateCorporateLinkLocally` (que
 * cobre só integridade referencial) para desabilitar dry-run/publicação quando o vínculo,
 * apesar de referencialmente válido, usa dados do Ambiente Demo.
 */
export function isOfficialLinkEligible(pkg: DemoPublicationPackage, link: Partial<OfficialCorporateLink>): boolean {
  if (!link.memberId || !link.teamId) return false;
  const member = pkg.members.find((item) => item.id === link.memberId);
  const team = pkg.teams.find((item) => item.id === link.teamId);
  if (!member || !team) return false;
  return isEligibleOfficialMember(member) && isEligibleOfficialTeam(team);
}

/**
 * Valida no cliente (feedback imediato, antes de chamar o servidor) que o vínculo aponta
 * para um membro e uma equipe existentes no pacote, com vínculo ativo entre os dois. O
 * servidor sempre revalida isso de forma independente (validateOfficialCorporateLink) -
 * esta função só existe para não deixar o usuário esperar um round-trip para descobrir um
 * erro que já dava para saber localmente.
 */
export function validateCorporateLinkLocally(
  pkg: DemoPublicationPackage,
  link: Partial<OfficialCorporateLink>,
): string | null {
  if (!link.memberId || !link.teamId) {
    return 'Selecione o membro e a equipe para o vínculo corporativo.';
  }

  const member = pkg.members.find((item) => item.id === link.memberId);
  if (!member) {
    return 'O membro selecionado não existe no pacote importado.';
  }

  if (!member.active) {
    return 'O membro selecionado está inativo no pacote importado.';
  }

  const team = pkg.teams.find((item) => item.id === link.teamId);
  if (!team) {
    return 'A equipe selecionada não existe no pacote importado.';
  }

  const hasActiveMembership = pkg.memberTeamMemberships.some((item) => (
    item.memberId === link.memberId && item.teamId === link.teamId && item.active
  ));
  if (!hasActiveMembership) {
    return 'O membro selecionado não possui vínculo ativo com essa equipe.';
  }

  return null;
}
