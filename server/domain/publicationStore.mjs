/**
 * @typedef {object} PublicationStore
 * @property {(workspaceId: string) => Promise<object>} getWorkspaceStatus
 * Retorna `{ exists: true, publicationRevision, workspaceType, scenarioId, seedVersion, updatedAt }`
 * quando existir, ou `{ exists: false, publicationRevision: 0 }` quando nunca publicado.
 * @property {(workspaceId: string, expectedActiveRevision: number, idempotencyKey: string, meta: object) => Promise<object>} reserveRevision
 * Reserva atomicamente a próxima revisão ou retorna uma publicação ACTIVE existente pela chave de idempotência.
 * @property {(plan: object) => Promise<{ countsCreated: number, countsUpdated: number }>} writeRevisionDocuments
 * Grava todas as entidades do plano no snapshot isolado da revisão candidata.
 * @property {(workspaceId: string, revision: number, workspaceData: object, counts?: object) => Promise<object>} activateRevision
 * Atualiza `workspaces/{workspaceId}` e marca o registro da publicação como `ACTIVE`, gravando `counts` no
 * registro para que uma repetição por idempotencyKey possa devolver a mesma resposta sem recalcular nada.
 * @property {(workspaceId: string, revision: number, reason: string) => Promise<object>} markPublicationFailed
 * Marca o registro da publicação como `FAILED`, guardando `failureReason` sem stack trace.
 * @property {(workspaceId: string, idempotencyKey: string) => Promise<object | null>} findByIdempotencyKey
 * Procura uma publicação existente pela chave de idempotência no workspace informado.
 * @property {(workspaceId: string, revision: number, collection: string) => Promise<object[]>} readRevisionSnapshot
 * Retorna os documentos de uma coleção dentro do snapshot de uma revisão.
 * @property {(workspaceId: string, collection: string) => Promise<object[]>} readActiveSnapshot
 * Resolve o ponteiro ativo do workspace e retorna a coleção do snapshot ativo.
 */

import { PublicationError } from '../errors.mjs';

function publicationRecordId(workspaceId, revision) {
  return `${workspaceId}_${revision}`;
}

const DEFAULT_MAX_BATCH_WRITES = 400;

function clone(value) {
  return value == null ? value : { ...value };
}

function snapshotCollectionPath(workspaceId, revision, collection) {
  return `workspaces/${workspaceId}/revisions/${revision}/${collection}`;
}

export function createInMemoryPublicationStore(options = {}) {
  const maxBatchWrites = options.maxBatchWrites ?? DEFAULT_MAX_BATCH_WRITES;
  const failBatchIndexes = options.failBatchIndexes ?? new Set();
  const workspaces = new Map();
  const publicationRecords = new Map();
  const collections = new Map();

  function collectionFor(path) {
    if (!collections.has(path)) {
      collections.set(path, new Map());
    }

    return collections.get(path);
  }

  function snapshotFor(workspaceId, revision, collection) {
    const snapshot = collections.get(snapshotCollectionPath(workspaceId, revision, collection));
    if (!snapshot) {
      return [];
    }

    return Array.from(snapshot.values())
      .map(clone)
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
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

    async reserveRevision(workspaceId, expectedActiveRevision, idempotencyKey, meta) {
      for (const record of publicationRecords.values()) {
        if (record.workspaceId !== workspaceId || record.idempotencyKey !== idempotencyKey) {
          continue;
        }

        if (record.status === 'ACTIVE') {
          return { outcome: 'ALREADY_ACTIVE', record: clone(record) };
        }

        if (record.status === 'PREPARING') {
          throw new PublicationError(
            'IDEMPOTENCY_CONFLICT',
            'Já existe uma publicação em andamento com esta chave de idempotência.',
          );
        }
      }

      const currentRevision = workspaces.get(workspaceId)?.publicationRevision ?? 0;
      if (currentRevision !== expectedActiveRevision) {
        throw new PublicationError(
          'PUBLICATION_REVISION_CONFLICT',
          `Revisão ativa esperada ${expectedActiveRevision}, mas a revisão real é ${currentRevision}.`,
          {
            details: {
              expectedActiveRevision,
              actualActiveRevision: currentRevision,
            },
          },
        );
      }

      const nextRevision = currentRevision + 1;
      const id = publicationRecordId(workspaceId, nextRevision);
      const failedRecordWithSameKey = Array.from(publicationRecords.values()).find((record) => (
        record.workspaceId === workspaceId
        && record.idempotencyKey === idempotencyKey
        && record.status === 'FAILED'
      ));

      if (failedRecordWithSameKey && failedRecordWithSameKey.publicationRevision !== nextRevision) {
        throw new PublicationError(
          'PUBLICATION_REVISION_CONFLICT',
          `Revisão ativa esperada ${expectedActiveRevision}, mas a chave de idempotência pertence a outra revisão.`,
          {
            details: {
              expectedActiveRevision,
              actualActiveRevision: currentRevision,
            },
          },
        );
      }

      if (publicationRecords.has(id) && !failedRecordWithSameKey) {
        throw new PublicationError(
          'PUBLICATION_REVISION_CONFLICT',
          `Revisão ativa esperada ${expectedActiveRevision}, mas a revisão real é ${currentRevision}.`,
          {
            details: {
              expectedActiveRevision,
              actualActiveRevision: currentRevision,
            },
          },
        );
      }

      const record = {
        id,
        workspaceId,
        publicationRevision: nextRevision,
        idempotencyKey,
        ...clone(meta),
        status: 'PREPARING',
        publishedAt: null,
        failureReason: null,
      };
      publicationRecords.set(id, record);
      return { outcome: 'RESERVED', nextRevision, recordId: id };
    },

    async writeRevisionDocuments(plan) {
      for (let start = 0; start < plan.entityWrites.length; start += maxBatchWrites) {
        const batchIndex = Math.floor(start / maxBatchWrites);
        if (failBatchIndexes.has(batchIndex)) {
          throw new Error('forced batch failure');
        }

        for (const write of plan.entityWrites.slice(start, start + maxBatchWrites)) {
          const collection = collectionFor(write.collectionPath ?? write.collection);
          collection.set(write.id, clone(write.data));
        }
      }

      return { countsCreated: plan.entityWrites.length, countsUpdated: 0 };
    },

    async activateRevision(workspaceId, revision, workspaceData, counts) {
      const currentRevision = workspaces.get(workspaceId)?.publicationRevision ?? 0;
      if (currentRevision !== revision - 1) {
        throw new PublicationError(
          'PUBLICATION_ACTIVATION_FAILED',
          'A revisão ativa mudou de forma inesperada antes da ativação.',
        );
      }

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
        ...(counts ? { counts: clone(counts) } : {}),
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

    async readRevisionSnapshot(workspaceId, revision, collection) {
      return snapshotFor(workspaceId, revision, collection);
    },

    async readActiveSnapshot(workspaceId, collection) {
      const revision = workspaces.get(workspaceId)?.publicationRevision ?? 0;
      if (!revision) {
        return [];
      }

      return snapshotFor(workspaceId, revision, collection);
    },
  };
}
