export type WorkspaceStatus = {
  exists: boolean;
  publicationRevision: number;
  workspaceType?: string;
  scenarioId?: string | null;
  seedVersion?: number | null;
  updatedAt?: string;
};

export type InMemoryPublicationStore = {
  getWorkspaceStatus(workspaceId: string): Promise<WorkspaceStatus>;
  reserveRevision(workspaceId: string, revision: number, meta: Record<string, unknown>): Promise<Record<string, unknown>>;
  writeRevisionDocuments(plan: { entityWrites: Array<{ collection: string; id: string; data: Record<string, unknown> }> }): Promise<{ countsCreated: number; countsUpdated: number }>;
  activateRevision(workspaceId: string, revision: number, workspaceData: Record<string, unknown>): Promise<Record<string, unknown>>;
  markPublicationFailed(workspaceId: string, revision: number, reason: string): Promise<Record<string, unknown>>;
  findByIdempotencyKey(workspaceId: string, idempotencyKey: string): Promise<Record<string, unknown> | null>;
};

export function createInMemoryPublicationStore(): InMemoryPublicationStore;
