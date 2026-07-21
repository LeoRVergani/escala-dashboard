export type WorkspaceStatus = {
  exists: boolean;
  publicationRevision: number;
  workspaceType?: string;
  scenarioId?: string | null;
  seedVersion?: number | null;
  updatedAt?: string;
};

export type ReserveRevisionResult =
  | {
    outcome: 'RESERVED';
    nextRevision: number;
    recordId: string;
  }
  | {
    outcome: 'ALREADY_ACTIVE';
    record: Record<string, unknown>;
  };

export type InMemoryPublicationStore = {
  getWorkspaceStatus(workspaceId: string): Promise<WorkspaceStatus>;
  reserveRevision(
    workspaceId: string,
    expectedActiveRevision: number,
    idempotencyKey: string,
    meta: Record<string, unknown>,
  ): Promise<ReserveRevisionResult>;
  writeRevisionDocuments(plan: { entityWrites: Array<{ collection: string; collectionPath?: string; id: string; data: Record<string, unknown> }> }): Promise<{ countsCreated: number; countsUpdated: number }>;
  activateRevision(workspaceId: string, revision: number, workspaceData: Record<string, unknown>, counts?: { countsCreated: number; countsUpdated: number }): Promise<Record<string, unknown>>;
  markPublicationFailed(workspaceId: string, revision: number, reason: string): Promise<Record<string, unknown>>;
  findByIdempotencyKey(workspaceId: string, idempotencyKey: string): Promise<Record<string, unknown> | null>;
  readRevisionSnapshot(workspaceId: string, revision: number, collection: string): Promise<Array<Record<string, unknown>>>;
  readActiveSnapshot(workspaceId: string, collection: string): Promise<Array<Record<string, unknown>>>;
};

export function createInMemoryPublicationStore(options?: {
  maxBatchWrites?: number;
  failBatchIndexes?: Set<number>;
}): InMemoryPublicationStore;
