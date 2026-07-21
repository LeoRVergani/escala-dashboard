import { useCallback, useMemo, useState } from 'react';
import {
  loadLocalIdentity,
  newLocalTeamId,
  saveLocalIdentity,
  type LocalIdentity,
  type LocalTeam,
  type LocalTeamType,
} from '../lib/localIdentity';

export function useLocalIdentity() {
  const [identity, setIdentity] = useState<LocalIdentity>(() => loadLocalIdentity());

  const persist = useCallback((next: LocalIdentity) => {
    setIdentity(next);
    saveLocalIdentity(next);
  }, []);

  const setChefeName = useCallback((name: string) => {
    persist({ ...identity, chefeName: name.trim() });
  }, [identity, persist]);

  const addTeam = useCallback((name: string, type: LocalTeamType) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const team: LocalTeam = { id: newLocalTeamId(), name: trimmed, type };
    persist({ ...identity, teams: [...identity.teams, team], activeTeamId: team.id });
  }, [identity, persist]);

  const setActiveTeam = useCallback((teamId: string | null) => {
    persist({ ...identity, activeTeamId: teamId });
  }, [identity, persist]);

  const removeTeam = useCallback((teamId: string) => {
    persist({
      ...identity,
      teams: identity.teams.filter((team) => team.id !== teamId),
      activeTeamId: identity.activeTeamId === teamId ? null : identity.activeTeamId,
    });
  }, [identity, persist]);

  const activeTeam = useMemo(
    () => identity.teams.find((team) => team.id === identity.activeTeamId) ?? null,
    [identity],
  );

  return { identity, activeTeam, setChefeName, addTeam, setActiveTeam, removeTeam };
}
