import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersPanel } from '../src/components/AdminUsersPanel';
import type { AuthenticatedDashboardUser, Team } from '../src/types';

vi.mock('../src/lib/firebase', () => ({
  firebaseServices: () => ({ auth: { currentUser: { getIdToken: async () => 'panel-token' } } }),
}));

const teams: Team[] = [
  { id: 'team-a', code: 'A', name: 'Time A', responsibleLogin: 'owner@ici.test', scheduleKind: 'REGULAR', active: true, allowedImportLayouts: [] },
  { id: 'team-b', code: 'B', name: 'Time B', responsibleLogin: 'owner@ici.test', scheduleKind: 'REGULAR', active: true, allowedImportLayouts: [] },
];

function dashboardUser(overrides: Partial<AuthenticatedDashboardUser> = {}): AuthenticatedDashboardUser {
  return {
    uid: 'uid-user',
    login: 'user@ici.test',
    role: 'USER',
    teamIds: [],
    isSystemAdmin: false,
    link: { firebaseUid: 'uid-user', login: 'user@ici.test', active: true },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('AdminUsersPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('usuário comum vê acesso restrito e não vê formulário funcional', () => {
    render(<AdminUsersPanel user={dashboardUser()} teams={teams} />);

    expect(screen.getByText(/Acesso restrito a administradores do sistema/i)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: /Cadastro administrativo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cadastrar/i })).not.toBeInTheDocument();
  });

  it('SYSTEM_ADMIN vê lista e submete cadastro', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const method = init?.method ?? 'GET';
      const path = String(input);
      if (method === 'GET' && path.endsWith('/api/admin/users')) {
        return jsonResponse({ users: [{ id: 'admin@ici.test', login: 'admin@ici.test', role: 'SYSTEM_ADMIN', teamIds: [], active: true }] });
      }
      if (method === 'POST' && path.endsWith('/api/admin/users')) {
        return jsonResponse({ id: 'new@ici.test', login: 'new@ici.test', role: 'SCHEDULE_ADMIN', teamIds: ['team-a'], active: true });
      }
      return jsonResponse({ users: [] });
    });

    render(<AdminUsersPanel user={dashboardUser({ isSystemAdmin: true })} teams={teams} />);

    expect(await screen.findByText('admin@ici.test')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Login$/i), { target: { value: 'new@ici.test' } });
    fireEvent.click(screen.getByLabelText('Time A'));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/users$/),
      expect.objectContaining({ method: 'POST' }),
    ));
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(postCall?.[1]?.body).toBe(JSON.stringify({
      login: 'new@ici.test',
      role: 'SCHEDULE_ADMIN',
      teamIds: ['team-a'],
      active: true,
    }));
    expect((postCall?.[1]?.headers as Headers).get('Authorization')).toBe('Bearer panel-token');
  });
});
