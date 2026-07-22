import { firebaseServices } from '../firebase';

const API_BASE_URL = (import.meta.env.VITE_DASHBOARD_API_BASE_URL as string | undefined) || 'http://127.0.0.1:3001';

export interface OfficialApiError {
  code: string;
  message: string;
}

export type OfficialApiResult<T> =
  | { ok: true; body: T }
  | { ok: false; error: OfficialApiError; offline?: boolean };

export function endpoint(path: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
}

async function readApiError(response: Response): Promise<OfficialApiError> {
  try {
    const body = await response.json() as { error?: { code?: string; message?: string } };
    return {
      code: body.error?.code || `HTTP_${response.status}`,
      message: body.error?.message || 'Não foi possível concluir a operação.',
    };
  } catch {
    return { code: `HTTP_${response.status}`, message: 'Não foi possível concluir a operação.' };
  }
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<OfficialApiResult<T>> {
  try {
    const headers = new Headers(init?.headers);
    const idToken = await firebaseServices()?.auth.currentUser?.getIdToken();
    if (idToken) {
      headers.set('Authorization', `Bearer ${idToken}`);
    }
    const response = await fetch(endpoint(path), { ...init, credentials: 'include', headers });
    if (!response.ok) {
      return { ok: false, error: await readApiError(response) };
    }
    return { ok: true, body: await response.json() as T };
  } catch {
    return { ok: false, offline: true, error: { code: 'API_UNAVAILABLE', message: 'Backend indisponível.' } };
  }
}
