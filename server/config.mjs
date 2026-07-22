const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;
const DEFAULT_ALLOWED_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173';
const DEFAULT_MAX_JSON_BODY_BYTES = 5 * 1024 * 1024;

function parseNumber(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseAllowedOrigins(value) {
  return (value ?? DEFAULT_ALLOWED_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    // Default local bind avoids exposing this publishing API on the network by accident.
    host: env.DASHBOARD_API_HOST ?? DEFAULT_HOST,
    port: parseNumber(env.DASHBOARD_API_PORT, DEFAULT_PORT),
    allowedOrigins: parseAllowedOrigins(env.DASHBOARD_ALLOWED_ORIGINS),
    maxJsonBodyBytes: parseNumber(env.DASHBOARD_MAX_JSON_BODY_BYTES, DEFAULT_MAX_JSON_BODY_BYTES),
    firebaseProjectId: env.FIREBASE_PROJECT_ID,
    allowDemoFirestoreWrite: env.ALLOW_DEMO_FIRESTORE_WRITE === 'true',
    allowOfficialFirestoreWrite: env.ALLOW_OFFICIAL_FIRESTORE_WRITE === 'true',
    devLocalAuthEnabled: env.DASHBOARD_DEV_LOCAL_AUTH === 'true',
    devLocalAdminLogins: (env.DEV_LOCAL_ADMIN_LOGINS ?? '').split(',').map((v) => v.trim().toLocaleLowerCase('pt-BR')).filter(Boolean),
    devSessionSecret: env.DEV_SESSION_SECRET,
  };
}
