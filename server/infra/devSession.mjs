import crypto from 'node:crypto';
import { docIdForLogin, normalizeLogin } from './callerIdentity.mjs';

export const DEV_SESSION_COOKIE = 'escala_dev_session';
export const DEV_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function sameSignature(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function isDevLocalAuthRuntimeEnabled(config) {
  return config?.devLocalAuthEnabled === true && config?.nodeEnv !== 'production';
}

export function createDevSessionToken(login, secret, now = Date.now()) {
  const normalizedLogin = normalizeLogin(login);
  const payload = {
    login: normalizedLogin,
    uid: docIdForLogin(normalizedLogin),
    issuedAt: now,
    expiresAt: now + DEV_SESSION_MAX_AGE_MS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function validateDevSessionToken(token, secret, now = Date.now()) {
  if (!token || typeof token !== 'string' || !secret) return null;
  const [encodedPayload, signature, extra] = token.split('.');
  if (!encodedPayload || !signature || extra !== undefined) return null;
  if (!sameSignature(signature, sign(encodedPayload, secret))) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const login = normalizeLogin(payload.login);
    const uid = docIdForLogin(login);
    if (!login || payload.uid !== uid) return null;
    if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt)) return null;
    if (payload.issuedAt > now + 60_000 || payload.expiresAt <= now) return null;
    return { login, uid, issuedAt: payload.issuedAt, expiresAt: payload.expiresAt };
  } catch {
    return null;
  }
}

export function parseCookieHeader(header) {
  if (typeof header !== 'string' || header.trim() === '') return {};
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const rawValue = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }
  return cookies;
}

export function devSessionFromRequest(req, config) {
  if (!isDevLocalAuthRuntimeEnabled(config)) return null;
  const rawCookie = req.get?.('cookie') ?? req.headers?.cookie;
  const token = parseCookieHeader(rawCookie)[DEV_SESSION_COOKIE];
  return validateDevSessionToken(token, config.devSessionSecret);
}
