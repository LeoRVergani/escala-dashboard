interface DemoWorkspaceBannerProps {
  workspaceId: string;
  sourcePublicationRevision: number;
  dirty: boolean;
}

export function DemoWorkspaceBanner({
  workspaceId,
  sourcePublicationRevision,
  dirty,
}: DemoWorkspaceBannerProps) {
  return (
    <div className="n1-modebar demo-workspace-banner" role="status">
      <div>
        <strong>AMBIENTE DE DEMONSTRAÇÃO</strong>
        <span>As alterações realizadas aqui não afetam equipes reais.</span>
        <span>
          Workspace: {workspaceId} · Revisão da fixture: {sourcePublicationRevision}
        </span>
        {dirty && <span className="demo-workspace-dirty">Alterações locais não publicadas</span>}
      </div>
    </div>
  );
}
