import { useState } from 'react';
import { UserIcon } from './icons';
import { LOCAL_TEAM_TYPE_LABELS, type LocalIdentity, type LocalTeam, type LocalTeamType } from '../lib/localIdentity';

interface LocalIdentityBarProps {
  identity: LocalIdentity;
  activeTeam: LocalTeam | null;
  devSessionActive?: boolean;
  devSessionLogin?: string;
  devBootstrapEnabled?: boolean;
  devBootstrapError?: string | null;
  onSetChefeName: (name: string) => void;
  onAddTeam: (name: string, type: LocalTeamType) => void;
  onSetActiveTeam: (teamId: string | null) => void;
  onDevLogin?: (login: string) => Promise<void>;
  onDevLogout?: () => Promise<void>;
}

/**
 * Quem está operando o Dashboard agora (FASE 14E, adendo de UX). Sem MSAL ainda - só um
 * rótulo local (`chefeName` + equipe ativa) sempre visível no cabeçalho, para nunca
 * confundir com o seletor de equipe do Firebase (`FirebaseDashboardBar`, autenticado, usado
 * na publicação estruturada real). Quando o login Microsoft existir, este bloco deixa de
 * ser necessário e pode ser removido sem afetar nenhum outro fluxo - não há acoplamento.
 */
export function LocalIdentityBar({
  identity,
  activeTeam,
  devSessionActive = false,
  devSessionLogin,
  devBootstrapEnabled = false,
  devBootstrapError = null,
  onSetChefeName,
  onAddTeam,
  onSetActiveTeam,
  onDevLogin,
  onDevLogout,
}: LocalIdentityBarProps) {
  const [editingName, setEditingName] = useState(identity.chefeName === '');
  const [nameDraft, setNameDraft] = useState(identity.chefeName);
  const [showNewTeam, setShowNewTeam] = useState(identity.teams.length === 0);
  const [teamNameDraft, setTeamNameDraft] = useState('');
  const [teamTypeDraft, setTeamTypeDraft] = useState<LocalTeamType>('SOC');
  const [devLoginDraft, setDevLoginDraft] = useState('');

  return (
    <div className="local-identity-bar" aria-label="Sessão local">
      <UserIcon className="local-identity-icon" />
      <div className="local-identity-content">
        {editingName ? (
          <form
            className="local-identity-name-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!nameDraft.trim()) return;
              onSetChefeName(nameDraft);
              setEditingName(false);
            }}
          >
            <label>
              Gestor responsável
              <input
                autoFocus
                value={nameDraft}
                placeholder="Nome de quem está operando"
                onChange={(event) => setNameDraft(event.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary">Salvar</button>
          </form>
        ) : (
          <span className="local-identity-summary">
            <strong>Gestor responsável:</strong> {identity.chefeName}
            <button type="button" className="link-btn" onClick={() => { setNameDraft(identity.chefeName); setEditingName(true); }}>
              editar
            </button>
          </span>
        )}

        {!editingName && (
          <span className="local-identity-team">
            <strong>Equipe:</strong>
            {identity.teams.length > 0 && (
              <select
                aria-label="Equipe ativa"
                value={activeTeam?.id ?? ''}
                onChange={(event) => onSetActiveTeam(event.target.value || null)}
              >
                <option value="">Nenhum selecionado</option>
                {identity.teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name} · {LOCAL_TEAM_TYPE_LABELS[team.type]}</option>
                ))}
              </select>
            )}
            {identity.teams.length === 0 && <span className="muted">nenhuma equipe cadastrada ainda</span>}
            <button type="button" className="link-btn" onClick={() => setShowNewTeam((prev) => !prev)}>
              + nova equipe
            </button>
          </span>
        )}

        {!editingName && showNewTeam && (
          <form
            className="local-identity-team-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!teamNameDraft.trim()) return;
              onAddTeam(teamNameDraft, teamTypeDraft);
              setTeamNameDraft('');
              setShowNewTeam(false);
            }}
          >
            <input
              value={teamNameDraft}
              placeholder="Nome da equipe (ex.: SOC Plantão A)"
              onChange={(event) => setTeamNameDraft(event.target.value)}
            />
            <select value={teamTypeDraft} onChange={(event) => setTeamTypeDraft(event.target.value as LocalTeamType)}>
              {Object.entries(LOCAL_TEAM_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button type="submit" className="btn">Cadastrar equipe</button>
          </form>
        )}

        {devSessionActive && <span className="dev-session-badge">MODO DE TESTE</span>}
        {devSessionActive && devSessionLogin && <span className="dev-session-login">{devSessionLogin}</span>}
        {devSessionActive && onDevLogout && (
          <button type="button" className="link-btn dev-session-logout" onClick={() => { void onDevLogout(); }}>
            sair do teste
          </button>
        )}
        {!devSessionActive && devBootstrapEnabled && onDevLogin && (
          <form
            className="dev-session-form"
            aria-label="Entrar em modo de teste"
            onSubmit={(event) => {
              event.preventDefault();
              if (!devLoginDraft.trim()) return;
              void onDevLogin(devLoginDraft);
            }}
          >
            <input
              value={devLoginDraft}
              placeholder="login administrativo"
              onChange={(event) => setDevLoginDraft(event.target.value)}
            />
            <button type="submit" className="btn">Entrar em modo de teste</button>
          </form>
        )}
        {devBootstrapError && <span className="dev-session-error" role="alert">{devBootstrapError}</span>}
      </div>
      <span className="local-identity-note">sessão local deste navegador · sem login Microsoft ainda</span>
    </div>
  );
}
