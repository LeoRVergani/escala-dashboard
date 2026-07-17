import { TEST_DRIVE_STORAGE_KEY } from '../constants';
import type { ScheduleState } from '../types';

export interface TestDriveSession {
  savedAt: string;
  state: ScheduleState;
}

export function saveTestDriveSession(state: ScheduleState): TestDriveSession | null {
  try {
    const session: TestDriveSession = { savedAt: new Date().toISOString(), state };
    localStorage.setItem(TEST_DRIVE_STORAGE_KEY, JSON.stringify(session));
    return session;
  } catch {
    return null;
  }
}

export function loadTestDriveSession(): TestDriveSession | null {
  try {
    const raw = localStorage.getItem(TEST_DRIVE_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as TestDriveSession;
    if (!session?.state?.monthKey || !Array.isArray(session.state.technicians)) return null;
    return session;
  } catch {
    return null;
  }
}

export function endTestDrive(): void {
  try {
    localStorage.removeItem(TEST_DRIVE_STORAGE_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}
