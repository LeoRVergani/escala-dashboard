import type { AuthenticatedDashboardUser, Team } from '../types';

interface Props {
  configured: boolean; user: AuthenticatedDashboardUser | null; teams: Team[]; selectedTeamId: string;
  loading: boolean; error: string | null; hasSchedule: boolean; canPublish: boolean;
  onTeamChange: (id: string) => void; onLogin: () => void; onLogout: () => void; onImport: () => void;
  onSaveDraft: () => void; onPublish: () => void; onSwaps: () => void; onManageTeams: () => void;
}

export function FirebaseDashboardBar(props: Props) {
  return <section className="firebase-bar" aria-label="Integração Escala ICI">
    <span className="firebase-user">{props.loading ? 'Verificando acesso…' : props.user ? `Conectado: ${props.user.displayName ?? props.user.login}` : props.configured ? 'Não conectado' : 'Firebase não configurado'}</span>
    <label>Time
      <select aria-label="Time selecionado" value={props.selectedTeamId} disabled={!props.user || !props.teams.length} onChange={(event) => props.onTeamChange(event.target.value)}>
        {!props.teams.length && <option value="">Nenhum time disponível</option>}
        {props.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
      </select>
    </label>
    <button className="btn" onClick={props.onImport}>Importar</button>
    <button className="btn" disabled={!props.hasSchedule || !props.selectedTeamId} onClick={props.onSaveDraft}>Salvar rascunho</button>
    <button className="btn btn-primary" disabled={!props.canPublish} onClick={props.onPublish}>Publicar escala</button>
    <button className="btn" disabled={!props.user || !props.teams.length} onClick={props.onSwaps}>Trocas</button>
    {props.user?.isSystemAdmin && <button className="btn" onClick={props.onManageTeams}>Times</button>}
    {props.user ? <button className="btn" onClick={props.onLogout}>Sair</button> : <button className="btn" disabled={!props.configured} onClick={props.onLogin}>Entrar com Microsoft</button>}
    {props.error && <span className="firebase-error" role="alert">{props.error}</span>}
  </section>;
}
