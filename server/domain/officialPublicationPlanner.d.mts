export type OfficialPublicationWrite = {
  collection: string;
  collectionPath?: string;
  id: string;
  data: Record<string, unknown>;
};

export type OfficialPublicationPlan = {
  workspaceId: string;
  expectedNextRevision: number;
  entityWrites: OfficialPublicationWrite[];
  workspaceActivationWrite: OfficialPublicationWrite;
  publicationRecordWrite: OfficialPublicationWrite;
  counts: Record<string, number>;
};

export function buildOfficialPublicationPlan(params: {
  package: Record<string, any>;
  currentActiveRevision: number | null;
}): OfficialPublicationPlan;
