import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DemoPublicationPackage } from '../lib/demoWorkspace/dto';
import { sha256Hex } from '../lib/demoWorkspace/validation';

const DEMO_WORKSPACE_ID = 'demo-v1';
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

export type DemoBackendStatus = 'UNKNOWN' | 'ONLINE' | 'OFFLINE';
export type DemoRemoteBusy = 'IDLE' | 'VALIDATING' | 'PUBLISHING' | 'RESETTING';

export interface DemoRemoteError {
  code: string;
  message: string;
}

export interface DemoFirebaseAdminStatus {
  configured: boolean;
  workspaceId: string;
  activePublicationRevision?: number;
  lastPublishedAt?: string | null;
  status: string;
  message?: string;
}

export interface DemoValidationResult {
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
  | { ok: false; error: DemoRemoteError; offline?: boolean };

function endpoint(path: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
}

function demoCounts(pkg: DemoPublicationPackage): Record<(typeof REQUIRED_ARRAY_KEYS)[number], number> {
  return Object.fromEntries(REQUIRED_ARRAY_KEYS.map((key) => [key, pkg[key].length])) as Record<(typeof REQUIRED_ARRAY_KEYS)[number], number>;
}

async function readApiError(response: Response): Promise<DemoRemoteError> {
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
    const response = await fetch(endpoint(path), init);
    if (!response.ok) {
      return { ok: false, error: await readApiError(response) };
    }
    return { ok: true, body: await response.json() as T };
  } catch {
    return { ok: false, offline: true, error: { code: 'API_UNAVAILABLE', message: 'Backend indisponível.' } };
  }
}

async function buildPublishBody(
  draftPackage: DemoPublicationPackage,
  localDraftRevision: number,
  expectedActiveRevision: number,
  mode: 'DRY_RUN' | 'COMMIT',
) {
  const packageRaw = JSON.stringify(draftPackage);
  const sha256 = await sha256Hex(packageRaw);
  const manifestRaw = JSON.stringify({
    workspaceId: DEMO_WORKSPACE_ID,
    sha256,
    counts: demoCounts(draftPackage),
    schemaVersion: 1,
  });

  return {
    workspaceId: DEMO_WORKSPACE_ID,
    mode,
    expectedActiveRevision,
    localDraftRevision,
    idempotencyKey: `${DEMO_WORKSPACE_ID}:${sha256}:${localDraftRevision}`,
    confirmation: mode === 'COMMIT' ? 'PUBLISH DEMO demo-v1' : '',
    packageRaw,
    manifestRaw,
  };
}

export function useDemoRemotePublication(enabled = false) {
  const [backendStatus, setBackendStatus] = useState<DemoBackendStatus>('UNKNOWN');
  const [firebaseAdminStatus, setFirebaseAdminStatus] = useState<DemoFirebaseAdminStatus | null>(null);
  const [validation, setValidation] = useState<DemoValidationResult | null>(null);
  const [busy, setBusy] = useState<DemoRemoteBusy>('IDLE');
  const [lastError, setLastError] = useState<DemoRemoteError | null>(null);

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
    const status = await requestJson<DemoFirebaseAdminStatus>('/api/demo/status');
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
    draftPackage: DemoPublicationPackage,
    localDraftRevision: number,
  ): Promise<DemoValidationResult | null> => {
    setBusy('VALIDATING');
    setLastError(null);
    try {
      const body = await buildPublishBody(
        draftPackage,
        localDraftRevision,
        firebaseAdminStatus?.activePublicationRevision ?? 0,
        'DRY_RUN',
      );
      const result = await requestJson<DemoValidationResult>('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!result.ok) {
        setLastError(result.error);
        return null;
      }
      setValidation(result.body);
      // O chamador (ex.: abrir o modal de publicação) precisa do objeto recém-validado, não
      // do estado `validation` do hook - ler `validation` logo após este `await` arriscaria
      // pegar o valor de um render anterior, reabrindo a mesma janela de staleness que este
      // retorno existe para fechar.
      return result.body.status === 'VALIDATED' ? result.body : null;
    } catch {
      setLastError({ code: 'API_UNAVAILABLE', message: 'Backend indisponível.' });
      return null;
    } finally {
      setBusy('IDLE');
    }
  }, [firebaseAdminStatus?.activePublicationRevision]);

  const publish = useCallback(async (
    draftPackage: DemoPublicationPackage,
    localDraftRevision: number,
  ): Promise<{ ok: true; publicationRevision: number } | { ok: false }> => {
    setBusy('PUBLISHING');
    setLastError(null);
    try {
      const body = await buildPublishBody(
        draftPackage,
        localDraftRevision,
        firebaseAdminStatus?.activePublicationRevision ?? 0,
        'COMMIT',
      );
      const result = await requestJson<PublishSuccess>('/api/publish', {
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

  const resetRemote = useCallback(async (): Promise<{ ok: true } | { ok: false }> => {
    setBusy('RESETTING');
    setLastError(null);
    const activeRevision = firebaseAdminStatus?.activePublicationRevision ?? 0;
    try {
      const result = await requestJson<{ status: 'RESET' }>('/api/demo/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: DEMO_WORKSPACE_ID,
          expectedActiveRevision: activeRevision,
          idempotencyKey: `reset-demo-v1:${activeRevision}`,
          confirmation: 'RESET DEMO demo-v1',
        }),
      });
      if (!result.ok) {
        setLastError(result.error);
        return { ok: false };
      }
      await refreshStatus();
      return { ok: true };
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
    resetRemote,
  }), [backendStatus, firebaseAdminStatus, validation, busy, lastError, refreshStatus, validate, publish, resetRemote]);
}
