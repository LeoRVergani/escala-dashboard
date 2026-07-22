import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOfficialRemotePublication } from '../src/hooks/useOfficialRemotePublication';
import { buildOfficialTestPackage } from './fixtures/officialPackage';

const pkg = buildOfficialTestPackage();
const link = { memberId: pkg.members[0].id, teamId: pkg.teams[0].id };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fetchMock() {
  return global.fetch as ReturnType<typeof vi.fn>;
}

function jsonBody(callIndex: number) {
  const init = fetchMock().mock.calls[callIndex][1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('useOfficialRemotePublication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('usa a revisão-base carregada no próximo dry-run', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({
      status: 'VALIDATED',
      workspaceId: 'ici-dev',
      currentActiveRevision: 8,
      nextPublicationRevision: 9,
      counts: { teams: 1 },
      changes: { entityCounts: { teams: 1 } },
      checksumStatus: 'MATCH',
    }));
    const { result } = renderHook(() => useOfficialRemotePublication(false, 8));

    await act(async () => {
      await result.current.validate(pkg, link);
    });

    expect(jsonBody(0)).toMatchObject({
      workspaceId: 'ici-dev',
      mode: 'DRY_RUN',
      expectedActiveRevision: 8,
    });
  });

  it('usa a revisão-base carregada no COMMIT', async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse({ status: 'PUBLISHED', publicationRevision: 9 }))
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({ configured: true, workspaceId: 'ici-dev', activePublicationRevision: 9, status: 'ACTIVE', allowOfficialFirestoreWrite: true }));
    const { result } = renderHook(() => useOfficialRemotePublication(false, 8));

    await act(async () => {
      await result.current.publish(pkg, link);
    });

    expect(jsonBody(0)).toMatchObject({
      workspaceId: 'ici-dev',
      mode: 'COMMIT',
      expectedActiveRevision: 8,
    });
  });

  it('guarda PUBLICATION_REVISION_CONFLICT para a UX de recarregar', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({
      error: {
        code: 'PUBLICATION_REVISION_CONFLICT',
        message: 'Existe uma versão mais recente publicada desde que você carregou esta escala.',
      },
    }, 409));
    const { result } = renderHook(() => useOfficialRemotePublication(false, 2));

    await act(async () => {
      await result.current.validate(pkg, link);
    });

    expect(result.current.lastError).toEqual({
      code: 'PUBLICATION_REVISION_CONFLICT',
      message: 'Existe uma versão mais recente publicada desde que você carregou esta escala.',
    });
  });
});
