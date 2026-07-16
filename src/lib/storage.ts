import { DRAFT_STORAGE_KEY } from '../constants';
import type { ScheduleState } from '../types';

export interface Draft {
  savedAt: string;
  state: ScheduleState;
}

export function saveDraft(state: ScheduleState): Draft | null {
  try {
    const draft: Draft = { savedAt: new Date().toISOString(), state };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return draft;
  } catch {
    return null;
  }
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (!draft?.state?.monthKey || !Array.isArray(draft.state.technicians)) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}
