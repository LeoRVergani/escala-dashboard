import crypto from 'node:crypto';
import { docIdForLogin, normalizeLogin } from '../infra/callerIdentity.mjs';

export const PUSH_SUBSCRIPTIONS_COLLECTION = 'push_subscriptions';

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

export function canonicalToken(token) {
  if (typeof token === 'string') return token.trim();
  return JSON.stringify(stableValue(token));
}

export function shortHash(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').slice(0, 12);
}

export function tokenFingerprint(token) {
  return shortHash(canonicalToken(token));
}

export function endpointFingerprint(endpoint) {
  return typeof endpoint === 'string' && endpoint.trim() !== '' ? shortHash(endpoint.trim()) : undefined;
}

export function pushSubscriptionId({ memberId, platform, token }) {
  return `${docIdForLogin(memberId)}_${platform}_${tokenFingerprint(token)}`;
}

export function publicPushSubscriptionRecord(id, data) {
  return {
    id,
    memberId: normalizeLogin(data.memberId),
    uid: typeof data.uid === 'string' ? data.uid : undefined,
    platform: data.platform,
    active: data.active === true,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    tokenFingerprint: data.tokenFingerprint ?? tokenFingerprint(data.token),
    endpointFingerprint: data.endpointFingerprint ?? endpointFingerprint(data.endpoint),
  };
}
