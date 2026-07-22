import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { firebaseServices } from '../lib/firebase';
import type { AuthenticatedDashboardUser, Team } from '../types';

const API_BASE_URL = (import.meta.env.VITE_DASHBOARD_API_BASE_URL as string | undefined) || 'http://127.0.0.1:3001';

type AdminRole = 'SCHEDULE_ADMIN' | 'SYSTEM_ADMIN';

interface AdminUserRecord {
  id: string;
  login: string;
  role: AdminRole | 'USER';
  teamIds: string[];
  active: boolean;
  grantedBy?: string;
  grantedAt?: string;
}

interface AdminUsersPanelProps {
  user: AuthenticatedDashboardUser | null;
  teams: Team[];
}

interface AdminFormState {
  login: string;
  role: AdminRole;
  teamIds: string[];
  active: boolean;
}

const EMPTY_FORM: AdminFormState = {
  login: '',
  role: 'SCHEDULE_ADMIN',
  teamIds: [],
  active: true,
};

function endpoint(path: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
}

async function authHeaders(): Promise<Headers> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const idToken = await firebaseServices()?.auth.currentUser?.getIdToken();
  if (idToken) headers.set('Authorization', `Bearer ${idToken}`);
  return headers;
}

async function requestAdmin<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint(path), {
    ...init,
    headers: await authHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? 'Não foi possível concluir a operação administrativa.');
  }
  return response.json() as Promise<T>;
}

function formatGrantedAt(value?: string): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('pt-BR');
}

function roleLabel(role: AdminUserRecord['role'] | AdminRole): string {
  if (role === 'SYSTEM_ADMIN') return 'SYSTEM_ADMIN';
  if (role === 'SCHEDULE_ADMIN') return 'SCHEDULE_ADMIN';
  return 'USER';
}

export function AdminUsersPanel({ user, teams }: AdminUsersPanelProps) {
  const [records, setRecords] = useState<AdminUserRecord[]>([]);
  const [form, setForm] = useState<AdminFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams]);

  const loadUsers = async () => {
    if (!user?.isSystemAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const body = await requestAdmin<{ users: AdminUserRecord[] }>('/api/admin/users');
      setRecords(body.users);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, [user?.isSystemAdmin]);

  if (!user?.isSystemAdmin) {
    return (
      <section className="admin-users-panel" aria-label="Administração">
        <div className="official-wizard-head">
          <h2>Administração</h2>
          <p className="official-wizard-warning" role="alert">
            Acesso restrito a administradores do sistema.
          </p>
        </div>
      </section>
    );
  }

  const toggleTeam = (teamId: string) => {
    setForm((current) => ({
      ...current,
      teamIds: current.teamIds.includes(teamId)
        ? current.teamIds.filter((item) => item !== teamId)
        : [...current.teamIds, teamId],
    }));
  };

  const startEdit = (record: AdminUserRecord) => {
    setEditingId(record.id);
    setForm({
      login: record.login,
      role: record.role === 'SYSTEM_ADMIN' ? 'SYSTEM_ADMIN' : 'SCHEDULE_ADMIN',
      teamIds: record.teamIds,
      active: record.active,
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        login: form.login,
        role: form.role,
        teamIds: form.role === 'SCHEDULE_ADMIN' ? form.teamIds : [],
        active: form.active,
      };
      if (editingId) {
        await requestAdmin(`/api/admin/users/${encodeURIComponent(editingId)}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await requestAdmin('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      resetForm();
      await loadUsers();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-users-panel" aria-label="Administração">
      <div className="official-wizard-head">
        <h2>Administração</h2>
        <p className="official-wizard-warning" role="alert">
          Alterações nesta área afetam quem pode publicar escalas oficiais e administrar acessos.
        </p>
      </div>

      {error && <p className="admin-users-error" role="alert">{error}</p>}

      <div className="admin-users-layout">
        <section className="official-wizard-panel admin-users-list" aria-label="Usuários administrativos">
          <div className="admin-users-list-head">
            <h3>Usuários</h3>
            <button type="button" className="btn" onClick={() => void loadUsers()} disabled={loading}>
              Atualizar
            </button>
          </div>
          {loading ? (
            <p className="diagnostics-empty" role="status">Carregando usuários…</p>
          ) : (
            <div className="admin-users-table-wrap">
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>Login</th>
                    <th>Papel</th>
                    <th>Times</th>
                    <th>Ativo</th>
                    <th>Concedido por</th>
                    <th>Concedido em</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td>{record.login}</td>
                      <td>{roleLabel(record.role)}</td>
                      <td>{record.teamIds.map((teamId) => teamById.get(teamId) ?? teamId).join(', ') || '—'}</td>
                      <td>{record.active ? 'Sim' : 'Não'}</td>
                      <td>{record.grantedBy ?? '—'}</td>
                      <td>{formatGrantedAt(record.grantedAt)}</td>
                      <td>
                        <button type="button" className="btn" onClick={() => startEdit(record)}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={7}>Nenhum perfil administrativo cadastrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <form className="official-wizard-panel admin-users-form" onSubmit={submit} aria-label="Cadastro administrativo">
          <h3>{editingId ? 'Editar usuário' : 'Cadastrar usuário'}</h3>
          <label>
            Login
            <input
              value={form.login}
              onChange={(event) => setForm((current) => ({ ...current, login: event.target.value }))}
              required
            />
          </label>
          <label>
            Papel
            <select
              value={form.role}
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as AdminRole }))}
            >
              <option value="SCHEDULE_ADMIN">SCHEDULE_ADMIN</option>
              <option value="SYSTEM_ADMIN">SYSTEM_ADMIN</option>
            </select>
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
            />
            Acesso ativo
          </label>
          <fieldset className="admin-users-team-fieldset" disabled={form.role !== 'SCHEDULE_ADMIN'}>
            <legend>Times administrados</legend>
            {teams.map((team) => (
              <label key={team.id} className="settings-toggle">
                <input
                  type="checkbox"
                  checked={form.teamIds.includes(team.id)}
                  onChange={() => toggleTeam(team.id)}
                />
                {team.name}
              </label>
            ))}
            {teams.length === 0 && <p className="diagnostics-empty">Nenhum time disponível para seleção.</p>}
          </fieldset>
          <div className="official-publication-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Cadastrar'}
            </button>
            {editingId && (
              <button type="button" className="btn" onClick={resetForm}>
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
