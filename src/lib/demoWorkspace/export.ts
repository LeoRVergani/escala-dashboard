import type { DemoPublicationPackage } from './dto';

export interface DemoWorkspaceExportEnvelope {
  exportMode: 'LOCAL_DRAFT';
  localDraftRevision: number;
  exportedAt: string;
  package: DemoPublicationPackage;
}

export function buildDemoWorkspaceExport(
  draftPackage: DemoPublicationPackage,
  localDraftRevision: number,
): DemoWorkspaceExportEnvelope {
  return {
    exportMode: 'LOCAL_DRAFT',
    localDraftRevision,
    exportedAt: new Date().toISOString(),
    package: draftPackage,
  };
}

export function demoWorkspaceExportFileName(localDraftRevision: number): string {
  return `demo-v1-local-revision-${String(localDraftRevision).padStart(3, '0')}.json`;
}
