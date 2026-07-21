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
