// Identidade local do "chefe do setor" (FASE 14E, adendo de UX): hoje não existe login
// MSAL no Dashboard (isso é responsabilidade de uma fase futura - ver
// docs/spec/05-FIREBASE-ESCALA-ICI-RESPONSIBLE-LOGIN.md). Enquanto isso, o chefe do setor
// só precisa dizer quem é e qual time está operando para a interface deixar isso visível o
// tempo todo. Isto é inteiramente local (localStorage, um navegador só) e não substitui
// nem se mistura com `firebaseDashboard.teams` (que é o modelo real, autenticado, usado na
// publicação estruturada) - é só um rótulo de contexto até o login existir.
export type LocalTeamType = 'SOC_NOC' | 'SERVICE_DESK_N1' | 'PLANTAO_COSI' | 'OUTRO';

export interface LocalTeam {
  id: string;
  name: string;
  type: LocalTeamType;
}

export interface LocalIdentity {
  chefeName: string;
  teams: LocalTeam[];
  activeTeamId: string | null;
}

export const LOCAL_TEAM_TYPE_LABELS: Record<LocalTeamType, string> = {
  SOC_NOC: 'SOC/NOC — Escala 6x1',
  SERVICE_DESK_N1: 'Service Desk N1 — Escala 6x1',
  PLANTAO_COSI: 'Plantão COSI',
  OUTRO: 'Outro',
};

const STORAGE_KEY = 'escala-dashboard:local-identity:v1';

const EMPTY_IDENTITY: LocalIdentity = { chefeName: '', teams: [], activeTeamId: null };

export function loadLocalIdentity(): LocalIdentity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_IDENTITY };
    const parsed = JSON.parse(raw) as Partial<LocalIdentity>;
    return {
      chefeName: typeof parsed.chefeName === 'string' ? parsed.chefeName : '',
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      activeTeamId: typeof parsed.activeTeamId === 'string' ? parsed.activeTeamId : null,
    };
  } catch {
    return { ...EMPTY_IDENTITY };
  }
}

export function saveLocalIdentity(identity: LocalIdentity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function newLocalTeamId(): string {
  return `local-team-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
