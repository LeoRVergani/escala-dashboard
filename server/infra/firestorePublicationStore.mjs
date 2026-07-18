import admin from 'firebase-admin';

const MAX_BATCH_WRITES = 400;

function publicationRecordId(workspaceId, revision) {
  return `${workspaceId}_${revision}`;
}

function collectionDoc(db, collection, id) {
  return db.collection(collection).doc(id);
}

async function readDocumentData(ref) {
  const snap = await ref.get();
  return snap.exists ? snap.data() : null;
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

    async reserveRevision(workspaceId, revision, meta) {
      const id = publicationRecordId(workspaceId, revision);
      const record = {
        id,
        workspaceId,
        publicationRevision: revision,
        ...meta,
        status: 'PREPARING',
        publishedAt: null,
      };

      await collectionDoc(db, 'publication_records', id).set(record);
      return record;
    },

    async writeRevisionDocuments(plan) {
      for (let start = 0; start < plan.entityWrites.length; start += MAX_BATCH_WRITES) {
        const batch = db.batch();
        const chunk = plan.entityWrites.slice(start, start + MAX_BATCH_WRITES);

        for (const write of chunk) {
          batch.set(collectionDoc(db, write.collection, write.id), write.data);
        }

        await batch.commit();
      }

      // IDs determinísticos evitam leituras individuais caras só para distinguir create/update.
      if (plan.expectedNextRevision === 1) {
        return { countsCreated: plan.entityWrites.length, countsUpdated: 0 };
      }

      return { countsCreated: 0, countsUpdated: plan.entityWrites.length };
    },

    async activateRevision(workspaceId, revision, workspaceData) {
      const workspaceRef = collectionDoc(db, 'workspaces', workspaceId);
      const recordRef = collectionDoc(db, 'publication_records', publicationRecordId(workspaceId, revision));

      await db.runTransaction(async (tx) => {
        tx.set(workspaceRef, {
          ...workspaceData,
          workspaceId,
          publicationRevision: revision,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        tx.set(recordRef, {
          status: 'ACTIVE',
          publishedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      return readDocumentData(recordRef);
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
  };
}
