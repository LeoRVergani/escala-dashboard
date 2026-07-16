import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch, type DocumentReference, type Firestore } from 'firebase/firestore';
import { firebaseServices } from './firebase';
import { upsertMembers } from './membersRepository';
import type { PublicationPreview } from './publicationPreview';

export type PublicationMode = 'update' | 'replace';

export function publicationOperationSummary(preview: PublicationPreview, mode: PublicationMode) {
  const incoming = preview.payload.assignments.length + preview.payload.onCallAssignments.length;
  return { createsPeriod: !preview.existingPeriod, upserts: incoming, removes: mode === 'replace' ? preview.existingAssignments : 0, preservesUnrelated: mode === 'update' };
}

async function commitDeletes(db: Firestore, references: DocumentReference[]): Promise<void> {
  for (let offset = 0; offset < references.length; offset += 400) {
    const batch = writeBatch(db);
    references.slice(offset, offset + 400).forEach((reference) => batch.delete(reference));
    await batch.commit();
  }
}

async function commitDocuments<T extends { id: string }>(db: Firestore, collectionName: string, documents: T[]): Promise<void> {
  for (let offset = 0; offset < documents.length; offset += 400) {
    const batch = writeBatch(db);
    for (const document of documents.slice(offset, offset + 400)) {
      batch.set(doc(db, collectionName, document.id), { ...document, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
    }
    await batch.commit();
  }
}

export async function publishStructuredSchedule(preview: PublicationPreview, mode: PublicationMode): Promise<void> {
  if (preview.criticalErrors.length) throw new Error(preview.criticalErrors.join(' '));
  const services = firebaseServices();
  if (!services?.auth.currentUser) throw new Error('Usuário não autenticado.');
  const { payload } = preview;
  const periodCollection = payload.kind === 'ON_CALL' ? 'oncall_periods' : 'schedule_periods';
  const assignmentCollection = payload.kind === 'ON_CALL' ? 'oncall_assignments' : 'schedule_assignments';
  if (mode === 'replace' && preview.existingPeriod) {
    const existing = await getDocs(query(collection(services.db, assignmentCollection), where('teamId', '==', payload.period.teamId), where('periodId', '==', payload.period.id)));
    await commitDeletes(services.db, existing.docs.map((item) => item.ref));
  }
  await upsertMembers(services.db, payload.members);
  await commitDocuments(services.db, periodCollection, [{ ...payload.period, publishedAt: serverTimestamp() }]);
  if (payload.kind === 'ON_CALL') await commitDocuments(services.db, assignmentCollection, payload.onCallAssignments);
  else await commitDocuments(services.db, assignmentCollection, payload.assignments);
}
