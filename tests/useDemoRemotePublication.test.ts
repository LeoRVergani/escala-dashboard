import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDemoRemotePublication, type DemoValidationResult } from '../src/hooks/useDemoRemotePublication';
import type { DemoPublicationPackage } from '../src/lib/demoWorkspace/dto';
import fixturePackage from '../fixtures/demo/demo-v1-publication-package.json';

const pkg = fixturePackage as DemoPublicationPackage;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fetchMock() {
  return global.fetch as ReturnType<typeof vi.fn>;
}

function expectJsonBody(callIndex: number) {
  const init = fetchMock().mock.calls[callIndex][1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('useDemoRemotePublication', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('refreshStatus marca backend online e guarda status do Firebase Admin', async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({
        configured: true,
        workspaceId: 'demo-v1',
        activePublicationRevision: 3,
        lastPublishedAt: '2026-07-19T12:00:00.000Z',
        status: 'ACTIVE',
      }));
    const { result } = renderHook(() => useDemoRemotePublication());

    await act(async () => {
      await result.current.refreshStatus();
    });

    expect(result.current.backendStatus).toBe('ONLINE');
    expect(result.current.firebaseAdminStatus?.activePublicationRevision).toBe(3);
  });

  it('refreshStatus trata backend offline como API_UNAVAILABLE', async () => {
    fetchMock().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const { result } = renderHook(() => useDemoRemotePublication());

    await act(async () => {
      await result.current.refreshStatus();
    });

    expect(result.current.backendStatus).toBe('OFFLINE');
    expect(result.current.lastError).toEqual({ code: 'API_UNAVAILABLE', message: 'Backend indisponível.' });
  });

  it('validate envia DRY_RUN com manifesto e guarda sucesso', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({
      status: 'VALIDATED',
      workspaceId: 'demo-v1',
      currentActiveRevision: 0,
      nextPublicationRevision: 1,
      counts: { teams: pkg.teams.length, total: 8 },
      changes: { entityCounts: { teams: pkg.teams.length } },
      checksumStatus: 'MATCH',
    }));
    const { result } = renderHook(() => useDemoRemotePublication());

    let ok!: DemoValidationResult | null;
    await act(async () => {
      ok = await result.current.validate(pkg, 7);
    });

    expect(ok?.status).toBe('VALIDATED');
    expect(fetchMock().mock.calls[0][0]).toBe('http://127.0.0.1:3001/api/publish');
    const body = expectJsonBody(0);
    expect(body).toMatchObject({
      workspaceId: 'demo-v1',
      mode: 'DRY_RUN',
      confirmation: '',
      expectedActiveRevision: 0,
      localDraftRevision: 7,
    });
    expect(body.idempotencyKey).toMatch(/^demo-v1:[a-f0-9]{64}:7$/);
    expect(body.packageRaw).toBe(JSON.stringify(pkg));
    expect(JSON.parse(body.manifestRaw as string)).toEqual({
      workspaceId: 'demo-v1',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      counts: {
        teams: pkg.teams.length,
        members: pkg.members.length,
        memberTeamMemberships: pkg.memberTeamMemberships.length,
        teamManagerAssignments: pkg.teamManagerAssignments.length,
        scheduleChangeRequests: pkg.scheduleChangeRequests.length,
        schedulePeriods: pkg.schedulePeriods.length,
        scheduleAssignments: pkg.scheduleAssignments.length,
        publicationRecords: pkg.publicationRecords.length,
      },
      schemaVersion: 1,
    });
  });

  it('validate guarda CHECKSUM_MISMATCH retornado pela API', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({
      error: { code: 'CHECKSUM_MISMATCH', message: 'Checksum inválido.' },
    }, 400));
    const { result } = renderHook(() => useDemoRemotePublication());

    let ok!: DemoValidationResult | null;
    await act(async () => {
      ok = await result.current.validate(pkg, 1);
    });

    expect(ok).toBeNull();
    expect(result.current.lastError).toEqual({ code: 'CHECKSUM_MISMATCH', message: 'Checksum inválido.' });
  });

  it('validate trata erro genérico de rede', async () => {
    fetchMock().mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useDemoRemotePublication());

    let ok!: DemoValidationResult | null;
    await act(async () => {
      ok = await result.current.validate(pkg, 1);
    });

    expect(ok).toBeNull();
    expect(result.current.lastError).toEqual({ code: 'API_UNAVAILABLE', message: 'Backend indisponível.' });
  });

  it('publish envia COMMIT e atualiza status em sucesso', async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({ configured: true, workspaceId: 'demo-v1', activePublicationRevision: 2, status: 'ACTIVE' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'PUBLISHED', publicationRevision: 3 }))
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({ configured: true, workspaceId: 'demo-v1', activePublicationRevision: 3, status: 'ACTIVE' }));
    const { result } = renderHook(() => useDemoRemotePublication());
    await act(async () => {
      await result.current.refreshStatus();
    });

    let published: Awaited<ReturnType<typeof result.current.publish>> = { ok: false };
    await act(async () => {
      published = await result.current.publish(pkg, 4);
    });

    expect(published).toEqual({ ok: true, publicationRevision: 3 });
    const body = expectJsonBody(2);
    expect(body).toMatchObject({
      workspaceId: 'demo-v1',
      mode: 'COMMIT',
      confirmation: 'PUBLISH DEMO demo-v1',
      expectedActiveRevision: 2,
      localDraftRevision: 4,
      packageRaw: JSON.stringify(pkg),
    });
    expect(body.idempotencyKey).toMatch(/^demo-v1:[a-f0-9]{64}:4$/);
    expect(result.current.firebaseAdminStatus?.activePublicationRevision).toBe(3);
  });

  it.each(['DEMO_WRITE_DISABLED', 'PUBLICATION_REVISION_CONFLICT'])('publish guarda erro %s', async (code) => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({ configured: true, workspaceId: 'demo-v1', activePublicationRevision: 5, status: 'ACTIVE' }))
      .mockResolvedValueOnce(jsonResponse({ error: { code, message: `${code} message` } }, code === 'PUBLICATION_REVISION_CONFLICT' ? 409 : 403));
    const { result } = renderHook(() => useDemoRemotePublication());
    await act(async () => {
      await result.current.refreshStatus();
    });

    let published: Awaited<ReturnType<typeof result.current.publish>> = { ok: true, publicationRevision: 0 };
    await act(async () => {
      published = await result.current.publish(pkg, 2);
    });

    expect(published).toEqual({ ok: false });
    expect(result.current.lastError).toEqual({ code, message: `${code} message` });
  });

  it('resetRemote envia corpo esperado e atualiza status em sucesso', async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({ configured: true, workspaceId: 'demo-v1', activePublicationRevision: 6, status: 'ACTIVE' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'RESET', publicationRevision: 7 }))
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({ configured: true, workspaceId: 'demo-v1', activePublicationRevision: 7, status: 'ACTIVE' }));
    const { result } = renderHook(() => useDemoRemotePublication());
    await act(async () => {
      await result.current.refreshStatus();
    });

    let reset: Awaited<ReturnType<typeof result.current.resetRemote>> = { ok: false };
    await act(async () => {
      reset = await result.current.resetRemote();
    });

    expect(reset).toEqual({ ok: true });
    expect(expectJsonBody(2)).toEqual({
      workspaceId: 'demo-v1',
      expectedActiveRevision: 6,
      idempotencyKey: 'reset-demo-v1:6',
      confirmation: 'RESET DEMO demo-v1',
    });
    expect(result.current.firebaseAdminStatus?.activePublicationRevision).toBe(7);
  });

  it('resetRemote guarda erro da API', async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({ configured: true, workspaceId: 'demo-v1', activePublicationRevision: 6, status: 'ACTIVE' }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'DEMO_RESET_FAILED', message: 'Falha no reset.' } }, 500));
    const { result } = renderHook(() => useDemoRemotePublication());
    await act(async () => {
      await result.current.refreshStatus();
    });

    let reset: Awaited<ReturnType<typeof result.current.resetRemote>> = { ok: true };
    await act(async () => {
      reset = await result.current.resetRemote();
    });

    expect(reset).toEqual({ ok: false });
    expect(result.current.lastError).toEqual({ code: 'DEMO_RESET_FAILED', message: 'Falha no reset.' });
  });
});
