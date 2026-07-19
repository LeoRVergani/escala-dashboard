/**
 * @typedef {object} PublicationStore
 * @property {(workspaceId: string) => Promise<object>} getWorkspaceStatus
 * Retorna `{ exists: true, publicationRevision, workspaceType, scenarioId, seedVersion, updatedAt }`
 * quando existir, ou `{ exists: false, publicationRevision: 0 }` quando nunca publicado.
 * @property {(workspaceId: string, expectedActiveRevision: number, idempotencyKey: string, meta: object) => Promise<object>} reserveRevision
 * Reserva atomicamente a próxima revisão ou retorna uma publicação ACTIVE existente pela chave de idempotência.
 * @property {(plan: object) => Promise<{ countsCreated: number, countsUpdated: number }>} writeRevisionDocuments
 * Grava todas as entidades do plano.
 * @property {(workspaceId: string, revision: number, workspaceData: object, counts?: object) => Promise<object>} activateRevision
 * Atualiza `workspaces/{workspaceId}` e marca o registro da publicação como `ACTIVE`, gravando `counts` no
 * registro para que uma repetição por idempotencyKey possa devolver a mesma resposta sem recalcular nada.
 * @property {(workspaceId: string, revision: number, reason: string) => Promise<object>} markPublicationFailed
 * Marca o registro da publicação como `FAILED`, guardando `failureReason` sem stack trace.
 * @property {(workspaceId: string, idempotencyKey: string) => Promise<object | null>} findByIdempotencyKey
 * Procura uma publicação existente pela chave de idempotência no workspace informado.
 */

import { PublicationError } from '../errors.mjs';

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
      if (publicationRecords.has(id)) {
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
      };
      publicationRecords.set(id, record);
      return { outcome: 'RESERVED', nextRevision, recordId: id };
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
  };
}
