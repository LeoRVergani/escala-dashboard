import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEMO_WORKSPACE_STORAGE_KEY, TEST_DRIVE_STORAGE_KEY } from '../src/constants';
import { useDemoWorkspace } from '../src/hooks/useDemoWorkspace';

async function loadHook(result: { current: ReturnType<typeof useDemoWorkspace> }) {
  let loaded = false;
  await act(async () => {
    loaded = await result.current.load();
  });
  expect(loaded).toBe(true);
}

describe('useDemoWorkspace', () => {
  it('load() sem rascunho persistido monta baseline=draft, dirty false, localDraftRevision 1', async () => {
    const { result } = renderHook(() => useDemoWorkspace());

    await loadHook(result);

    expect(result.current.state).not.toBeNull();
    expect(result.current.state?.baselinePackage).toEqual(result.current.state?.draftPackage);
    expect(result.current.state?.dirty).toBe(false);
    expect(result.current.state?.localDraftRevision).toBe(1);
  });

  it('updateDraft marca dirty true e persiste na chave nova', async () => {
    const { result } = renderHook(() => useDemoWorkspace());
    await loadHook(result);

    act(() => {
      result.current.updateDraft((draft) => ({
        ...draft,
        teams: draft.teams.map((team, index) => index === 0 ? { ...team, name: 'Time alterado localmente' } : team),
      }));
    });

    const persistedRaw = localStorage.getItem(DEMO_WORKSPACE_STORAGE_KEY);
    expect(result.current.state?.dirty).toBe(true);
    expect(persistedRaw).not.toBeNull();
    expect(JSON.parse(persistedRaw ?? '{}')).toMatchObject({
      localDraftRevision: 1,
      dirty: true,
      draftPackage: { teams: expect.arrayContaining([expect.objectContaining({ name: 'Time alterado localmente' })]) },
    });
  });

  it('saveLocalRevision incrementa localDraftRevision e mantém dirty como estava', async () => {
    const { result } = renderHook(() => useDemoWorkspace());
    await loadHook(result);

    act(() => {
      result.current.updateDraft((draft) => ({
        ...draft,
        teams: draft.teams.map((team, index) => index === 0 ? { ...team, name: 'Time com dirty' } : team),
      }));
    });
    act(() => {
      result.current.saveLocalRevision();
    });

    expect(result.current.state?.localDraftRevision).toBe(2);
    expect(result.current.state?.dirty).toBe(true);
  });

  it('restore volta ao baseline, revision 1, dirty false e remove localStorage', async () => {
    const { result } = renderHook(() => useDemoWorkspace());
    await loadHook(result);
    const baselinePackage = result.current.state?.baselinePackage;

    act(() => {
      result.current.updateDraft((draft) => ({
        ...draft,
        teams: draft.teams.map((team, index) => index === 0 ? { ...team, name: 'Time alterado localmente' } : team),
      }));
    });
    expect(result.current.state?.draftPackage).not.toEqual(baselinePackage);

    act(() => {
      result.current.saveLocalRevision();
      result.current.restore();
    });

    expect(result.current.state?.draftPackage).toEqual(baselinePackage);
    expect(result.current.state?.localDraftRevision).toBe(1);
    expect(result.current.state?.dirty).toBe(false);
    expect(localStorage.getItem(DEMO_WORKSPACE_STORAGE_KEY)).toBeNull();
  });

  it('restore chamado duas vezes seguidas é idempotente', async () => {
    const { result } = renderHook(() => useDemoWorkspace());
    await loadHook(result);

    expect(() => {
      act(() => {
        result.current.restore();
        result.current.restore();
      });
    }).not.toThrow();
    expect(result.current.state?.dirty).toBe(false);
  });

  it('load({ resumePersisted: true }) recupera draft editado em nova instância', async () => {
    const first = renderHook(() => useDemoWorkspace());
    await loadHook(first.result);

    act(() => {
      first.result.current.updateDraft((draft) => ({
        ...draft,
        teams: draft.teams.map((team, index) => index === 0 ? { ...team, name: 'Time recuperado' } : team),
      }));
    });
    first.unmount();

    const second = renderHook(() => useDemoWorkspace());
    let loaded = false;
    await act(async () => {
      loaded = await second.result.current.load({ resumePersisted: true });
    });

    expect(loaded).toBe(true);
    expect(second.result.current.state?.draftPackage.teams[0].name).toBe('Time recuperado');
    expect(second.result.current.state?.baselinePackage.teams[0].name).not.toBe('Time recuperado');
    expect(second.result.current.state?.dirty).toBe(true);
  });

  it('usa chave diferente da sessão de Test Drive', async () => {
    const { result } = renderHook(() => useDemoWorkspace());
    await loadHook(result);

    act(() => {
      result.current.updateDraft((draft) => ({
        ...draft,
        teams: draft.teams.map((team, index) => index === 0 ? { ...team, name: 'Chave isolada' } : team),
      }));
    });

    expect(DEMO_WORKSPACE_STORAGE_KEY).not.toBe(TEST_DRIVE_STORAGE_KEY);
    expect(localStorage.getItem(DEMO_WORKSPACE_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(TEST_DRIVE_STORAGE_KEY)).toBeNull();
  });
});
