import { createFirestorePublicationStore } from './firestorePublicationStore.mjs';

export function resolvePublicationStore({ getFirebaseAdmin, config, store }) {
  if (store) {
    return { configured: true, store };
  }

  const firebaseAdmin = getFirebaseAdmin(config);
  if (!firebaseAdmin.configured) {
    return { configured: false, store: null };
  }

  return { configured: true, store: createFirestorePublicationStore(firebaseAdmin.db) };
}
