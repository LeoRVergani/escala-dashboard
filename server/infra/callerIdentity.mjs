import { PublicationError } from '../errors.mjs';

export function normalizeLogin(value) {
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR');
}

export function docIdForLogin(login) {
  return normalizeLogin(login).replace(/\//g, '_');
}

export function activeDocumentData(snapshot) {
  if (!snapshot?.exists) return null;
  const data = snapshot.data() ?? {};
  return data.active === true ? data : null;
}

export function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

export async function resolveCallerFromDb(db, { uid, fallbackLogin, isDevSession = false }) {
  const [linkSnapshot, adminSnapshot] = await Promise.all([
    db.collection('user_links').doc(uid).get(),
    db.collection('system_admins').doc(uid).get(),
  ]);
  const linkData = activeDocumentData(linkSnapshot);
  const systemAdminData = activeDocumentData(adminSnapshot);

  if (!linkData && !systemAdminData) {
    throw new PublicationError('UNLINKED_ACCOUNT', 'Conta autenticada mas sem vínculo ativo no dashboard.');
  }

  return {
    uid,
    login: normalizeLogin(linkData?.login ?? systemAdminData?.login ?? fallbackLogin ?? uid),
    role: linkData?.role === 'SCHEDULE_ADMIN' ? 'SCHEDULE_ADMIN' : 'USER',
    teamIds: stringList(linkData?.teamIds),
    isSystemAdmin: Boolean(systemAdminData),
    ...(isDevSession ? { isDevSession: true } : {}),
  };
}
