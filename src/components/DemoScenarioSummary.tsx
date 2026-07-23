import type { DemoPublicationPackage } from '../lib/demoWorkspace/dto';
import type { DemoWorkspaceDiff } from '../lib/demoWorkspace/diff';

interface DemoScenarioSummaryProps {
  pkg: DemoPublicationPackage;
  sourcePublicationRevision: number;
  localDraftRevision: number;
  dirty: boolean;
  diff: DemoWorkspaceDiff | null;
}

export function DemoScenarioSummary({
  pkg,
  sourcePublicationRevision,
  localDraftRevision,
  dirty,
  diff,
}: DemoScenarioSummaryProps) {
  const managerChanges = diff ? diff.managerAssignmentsAdded + diff.managerAssignmentsChanged : 0;

  return (
    <section className="demo-scenario-summary" aria-label="Resumo do cenário Demo">
      <dl>
        <div><dt>Workspace</dt><dd>{pkg.workspace.workspaceId}</dd></div>
        <div><dt>Equipes</dt><dd>{pkg.teams.length}</dd></div>
        <div><dt>Membros</dt><dd>{pkg.members.length}</dd></div>
        <div><dt>Responsáveis</dt><dd>{pkg.teamManagerAssignments.length}</dd></div>
        <div><dt>Períodos</dt><dd>{pkg.schedulePeriods.length}</dd></div>
        <div><dt>Atribuições</dt><dd>{pkg.scheduleAssignments.length}</dd></div>
        <div><dt>Solicitações</dt><dd>{pkg.scheduleChangeRequests.length}</dd></div>
        <div><dt>Revisão de origem</dt><dd>{sourcePublicationRevision}</dd></div>
        <div><dt>Revisão local</dt><dd>{localDraftRevision}</dd></div>
        <div><dt>Alterações locais</dt><dd>{dirty ? 'SIM' : 'NÃO'}</dd></div>
      </dl>
      {dirty && diff && (
        <p className="demo-scenario-diff">
          Atribuições alteradas: {diff.scheduleAssignmentsChanged}
          {' · '}
          Responsáveis alterados: {managerChanges}
          {' · '}
          Solicitações alteradas: {diff.requestsChanged}
          {' · '}
          Exclusões: {diff.deletions}
        </p>
      )}
    </section>
  );
}
