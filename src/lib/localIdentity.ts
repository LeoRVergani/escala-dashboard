// Identidade local do "Gestor responsável" (FASE 14E, adendo de UX): hoje não existe login
// MSAL no Dashboard (isso é responsabilidade de uma fase futura - ver
// docs/spec/05-FIREBASE-ESCALA-ICI-RESPONSIBLE-LOGIN.md). Enquanto isso, o gestor
// responsável só precisa dizer quem é e qual equipe está operando para a interface deixar isso visível o
// tempo todo. Isto é inteiramente local (localStorage, um navegador só) e não substitui
// nem se mistura com `firebaseDashboard.teams` (que é o modelo real, autenticado, usado na
// publicação estruturada) - é só um rótulo de contexto até o login existir.
export type LocalTeamType = 'SOC' | 'NOC' | 'SERVICE_DESK_N1' | 'PLANTAO_COSI' | 'OUTRO';

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
  SOC: 'SOC — Escala 6x1',
  NOC: 'NOC — Escala 6x1',
  SERVICE_DESK_N1: 'Service Desk N1 — Escala 6x1',
  PLANTAO_COSI: 'Plantão COSI',
  OUTRO: 'Outro',
};

const STORAGE_KEY = 'escala-dashboard:local-identity:v1';

const EMPTY_IDENTITY: LocalIdentity = { chefeName: '', teams: [], activeTeamId: null };

function normalizeLocalTeamType(value: unknown): LocalTeamType {
  if (value === 'SOC_NOC') return 'SOC';
  return value === 'SOC'
    || value === 'NOC'
    || value === 'SERVICE_DESK_N1'
    || value === 'PLANTAO_COSI'
    || value === 'OUTRO'
    ? value
    : 'OUTRO';
}

export function loadLocalIdentity(): LocalIdentity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_IDENTITY };
    const parsed = JSON.parse(raw) as Partial<LocalIdentity>;
    const teams = Array.isArray(parsed.teams) ? (parsed.teams as unknown[]) : [];
    return {
      chefeName: typeof parsed.chefeName === 'string' ? parsed.chefeName : '',
      teams: teams
        .filter((team): team is Record<string, unknown> => Boolean(team) && typeof team === 'object')
        .map((team) => ({
          id: typeof team.id === 'string' ? team.id : newLocalTeamId(),
          name: typeof team.name === 'string' ? team.name : '',
          type: normalizeLocalTeamType(team.type),
        }))
        .filter((team) => team.name.trim()),
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
