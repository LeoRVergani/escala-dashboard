import { useCallback, useEffect, useState } from 'react';

const API_BASE_URL = (import.meta.env.VITE_DASHBOARD_API_BASE_URL as string | undefined) || 'http://127.0.0.1:3001';

interface DevSessionResponse {
  enabled?: boolean;
  active: boolean;
  login?: string;
}

function endpoint(path: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
}

export function useDevLocalSession() {
  const [enabled, setEnabled] = useState(false);
  const [active, setActive] = useState(false);
  const [login, setLogin] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applySession = useCallback((session: DevSessionResponse) => {
    setEnabled(session.enabled === true);
    setActive(session.active === true);
    setLogin(session.active === true ? session.login : undefined);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint('/api/dev/session'), { credentials: 'include' });
      if (response.status === 404) {
        applySession({ enabled: false, active: false });
        return;
      }
      if (!response.ok) throw new Error('Não foi possível verificar a sessão de teste.');
      applySession(await response.json() as DevSessionResponse);
    } catch {
      applySession({ enabled: false, active: false });
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  const enter = useCallback(async (nextLogin: string) => {
    setError(null);
    const response = await fetch(endpoint('/api/dev/login'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: nextLogin }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      const message = body?.error?.message ?? 'Não foi possível entrar em modo de teste.';
      setError(message);
      throw new Error(message);
    }
    applySession({ enabled: true, ...(await response.json() as DevSessionResponse) });
  }, [applySession]);

  const leave = useCallback(async () => {
    setError(null);
    const response = await fetch(endpoint('/api/dev/logout'), { method: 'POST', credentials: 'include' });
    if (!response.ok) {
      const message = 'Não foi possível encerrar o modo de teste.';
      setError(message);
      throw new Error(message);
    }
    applySession({ enabled: true, active: false });
  }, [applySession]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { enabled, active, login, loading, error, enter, leave, refresh };
}
