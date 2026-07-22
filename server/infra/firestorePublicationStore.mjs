import { FieldValue } from 'firebase-admin/firestore';
import { PublicationError } from '../errors.mjs';

const MAX_BATCH_WRITES = 400;

function publicationRecordId(workspaceId, revision) {
  return `${workspaceId}_${revision}`;
}

function collectionDoc(db, collection, id) {
  return db.collection(collection).doc(id);
}

function writeCollectionDoc(db, write) {
  return db.collection(write.collectionPath ?? write.collection).doc(write.id);
}

function revisionCollectionPath(workspaceId, revision, collection) {
  return `workspaces/${workspaceId}/revisions/${revision}/${collection}`;
}

async function readDocumentData(ref) {
  const snap = await ref.get();
  return snap.exists ? snap.data() : null;
}

// Códigos gRPC/Firestore que indicam contenção real (duas transações disputando o mesmo
// documento), distintos de falhas de rede/permissão/índice que não devem virar 409.
const CONCURRENCY_ERROR_CODES = new Set([6, 9, 10, 'already-exists', 'aborted', 'failed-precondition']);

function isLikelyConcurrencyError(err) {
  return CONCURRENCY_ERROR_CODES.has(err?.code);
}

export function createFirestorePublicationStore(db) {
  return {
    async getWorkspaceStatus(workspaceId) {
      const data = await readDocumentData(collectionDoc(db, 'workspaces', workspaceId));
      if (!data) {
        return { exists: false, publicationRevision: 0 };
      }

      return {
        exists: true,
        publicationRevision: data.publicationRevision,
        workspaceType: data.workspaceType,
        scenarioId: data.scenarioId,
        seedVersion: data.seedVersion,
        updatedAt: data.updatedAt,
      };
    },

    async reserveRevision(workspaceId, expectedActiveRevision, idempotencyKey, meta) {
      try {
        return await db.runTransaction(async (tx) => {
          const workspaceRef = collectionDoc(db, 'workspaces', workspaceId);
          const idempotencyQuery = db
            .collection('publication_records')
            .where('workspaceId', '==', workspaceId)
            .where('idempotencyKey', '==', idempotencyKey)
            .limit(1);
          const [workspaceSnap, idempotencySnap] = await Promise.all([
            tx.get(workspaceRef),
            tx.get(idempotencyQuery),
          ]);

          if (!idempotencySnap.empty) {
            const record = idempotencySnap.docs[0].data();
            if (record.status === 'ACTIVE') {
              return { outcome: 'ALREADY_ACTIVE', record };
            }

            if (record.status === 'PREPARING') {
              throw new PublicationError(
                'IDEMPOTENCY_CONFLICT',
                'Já existe uma publicação em andamento com esta chave de idempotência.',
              );
            }
          }

          const currentRevision = workspaceSnap.exists
            ? (workspaceSnap.data()?.publicationRevision ?? 0)
            : 0;
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
          const recordId = publicationRecordId(workspaceId, nextRevision);
          const existingIdempotencyRecord = idempotencySnap.empty ? null : idempotencySnap.docs[0].data();
          const recordData = {
            id: recordId,
            workspaceId,
            publicationRevision: nextRevision,
            idempotencyKey,
            ...meta,
            status: 'PREPARING',
            publishedAt: null,
            failureReason: null,
          };

          if (existingIdempotencyRecord?.status === 'FAILED') {
            if (existingIdempotencyRecord.publicationRevision !== nextRevision) {
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

            tx.set(collectionDoc(db, 'publication_records', recordId), recordData, { merge: true });
          } else {
            tx.create(collectionDoc(db, 'publication_records', recordId), recordData);
          }

          return { outcome: 'RESERVED', nextRevision, recordId };
        });
      } catch (err) {
        if (err instanceof PublicationError) {
          throw err;
        }

        if (isLikelyConcurrencyError(err)) {
          throw new PublicationError(
            'PUBLICATION_REVISION_CONFLICT',
            `Revisão ativa esperada ${expectedActiveRevision}, mas a revisão real mudou antes da reserva.`,
            {
              details: {
                expectedActiveRevision,
              },
            },
          );
        }

        console.error('demo_publish_reserve_failed', {
          workspaceId,
          errorMessage: err?.message,
          errorCode: err?.code,
        });
        throw new PublicationError(
          'FIRESTORE_WRITE_FAILED',
          'Não foi possível reservar a próxima revisão de publicação.',
        );
      }
    },

    async writeRevisionDocuments(plan) {
      for (let start = 0; start < plan.entityWrites.length; start += MAX_BATCH_WRITES) {
        const batch = db.batch();
        const chunk = plan.entityWrites.slice(start, start + MAX_BATCH_WRITES);

        for (const write of chunk) {
          batch.set(writeCollectionDoc(db, write), write.data);
        }

        await batch.commit();
      }

      return { countsCreated: plan.entityWrites.length, countsUpdated: 0 };
    },

    async activateRevision(workspaceId, revision, workspaceData, counts) {
      const workspaceRef = collectionDoc(db, 'workspaces', workspaceId);
      const recordRef = collectionDoc(db, 'publication_records', publicationRecordId(workspaceId, revision));

      await db.runTransaction(async (tx) => {
        const workspaceSnap = await tx.get(workspaceRef);
        const currentRevision = workspaceSnap.exists
          ? (workspaceSnap.data()?.publicationRevision ?? 0)
          : 0;
        if (currentRevision !== revision - 1) {
          throw new PublicationError(
            'PUBLICATION_ACTIVATION_FAILED',
            'A revisão ativa mudou de forma inesperada antes da ativação.',
          );
        }

        tx.set(workspaceRef, {
          ...workspaceData,
          workspaceId,
          publicationRevision: revision,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        tx.set(recordRef, {
          ...(counts ? { counts } : {}),
          status: 'ACTIVE',
          publishedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      // A transação já confirmou a ativação neste ponto. Uma falha na releitura abaixo não
      // pode virar "falha de ativação" - isso marcaria como FAILED uma revisão já ativa.
      try {
        return await readDocumentData(recordRef);
      } catch (err) {
        console.error('demo_publish_activate_readback_failed', {
          workspaceId,
          revision,
          errorMessage: err?.message,
          errorCode: err?.code,
        });
        return {
          id: recordRef.id,
          workspaceId,
          publicationRevision: revision,
          status: 'ACTIVE',
          publishedAt: null,
          ...(counts ? { counts } : {}),
        };
      }
    },

    async markPublicationFailed(workspaceId, revision, reason) {
      const recordRef = collectionDoc(db, 'publication_records', publicationRecordId(workspaceId, revision));

      await recordRef.set({
        status: 'FAILED',
        failureReason: String(reason).slice(0, 240),
      }, { merge: true });

      return readDocumentData(recordRef);
    },

    async findByIdempotencyKey(workspaceId, idempotencyKey) {
      const snap = await db
        .collection('publication_records')
        .where('workspaceId', '==', workspaceId)
        .where('idempotencyKey', '==', idempotencyKey)
        .limit(1)
        .get();

      if (snap.empty) {
        return null;
      }

      return snap.docs[0].data();
    },

    async readRevisionSnapshot(workspaceId, revision, collection) {
      const snap = await db.collection(revisionCollectionPath(workspaceId, revision, collection)).get();
      return snap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    },
  };
}
