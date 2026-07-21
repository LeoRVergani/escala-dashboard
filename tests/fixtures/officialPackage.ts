import type { DemoPublicationPackage } from '../../src/lib/demoWorkspace/dto';

// Pacote sintético (dados fictícios, domínio example.invalid) representando um pacote
// oficial já elegível para ici-dev: nenhum id contém "demo". Usado pelos testes que
// precisam de um vínculo corporativo válido de ponta a ponta, sem depender da fixture
// demo-v1 (cujos ids sempre contêm "demo" e nunca devem ser aceitos no fluxo oficial —
// ver FASE 14E, docs/spec/08-DASHBOARD-NAVEGACAO-UX-E-PUBLICACAO-GUIADA.md).
export function buildOfficialTestPackage(): DemoPublicationPackage {
  return {
    schemaVersion: 1,
    workspace: {
      workspaceId: 'ici-dev',
      workspaceType: 'PRODUCTION',
      scenarioId: null,
      seedVersion: null,
      publicationRevision: 0,
      externalEffectsAllowed: false,
      notificationsEnabled: false,
    },
    teams: [
      { id: 'team-oficial-soc', workspaceId: 'ici-dev', name: 'SOC Oficial', acronym: 'SOC', active: true, schemaVersion: 1 },
    ],
    members: [
      {
        id: 'member-oficial-01',
        workspaceId: 'ici-dev',
        displayName: 'Membro Oficial Um',
        corporateLogin: 'membro.oficial',
        emailNormalized: 'membro.oficial@example.invalid',
        active: true,
        schemaVersion: 1,
      },
    ],
    memberTeamMemberships: [
      {
        id: 'membership-oficial-01',
        workspaceId: 'ici-dev',
        memberId: 'member-oficial-01',
        teamId: 'team-oficial-soc',
        startDate: '2026-01-01',
        endDate: null,
        active: true,
        isPrimary: true,
        schemaVersion: 1,
      },
    ],
    teamManagerAssignments: [],
    scheduleChangeRequests: [],
    schedulePeriods: [],
    scheduleAssignments: [],
    publicationRecords: [],
  };
}
