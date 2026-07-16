import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { firebaseServices } from './firebase';
import type { AuthenticatedDashboardUser, ShiftSwapRequest, Team } from '../types';
import { canManageTeam } from './teamsRepository';

export function filterRequestsForManagedTeams(user: AuthenticatedDashboardUser, teams: Team[], requests: ShiftSwapRequest[]): ShiftSwapRequest[] {
  const ids = new Set(teams.filter((team) => canManageTeam(user, team)).map((team) => team.id));
  return requests.filter((request) => ids.has(request.teamId));
}

export async function loadSwapRequests(user: AuthenticatedDashboardUser, teams: Team[]): Promise<ShiftSwapRequest[]> {
  const services = firebaseServices();
  if (!services) return [];
  const allowedIds = teams.filter((team) => canManageTeam(user, team)).map((team) => team.id);
  const result: ShiftSwapRequest[] = [];
  for (let offset = 0; offset < allowedIds.length; offset += 10) {
    const ids = allowedIds.slice(offset, offset + 10);
    if (!ids.length) continue;
    const snapshot = await getDocs(query(collection(services.db, 'shift_swap_requests'), where('teamId', 'in', ids), where('status', '==', 'PENDING')));
    result.push(...snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ShiftSwapRequest)));
  }
  return result.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function decideSwapRequest(user: AuthenticatedDashboardUser, teams: Team[], request: ShiftSwapRequest, decision: 'APPROVED' | 'REJECTED', decisionNote = ''): Promise<void> {
  if (!teams.some((team) => team.id === request.teamId && canManageTeam(user, team))) throw new Error('Solicitação pertence a um time não autorizado.');
  const services = firebaseServices();
  if (!services) throw new Error('Firebase não configurado.');
  await updateDoc(doc(services.db, 'shift_swap_requests', request.id), { status: decision, decidedAt: serverTimestamp(), decidedByLogin: user.login, decisionNote, automaticAssignmentChange: false });
}
