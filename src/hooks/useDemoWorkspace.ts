import { useCallback, useMemo, useRef, useState } from 'react';
import { DEMO_WORKSPACE_STORAGE_KEY } from '../constants';
import type { DemoPublicationPackage } from '../lib/demoWorkspace/dto';
import {
  validateDemoPublicationPackage,
  type DemoPackageValidationResult,
} from '../lib/demoWorkspace/validation';
import packageRaw from '../../fixtures/demo/demo-v1-publication-package.json?raw';
import manifestRaw from '../../fixtures/demo/demo-v1-manifest.json?raw';

type DemoPackageValidationError = Exclude<DemoPackageValidationResult, { status: 'VALID' }>;

export interface DemoWorkspaceState {
  workspaceId: string;
  scenarioId: string | null;
  seedVersion: number | null;
  sourcePublicationRevision: number;
  localDraftRevision: number;
  baselinePackage: DemoPublicationPackage;
  draftPackage: DemoPublicationPackage;
  dirty: boolean;
  loadedAt: string;
}

interface PersistedDemoWorkspaceDraft {
  savedAt: string;
  localDraftRevision: number;
  draftPackage: DemoPublicationPackage;
  dirty: boolean;
}

function clonePackage(pkg: DemoPublicationPackage): DemoPublicationPackage {
  if (typeof structuredClone === 'function') return structuredClone(pkg);
  return JSON.parse(JSON.stringify(pkg)) as DemoPublicationPackage;
}

function readPersistedDraft(): PersistedDemoWorkspaceDraft | null {
  try {
    const raw = localStorage.getItem(DEMO_WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedDemoWorkspaceDraft>;
    if (
      typeof parsed.savedAt !== 'string'
      || typeof parsed.localDraftRevision !== 'number'
      || typeof parsed.dirty !== 'boolean'
      || !parsed.draftPackage?.workspace
    ) {
      return null;
    }
    return parsed as PersistedDemoWorkspaceDraft;
  } catch {
    return null;
  }
}

function writePersistedDraft(state: DemoWorkspaceState): void {
  try {
    const persisted: PersistedDemoWorkspaceDraft = {
      savedAt: new Date().toISOString(),
      localDraftRevision: state.localDraftRevision,
      draftPackage: state.draftPackage,
      dirty: state.dirty,
    };
    localStorage.setItem(DEMO_WORKSPACE_STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    /* armazenamento indisponível */
  }
}

function clearPersistedDraft(): void {
  try {
    localStorage.removeItem(DEMO_WORKSPACE_STORAGE_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}

function stateFromPackage(
  baselinePackage: DemoPublicationPackage,
  draftPackage: DemoPublicationPackage,
  localDraftRevision: number,
  dirty: boolean,
): DemoWorkspaceState {
  return {
    workspaceId: baselinePackage.workspace.workspaceId,
    scenarioId: baselinePackage.workspace.scenarioId,
    seedVersion: baselinePackage.workspace.seedVersion,
    sourcePublicationRevision: baselinePackage.workspace.publicationRevision,
    localDraftRevision,
    baselinePackage,
    draftPackage,
    dirty,
    loadedAt: new Date().toISOString(),
  };
}

export function useDemoWorkspace() {
  const [stateValue, setStateValue] = useState<DemoWorkspaceState | null>(null);
  const stateRef = useRef<DemoWorkspaceState | null>(null);
  const [validationErrorValue, setValidationErrorValue] = useState<DemoPackageValidationError | null>(null);
  const validationErrorRef = useRef<DemoPackageValidationError | null>(null);
  const [hasPersistedDraft, setHasPersistedDraft] = useState(() => readPersistedDraft() !== null);

  const setState = useCallback((next: DemoWorkspaceState | null) => {
    stateRef.current = next;
    setStateValue(next);
  }, []);

  const setValidationError = useCallback((next: DemoPackageValidationError | null) => {
    validationErrorRef.current = next;
    setValidationErrorValue(next);
  }, []);

  const load = useCallback(async (options?: { resumePersisted?: boolean }): Promise<boolean> => {
    const validation = await validateDemoPublicationPackage(packageRaw, manifestRaw);
    if (validation.status !== 'VALID') {
      setValidationError(validation);
      return false;
    }

    setValidationError(null);
    const baselinePackage = clonePackage(validation.package);
    const sourcePublicationRevision = baselinePackage.workspace.publicationRevision;
    const persisted = options?.resumePersisted ? readPersistedDraft() : null;

    let draftPackage = clonePackage(baselinePackage);
    let localDraftRevision = 1;
    let dirty = false;
    let ignoredPersistedDraft = false;

    if (persisted) {
      if (persisted.draftPackage.workspace.publicationRevision === sourcePublicationRevision) {
        draftPackage = clonePackage(persisted.draftPackage);
        localDraftRevision = persisted.localDraftRevision;
        dirty = persisted.dirty;
      } else {
        console.info('Rascunho local do Ambiente de Demonstração ignorado: revisão da fixture mudou.');
        ignoredPersistedDraft = true;
      }
    }

    setState(stateFromPackage(baselinePackage, draftPackage, localDraftRevision, dirty));
    if (ignoredPersistedDraft) clearPersistedDraft();
    setHasPersistedDraft(readPersistedDraft() !== null);
    return true;
  }, [setState, setValidationError]);

  const updateDraft = useCallback((updater: (draft: DemoPublicationPackage) => DemoPublicationPackage): void => {
    const current = stateRef.current;
    if (!current) return;
    const next: DemoWorkspaceState = {
      ...current,
      draftPackage: updater(clonePackage(current.draftPackage)),
      dirty: true,
    };
    setState(next);
    writePersistedDraft(next);
    setHasPersistedDraft(true);
  }, [setState]);

  const saveLocalRevision = useCallback((): void => {
    const current = stateRef.current;
    if (!current) return;
    const next = { ...current, localDraftRevision: current.localDraftRevision + 1 };
    setState(next);
    writePersistedDraft(next);
    setHasPersistedDraft(true);
  }, [setState]);

  const restore = useCallback((): void => {
    const current = stateRef.current;
    if (!current) {
      clearPersistedDraft();
      setHasPersistedDraft(false);
      return;
    }
    const next = {
      ...current,
      draftPackage: clonePackage(current.baselinePackage),
      localDraftRevision: 1,
      dirty: false,
    };
    setState(next);
    clearPersistedDraft();
    setHasPersistedDraft(false);
  }, [setState]);

  const exit = useCallback((): void => {
    setState(null);
    setHasPersistedDraft(readPersistedDraft() !== null);
  }, [setState]);

  return useMemo(() => ({
    get state() {
      return stateRef.current ?? stateValue;
    },
    get validationError() {
      return validationErrorRef.current ?? validationErrorValue;
    },
    hasPersistedDraft,
    load,
    updateDraft,
    saveLocalRevision,
    restore,
    exit,
  }), [stateValue, validationErrorValue, hasPersistedDraft, load, updateDraft, saveLocalRevision, restore, exit]);
}
