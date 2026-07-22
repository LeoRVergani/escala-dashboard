import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DemoPublicationPackage } from '../lib/demoWorkspace/dto';
import { sha256Hex } from '../lib/demoWorkspace/validation';
import type { OfficialCorporateLink } from '../lib/officialWorkspace/retarget';
import { OFFICIAL_WORKSPACE_ID } from '../lib/officialWorkspace/retarget';
import { requestJson, type OfficialApiError } from '../lib/officialWorkspace/apiClient';

// Espelha useDemoRemotePublication.ts, mas para o workspace oficial ici-dev. Deliberadamente
// não tem resetRemote - publicação oficial não implementa reset/exclusão nesta fase.
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

export type OfficialRemoteError = OfficialApiError;

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

function officialCounts(pkg: DemoPublicationPackage): Record<(typeof REQUIRED_ARRAY_KEYS)[number], number> {
  return Object.fromEntries(REQUIRED_ARRAY_KEYS.map((key) => [key, pkg[key].length])) as Record<(typeof REQUIRED_ARRAY_KEYS)[number], number>;
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

export function useOfficialRemotePublication(enabled = false, expectedActiveRevisionOverride: number | null = null) {
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
        expectedActiveRevisionOverride ?? firebaseAdminStatus?.activePublicationRevision ?? 0,
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
  }, [expectedActiveRevisionOverride, firebaseAdminStatus?.activePublicationRevision]);

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
        expectedActiveRevisionOverride ?? firebaseAdminStatus?.activePublicationRevision ?? 0,
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
  }, [expectedActiveRevisionOverride, firebaseAdminStatus?.activePublicationRevision, refreshStatus]);

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
