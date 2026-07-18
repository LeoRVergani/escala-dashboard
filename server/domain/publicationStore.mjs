/**
 * @typedef {object} PublicationStore
 * @property {(workspaceId: string) => Promise<object>} getWorkspaceStatus
 * Retorna `{ exists: true, publicationRevision, workspaceType, scenarioId, seedVersion, updatedAt }`
 * quando existir, ou `{ exists: false, publicationRevision: 0 }` quando nunca publicado.
 * @property {(workspaceId: string, revision: number, meta: object) => Promise<object>} reserveRevision
 * Cria `publication_records/{workspaceId_revision}` com status `PREPARING` e os campos de meta recebidos.
 * @property {(plan: object) => Promise<{ countsCreated: number, countsUpdated: number }>} writeRevisionDocuments
 * Grava todas as entidades do plano.
 * @property {(workspaceId: string, revision: number, workspaceData: object) => Promise<object>} activateRevision
 * Atualiza `workspaces/{workspaceId}` e marca o registro da publicação como `ACTIVE`.
 * @property {(workspaceId: string, revision: number, reason: string) => Promise<object>} markPublicationFailed
 * Marca o registro da publicação como `FAILED`, guardando `failureReason` sem stack trace.
 * @property {(workspaceId: string, idempotencyKey: string) => Promise<object | null>} findByIdempotencyKey
 * Procura uma publicação existente pela chave de idempotência no workspace informado.
 */

function publicationRecordId(workspaceId, revision) {
  return `${workspaceId}_${revision}`;
}

function clone(value) {
  return value == null ? value : { ...value };
}

export function createInMemoryPublicationStore() {
  const workspaces = new Map();
  const publicationRecords = new Map();
  const collections = new Map();

  function collectionFor(name) {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }

    return collections.get(name);
  }

  return {
    async getWorkspaceStatus(workspaceId) {
      const workspace = workspaces.get(workspaceId);
      if (!workspace) {
        return { exists: false, publicationRevision: 0 };
      }

      return {
        exists: true,
        publicationRevision: workspace.publicationRevision,
        workspaceType: workspace.workspaceType,
        scenarioId: workspace.scenarioId,
        seedVersion: workspace.seedVersion,
        updatedAt: workspace.updatedAt,
      };
    },

    async reserveRevision(workspaceId, revision, meta) {
      const id = publicationRecordId(workspaceId, revision);
      const record = {
        id,
        workspaceId,
        publicationRevision: revision,
        ...clone(meta),
        status: 'PREPARING',
      };
      publicationRecords.set(id, record);
      return clone(record);
    },

    async writeRevisionDocuments(plan) {
      let countsCreated = 0;
      let countsUpdated = 0;

      for (const write of plan.entityWrites) {
        const collection = collectionFor(write.collection);
        if (collection.has(write.id)) {
          countsUpdated += 1;
        } else {
          countsCreated += 1;
        }

        collection.set(write.id, clone(write.data));
      }

      return { countsCreated, countsUpdated };
    },

    async activateRevision(workspaceId, revision, workspaceData) {
      const workspace = {
        ...clone(workspaceData),
        workspaceId,
        publicationRevision: revision,
        updatedAt: new Date().toISOString(),
      };
      workspaces.set(workspaceId, workspace);

      const id = publicationRecordId(workspaceId, revision);
      const existing = publicationRecords.get(id) ?? { id, workspaceId, publicationRevision: revision };
      const record = {
        ...existing,
        status: 'ACTIVE',
        publishedAt: new Date().toISOString(),
      };
      publicationRecords.set(id, record);

      return clone(record);
    },

    async markPublicationFailed(workspaceId, revision, reason) {
      const id = publicationRecordId(workspaceId, revision);
      const existing = publicationRecords.get(id) ?? { id, workspaceId, publicationRevision: revision };
      const record = {
        ...existing,
        status: 'FAILED',
        failureReason: String(reason).slice(0, 240),
      };
      publicationRecords.set(id, record);
      return clone(record);
    },

    async findByIdempotencyKey(workspaceId, idempotencyKey) {
      for (const record of publicationRecords.values()) {
        if (record.workspaceId === workspaceId && record.idempotencyKey === idempotencyKey) {
          return clone(record);
        }
      }

      return null;
    },
  };
}
