import type { Team } from '../types';

export interface HomeSummary {
  greeting: string;
  areaLabel: string;
  peopleCount: number | null;
  draftCount: number;
  backendStatus: 'UNKNOWN' | 'ONLINE' | 'OFFLINE';
}

interface HomeProps {
  summary: HomeSummary;
  teams: Team[];
  selectedTeamId: string;
  onSelectTeam: (teamId: string) => void;
  onOpenTeam: (teamId: string) => void;
  onCreate: (teamId?: string) => void;
  onLogin: () => void;
  userName?: string;
  loading?: boolean;
  error?: string | null;
  legacyTestActions?: { onStartTestDrive: () => void; onOpenDemo: () => void; onPrepareOfficial: () => void };
}

function teamKind(team: Team): string {
  return team.scheduleKind === 'ON_CALL' ? 'Plantão COSI' : 'Escala 6x1';
}

export function Home({ summary, teams, selectedTeamId, onSelectTeam, onOpenTeam, onCreate, onLogin, userName, loading = false, error = null, legacyTestActions }: HomeProps) {
  if (loading) return <main className="orbit-page"><div className="orbit-state orbit-state--loading" aria-live="polite"><span className="loading-indicator" />Carregando equipes autorizadas…</div></main>;
  if (error) return <main className="orbit-page"><div className="orbit-state orbit-state--error" role="alert"><h1>Não foi possível carregar suas equipes</h1><p>{error}</p><button type="button" className="btn" onClick={onLogin}>Tentar autenticar novamente</button></div></main>;

  return (
    <main className="orbit-page teams-page">
      <header className="orbit-page__header teams-page__intro">
        <div><span className="page-eyebrow">Área autorizada</span><h1>{summary.greeting}{userName ? `, ${userName}` : ''}.</h1><p>Escolha uma equipe para acompanhar o período e continuar seu trabalho.</p></div>
        <div className="teams-page__metric"><strong>{teams.length}</strong><span>equipes autorizadas</span></div>
      </header>
      <section className="area-card" aria-label="Resumo da área">
        <div><span className="page-eyebrow">Destino atual</span><h2>{summary.areaLabel}</h2><p>Equipes vinculadas ao seu acesso corporativo.</p></div>
        <dl><div><dt>Colaboradores no contexto</dt><dd>{summary.peopleCount ?? 'Não informado'}</dd></div><div><dt>Rascunhos locais</dt><dd>{summary.draftCount}</dd></div><div><dt>Status do serviço</dt><dd>{summary.backendStatus === 'ONLINE' ? 'Online' : summary.backendStatus === 'OFFLINE' ? 'Offline' : 'Verificando'}</dd></div></dl>
      </section>
      <section className="teams-page__list" aria-labelledby="teams-title">
        <div className="section-heading"><div><span className="page-eyebrow">Destinos</span><h2 id="teams-title">Minhas equipes</h2></div><button type="button" className="btn btn-primary" onClick={() => onCreate(selectedTeamId || teams[0]?.id)} disabled={!teams.length}>Cadastrar período</button></div>
        {!teams.length && <div className="orbit-state orbit-state--empty"><h2>Nenhuma equipe disponível</h2><p>Seu acesso ainda não possui uma equipe ativa vinculada.</p></div>}
        <div className="team-card-grid">
          {teams.map((team) => (
            <article className={`orbit-team-card${team.id === selectedTeamId ? ' is-selected' : ''}`} key={team.id}>
              <div className="orbit-team-card__head"><span className="destination-seal"><strong>{team.scheduleKind === 'ON_CALL' ? 'Plantão' : '6x1'}</strong><span>{team.name}</span></span><span className={`status-badge status-badge--${team.active ? 'active' : 'inactive'}`}>{team.active ? 'Ativa' : 'Inativa'}</span></div>
              <h3>{team.name}</h3><p>{teamKind(team)} · código {team.code}</p>
              <dl className="orbit-team-card__meta"><div><dt>Período</dt><dd>Não carregado</dd></div><div><dt>Publicação</dt><dd>Sem publicação carregada</dd></div></dl>
              <div className="orbit-team-card__actions"><button type="button" className="btn btn-primary" onClick={() => { onSelectTeam(team.id); onOpenTeam(team.id); }}>Abrir equipe</button><button type="button" className="btn btn-ghost" onClick={() => onCreate(team.id)}>Novo período</button></div>
            </article>
          ))}
        </div>
      </section>
      {legacyTestActions && <section className="home-test-actions" aria-label="Ações de teste"><button type="button" className="btn" onClick={() => onCreate(selectedTeamId || teams[0]?.id)}>Criar escala vazia</button><button type="button" className="btn" onClick={legacyTestActions.onStartTestDrive}>Test Drive — dados fictícios locais</button><button type="button" className="btn" onClick={legacyTestActions.onOpenDemo}>Ambiente de Demonstração</button><button type="button" className="btn" onClick={legacyTestActions.onPrepareOfficial}>Preparar publicação oficial</button></section>}
    </main>
  );
}
