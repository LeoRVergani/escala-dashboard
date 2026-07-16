import { doc, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore';
import type { MemberDocument } from './persistence';

export async function upsertMembers(db: Firestore, members: MemberDocument[]): Promise<void> {
  for (let offset = 0; offset < members.length; offset += 400) {
    const batch = writeBatch(db);
    for (const member of members.slice(offset, offset + 400)) batch.set(doc(db, 'members', member.id), { ...member, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
    await batch.commit();
  }
}
