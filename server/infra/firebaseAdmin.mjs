import { applicationDefault, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
    const app = getApps().length > 0
      ? getApp()
      : process.env.FIRESTORE_EMULATOR_HOST
        ? initializeApp({ projectId: config.firebaseProjectId })
        : initializeApp({
          credential: applicationDefault(),
          projectId: config.firebaseProjectId,
        });

    cachedAdmin = { configured: true, db: getFirestore(app) };
    return cachedAdmin;
  } catch (err) {
    console.error('Firebase Admin não pôde ser inicializado', err?.message);
    cachedAdmin = { configured: false, db: null };
    return cachedAdmin;
  }
}
