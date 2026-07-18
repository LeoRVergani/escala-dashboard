export type PublicationWrite = {
  collection: string;
  id: string;
  data: Record<string, unknown>;
};

export type PublicationPlan = {
  workspaceId: string;
  expectedNextRevision: number;
  entityWrites: PublicationWrite[];
  workspaceActivationWrite: PublicationWrite;
  publicationRecordWrite: PublicationWrite;
  counts: Record<string, number>;
};

export function buildPublicationPlan(params: {
  package: Record<string, any>;
  currentActiveRevision: number | null;
}): PublicationPlan;
