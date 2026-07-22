import { OAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { firebaseServices } from './firebase';
import type { AuthenticatedDashboardUser, UserLink } from '../types';

export const normalizeLogin = (value: string) => value.trim().toLocaleLowerCase('pt-BR');

export async function signInWithMicrosoft(): Promise<void> {
  const services = firebaseServices();
  if (!services) throw new Error('Firebase não configurado. Preencha as variáveis VITE_FIREBASE_* antes de autenticar.');
  const provider = new OAuthProvider('microsoft.com');
  const tenant = import.meta.env.VITE_MICROSOFT_TENANT_ID as string | undefined;
  if (tenant) provider.setCustomParameters({ tenant });
  await signInWithPopup(services.auth, provider);
}

export async function signOutDashboard(): Promise<void> {
  const services = firebaseServices();
  if (services) await signOut(services.auth);
}

async function resolveDashboardUser(user: User): Promise<AuthenticatedDashboardUser | null> {
  const services = firebaseServices();
  if (!services) return null;
  const linkSnapshot = await getDoc(doc(services.db, 'user_links', user.uid));
  if (!linkSnapshot.exists()) throw new Error('Seu login ainda não está vinculado ao dashboard.');
  const raw = linkSnapshot.data() as Partial<UserLink>;
  const login = normalizeLogin(raw.login ?? '');
  if (!raw.active || !login) throw new Error('Seu login ainda não está vinculado ao dashboard.');
  const adminSnapshot = await getDoc(doc(services.db, 'system_admins', user.uid));
  const role = raw.role === 'SCHEDULE_ADMIN' ? 'SCHEDULE_ADMIN' : 'USER';
  const teamIds = Array.isArray(raw.teamIds) ? raw.teamIds.filter((teamId): teamId is string => typeof teamId === 'string') : [];
  return {
    uid: user.uid,
    displayName: user.displayName ?? undefined,
    login,
    role,
    teamIds,
    isSystemAdmin: adminSnapshot.exists() && adminSnapshot.data().active === true,
    link: { ...raw, firebaseUid: user.uid, login, active: true, role, teamIds } as UserLink,
  };
}

export function observeDashboardUser(
  onValue: (user: AuthenticatedDashboardUser | null) => void,
  onError: (message: string) => void,
): () => void {
  const services = firebaseServices();
  if (!services) { onValue(null); return () => undefined; }
  return onAuthStateChanged(services.auth, async (user) => {
    if (!user) { onValue(null); return; }
    try { onValue(await resolveDashboardUser(user)); }
    catch (error) { onValue(null); onError((error as Error).message); }
  });
}
