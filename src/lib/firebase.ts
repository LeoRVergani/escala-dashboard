import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

export interface FirebaseServices { app: FirebaseApp; auth: Auth; db: Firestore }

export function firebaseConfig() {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined;
  if (!projectId || !apiKey || !authDomain || !appId) return null;
  return { projectId, apiKey, authDomain, appId };
}

let cached: FirebaseServices | null | undefined;
export function firebaseServices(): FirebaseServices | null {
  if (cached !== undefined) return cached;
  const config = firebaseConfig();
  if (!config) return (cached = null);
  const app = getApps().length ? getApp() : initializeApp(config);
  return (cached = { app, auth: getAuth(app), db: getFirestore(app) });
}
