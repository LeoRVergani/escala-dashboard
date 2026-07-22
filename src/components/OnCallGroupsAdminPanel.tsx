import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { canManageTeamWithRole } from '../lib/teamsRepository';
import { saveOnCallGroup } from '../lib/onCallGroupsRepository';
import type { AuthenticatedDashboardUser, OnCallGroup, Team } from '../types';

interface Props {
  user: AuthenticatedDashboardUser | null;
  teams: Team[];
  groups: OnCallGroup[];
  devSessionActive?: boolean;
  onReload: () => Promise<void> | void;
}

interface FormState {
  teamId: string;
  name: string;
}

export function OnCallGroupsAdminPanel({ user, teams, groups, devSessionActive = false, onReload }: Props) {
  const manageableTeams = useMemo(
    () => teams
      .filter((team) => team.scheduleKind === 'ON_CALL')
      .filter((team) => devSessionActive || canManageTeamWithRole(user, team.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [devSessionActive, teams, user],
  );
  const [form, setForm] = useState<FormState>({ teamId: manageableTeams[0]?.id ?? '', name: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams]);

  const canMutate = Boolean(user) && !devSessionActive;

  useEffect(() => {
    setForm((current) => (
      current.teamId && manageableTeams.some((team) => team.id === current.teamId)
        ? current
        : { ...current, teamId: manageableTeams[0]?.id ?? '' }
    ));
  }, [manageableTeams]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await saveOnCallGroup(user, { teamId: form.teamId, name: form.name, active: true });
      setForm((current) => ({ ...current, name: '' }));
      await onReload();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (group: OnCallGroup) => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await saveOnCallGroup(user, { ...group, active: !group.active });
      await onReload();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="official-wizard-panel admin-users-list" aria-label="Grupos de plantão">
      <div className="admin-users-list-head">
        <h3>Grupos de plantão</h3>
        <button type="button" className="btn" onClick={() => void onReload()} disabled={saving}>
          Atualizar
        </button>
      </div>
      {error && <p className="admin-users-error" role="alert">{error}</p>}

      <div className="admin-users-table-wrap">
        <table className="admin-users-table">
          <thead>
            <tr>
              <th>Equipe</th>
              <th>Grupo</th>
              <th>Ativo</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {groups
              .filter((group) => manageableTeams.some((team) => team.id === group.teamId))
              .map((group) => (
                <tr key={group.id}>
                  <td>{teamById.get(group.teamId) ?? group.teamId}</td>
                  <td>{group.name}</td>
                  <td>{group.active ? 'Sim' : 'Não'}</td>
                  <td>
                    <button type="button" className="btn" onClick={() => void toggle(group)} disabled={saving || !canMutate}>
                      {group.active ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            {groups.filter((group) => manageableTeams.some((team) => team.id === group.teamId)).length === 0 && (
              <tr><td colSpan={4}>Nenhum grupo cadastrado para os times administrados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <form className="admin-users-form" onSubmit={submit} aria-label="Cadastrar grupo de plantão">
        <h4>Novo grupo</h4>
        <label>
          Equipe
          <select
            value={form.teamId}
            onChange={(event) => setForm((current) => ({ ...current, teamId: event.target.value }))}
            required
          >
            <option value="" disabled>Selecione</option>
            {manageableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <label>
          Nome
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={saving || !canMutate || !manageableTeams.length}>
          {saving ? 'Salvando…' : 'Cadastrar grupo'}
        </button>
        {devSessionActive && <p className="diagnostics-empty">Sessão local mostra fixtures; mutações exigem Firebase autenticado.</p>}
      </form>
    </section>
  );
}
