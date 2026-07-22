import { PublicationError } from '../errors.mjs';
import { normalizeLogin } from '../infra/callerIdentity.mjs';
import { requireTeamAuthorization } from '../infra/verifyCaller.mjs';
import { PUSH_SUBSCRIPTIONS_COLLECTION } from './pushSubscriptionModel.mjs';

async function collectionDocs(db, collectionName) {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() ?? {} }));
}

function activeSubscription(doc) {
  return doc.data.active === true;
}

function normalizedRecipient(id, data) {
  return {
    id,
    memberId: normalizeLogin(data.memberId),
    uid: typeof data.uid === 'string' ? data.uid : undefined,
    platform: data.platform,
    token: data.token,
    endpoint: typeof data.endpoint === 'string' ? data.endpoint : undefined,
  };
}

async function activeMemberKeysForTeam(db, teamId) {
  const docs = await collectionDocs(db, 'user_links');
  const keys = new Set();

  for (const doc of docs) {
    const data = doc.data;
    if (data.active !== true || !Array.isArray(data.teamIds) || !data.teamIds.includes(teamId)) continue;
    keys.add(doc.id);
    if (typeof data.firebaseUid === 'string') keys.add(data.firebaseUid);
    if (typeof data.login === 'string') keys.add(normalizeLogin(data.login));
  }

  return keys;
}

export async function resolvePushRecipients({ db, req, memberId, teamId }) {
  const hasMember = typeof memberId === 'string' && memberId.trim() !== '';
  const hasTeam = typeof teamId === 'string' && teamId.trim() !== '';
  if (hasMember === hasTeam) {
    throw new PublicationError('INVALID_PACKAGE', 'Informe exatamente memberId ou teamId para resolver destinatários push.');
  }

  if (hasTeam && !req) {
    throw new PublicationError('FORBIDDEN_TEAM', 'Contexto autenticado obrigatório para consultar assinaturas por time.');
  }

  if (hasTeam) {
    requireTeamAuthorization(req, teamId);
  }

  if (hasMember && req && !req.caller?.isSystemAdmin && normalizeLogin(memberId) !== req.caller?.login) {
    throw new PublicationError('FORBIDDEN_ROLE', 'Conta sem permissão para consultar assinaturas deste membro.');
  }

  const docs = (await collectionDocs(db, PUSH_SUBSCRIPTIONS_COLLECTION)).filter(activeSubscription);

  if (hasMember) {
    const normalizedMemberId = normalizeLogin(memberId);
    return docs
      .filter((doc) => normalizeLogin(doc.data.memberId) === normalizedMemberId || doc.data.uid === memberId)
      .map((doc) => normalizedRecipient(doc.id, doc.data));
  }

  const memberKeys = await activeMemberKeysForTeam(db, teamId);
  return docs
    .filter((doc) => memberKeys.has(normalizeLogin(doc.data.memberId)) || memberKeys.has(doc.data.uid))
    .map((doc) => normalizedRecipient(doc.id, doc.data));
}
