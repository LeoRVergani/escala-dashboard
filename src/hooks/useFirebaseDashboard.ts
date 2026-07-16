import { useCallback, useEffect, useState } from 'react';
import { firebaseConfig } from '../lib/firebase';
import { observeDashboardUser } from '../lib/authRepository';
import { loadManagedTeams } from '../lib/teamsRepository';
import type { AuthenticatedDashboardUser, Team } from '../types';

export function useFirebaseDashboard() {
  const [user, setUser] = useState<AuthenticatedDashboardUser | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(firebaseConfig()));

  const reloadTeams = useCallback(async (current: AuthenticatedDashboardUser) => {
    const loaded = await loadManagedTeams(current);
    setTeams(loaded);
    setSelectedTeamId((selected) => loaded.some((team) => team.id === selected) ? selected : current.link.primaryTeamId && loaded.some((team) => team.id === current.link.primaryTeamId) ? current.link.primaryTeamId : loaded[0]?.id ?? '');
  }, []);

  useEffect(() => observeDashboardUser(async (current) => {
    setUser(current); setError(null);
    if (current) {
      try { await reloadTeams(current); } catch (reason) { setError((reason as Error).message); setTeams([]); }
    } else { setTeams([]); setSelectedTeamId(''); }
    setLoading(false);
  }, (message) => { setError(message); setLoading(false); }), [reloadTeams]);

  return { configured: Boolean(firebaseConfig()), user, teams, selectedTeamId, setSelectedTeamId, selectedTeam: teams.find((team) => team.id === selectedTeamId) ?? null, loading, error, setError, reloadTeams };
}
