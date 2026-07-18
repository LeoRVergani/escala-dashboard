import admin from 'firebase-admin';

let cachedAdmin;

export function getFirebaseAdmin(config) {
  if (cachedAdmin) {
    return cachedAdmin;
  }

  if (!config.firebaseProjectId) {
    cachedAdmin = { configured: false, db: null };
    return cachedAdmin;
  }

  try {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      admin.initializeApp({ projectId: config.firebaseProjectId });
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: config.firebaseProjectId,
      });
    }

    cachedAdmin = { configured: true, db: admin.firestore() };
    return cachedAdmin;
  } catch (err) {
    console.error('Firebase Admin não pôde ser inicializado', err?.message);
    cachedAdmin = { configured: false, db: null };
    return cachedAdmin;
  }
}
