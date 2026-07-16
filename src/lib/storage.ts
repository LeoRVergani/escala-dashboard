import { DRAFT_STORAGE_KEY } from '../constants';
import type { ScheduleState } from '../types';
import { scheduleDates } from './dates';

export interface Draft {
  savedAt: string;
  state: ScheduleState;
}

export function draftStorageKey(state?: ScheduleState | null, teamId?: string): string {
  if (!state || !teamId) return DRAFT_STORAGE_KEY;
  const dates = scheduleDates(state);
  return `${DRAFT_STORAGE_KEY}:${teamId}:${dates[0] ?? 'sem-inicio'}:${dates[dates.length - 1] ?? 'sem-fim'}`;
}

export function saveDraft(state: ScheduleState, teamId?: string): Draft | null {
  try {
    const draft: Draft = { savedAt: new Date().toISOString(), state };
    localStorage.setItem(draftStorageKey(state, teamId), JSON.stringify(draft));
    return draft;
  } catch {
    return null;
  }
}

export function loadDraft(state?: ScheduleState | null, teamId?: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(state, teamId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (!draft?.state?.monthKey || !Array.isArray(draft.state.technicians)) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearDraft(state?: ScheduleState | null, teamId?: string): void {
  try {
    localStorage.removeItem(draftStorageKey(state, teamId));
  } catch {
    /* armazenamento indisponível */
  }
}
