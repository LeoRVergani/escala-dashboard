import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DemoPublicationPackage } from '../lib/demoWorkspace/dto';
import { sha256Hex } from '../lib/demoWorkspace/validation';
import { firebaseServices } from '../lib/firebase';
import type { OfficialCorporateLink } from '../lib/officialWorkspace/retarget';
import { OFFICIAL_WORKSPACE_ID } from '../lib/officialWorkspace/retarget';

// Espelha useDemoRemotePublication.ts, mas para o workspace oficial ici-dev. Deliberadamente
// não tem resetRemote - publicação oficial não implementa reset/exclusão nesta fase.
const API_BASE_URL = (import.meta.env.VITE_DASHBOARD_API_BASE_URL as string | undefined) || 'http://127.0.0.1:3001';
const REQUIRED_ARRAY_KEYS = [
  'teams',
  'members',
  'memberTeamMemberships',
  'teamManagerAssignments',
  'scheduleChangeRequests',
  'schedulePeriods',
  'scheduleAssignments',
  'publicationRecords',
] as const;

export type OfficialBackendStatus = 'UNKNOWN' | 'ONLINE' | 'OFFLINE';
export type OfficialRemoteBusy = 'IDLE' | 'VALIDATING' | 'PUBLISHING';

export interface OfficialRemoteError {
  code: string;
  message: string;
}

export interface OfficialFirebaseAdminStatus {
  configured: boolean;
  workspaceId: string;
  activePublicationRevision?: number;
  lastPublishedAt?: string | null;
  status: string;
  message?: string;
  allowOfficialFirestoreWrite: boolean;
}

export interface OfficialValidationResult {
  status: 'VALIDATED' | string;
  workspaceId: string;
  currentActiveRevision: number;
  nextPublicationRevision: number;
  counts: Record<string, number>;
  changes: { entityCounts?: Record<string, number> } & Record<string, unknown>;
  checksumStatus: string;
  writesPerformed?: number;
}

interface PublishSuccess {
  status: 'PUBLISHED';
  publicationRevision: number;
}

type ApiResult<T> =
  | { ok: true; body: T }
  | { ok: false; error: OfficialRemoteError; offline?: boolean };

function endpoint(path: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
}

function officialCounts(pkg: DemoPublicationPackage): Record<(typeof REQUIRED_ARRAY_KEYS)[number], number> {
  return Object.fromEntries(REQUIRED_ARRAY_KEYS.map((key) => [key, pkg[key].length])) as Record<(typeof REQUIRED_ARRAY_KEYS)[number], number>;
}

async function readApiError(response: Response): Promise<OfficialRemoteError> {
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
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

async function buildPublishBody(
  officialPackage: DemoPublicationPackage,
  corporateLink: OfficialCorporateLink,
  expectedActiveRevision: number,
  mode: 'DRY_RUN' | 'COMMIT',
) {
  const packageRaw = JSON.stringify(officialPackage);
  const sha256 = await sha256Hex(packageRaw);
  const manifestRaw = JSON.stringify({
    workspaceId: OFFICIAL_WORKSPACE_ID,
    sha256,
    counts: officialCounts(officialPackage),
    schemaVersion: 1,
  });

  return {
    workspaceId: OFFICIAL_WORKSPACE_ID,
    mode,
    expectedActiveRevision,
    idempotencyKey: `${OFFICIAL_WORKSPACE_ID}:${sha256}`,
    confirmation: mode === 'COMMIT' ? 'PUBLISH OFFICIAL ici-dev' : '',
    corporateLink,
    packageRaw,
    manifestRaw,
  };
}

export function useOfficialRemotePublication(enabled = false) {
  const [backendStatus, setBackendStatus] = useState<OfficialBackendStatus>('UNKNOWN');
  const [firebaseAdminStatus, setFirebaseAdminStatus] = useState<OfficialFirebaseAdminStatus | null>(null);
  const [validation, setValidation] = useState<OfficialValidationResult | null>(null);
  const [busy, setBusy] = useState<OfficialRemoteBusy>('IDLE');
  const [lastError, setLastError] = useState<OfficialRemoteError | null>(null);

  const refreshStatus = useCallback(async (): Promise<void> => {
    setLastError(null);
    const health = await requestJson<{ status: string }>('/api/health');
    if (!health.ok) {
      setBackendStatus('OFFLINE');
      setFirebaseAdminStatus(null);
      setLastError(health.error);
      return;
    }

    setBackendStatus('ONLINE');
    const status = await requestJson<OfficialFirebaseAdminStatus>('/api/official/status');
    if (!status.ok) {
      setLastError(status.error);
      return;
    }
    setFirebaseAdminStatus(status.body);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refreshStatus();
  }, [enabled, refreshStatus]);

  const validate = useCallback(async (
    officialPackage: DemoPublicationPackage,
    corporateLink: OfficialCorporateLink,
  ): Promise<OfficialValidationResult | null> => {
    setBusy('VALIDATING');
    setLastError(null);
    try {
      const body = await buildPublishBody(
        officialPackage,
        corporateLink,
        firebaseAdminStatus?.activePublicationRevision ?? 0,
        'DRY_RUN',
      );
      const result = await requestJson<OfficialValidationResult>('/api/publish/official', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!result.ok) {
        setLastError(result.error);
        return null;
      }
      setValidation(result.body);
      return result.body.status === 'VALIDATED' ? result.body : null;
    } catch {
      setLastError({ code: 'API_UNAVAILABLE', message: 'Backend indisponível.' });
      return null;
    } finally {
      setBusy('IDLE');
    }
  }, [firebaseAdminStatus?.activePublicationRevision]);

  const publish = useCallback(async (
    officialPackage: DemoPublicationPackage,
    corporateLink: OfficialCorporateLink,
  ): Promise<{ ok: true; publicationRevision: number } | { ok: false }> => {
    setBusy('PUBLISHING');
    setLastError(null);
    try {
      const body = await buildPublishBody(
        officialPackage,
        corporateLink,
        firebaseAdminStatus?.activePublicationRevision ?? 0,
        'COMMIT',
      );
      const result = await requestJson<PublishSuccess>('/api/publish/official', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!result.ok) {
        setLastError(result.error);
        return { ok: false };
      }
      await refreshStatus();
      return { ok: true, publicationRevision: result.body.publicationRevision };
    } catch {
      setLastError({ code: 'API_UNAVAILABLE', message: 'Backend indisponível.' });
      return { ok: false };
    } finally {
      setBusy('IDLE');
    }
  }, [firebaseAdminStatus?.activePublicationRevision, refreshStatus]);

  return useMemo(() => ({
    backendStatus,
    firebaseAdminStatus,
    validation,
    busy,
    lastError,
    refreshStatus,
    validate,
    publish,
  }), [backendStatus, firebaseAdminStatus, validation, busy, lastError, refreshStatus, validate, publish]);
}
