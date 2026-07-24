import { useMemo, useState } from 'react';
import type { Team } from '../types';

interface SchedulesOverviewProps {
  teams: Team[];
  selectedTeamId: string;
  onSelectTeam: (teamId: string) => void;
  onCreate: (teamId?: string) => void;
  onOpen: (teamId: string) => void;
}

export function SchedulesOverview({ teams, selectedTeamId, onSelectTeam, onCreate, onOpen }: SchedulesOverviewProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const filtered = useMemo(() => teams.filter((team) => {
    const matchesQuery = `${team.name} ${team.code}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'));
    const matchesStatus = status === 'all' || (status === 'active' ? team.active : !team.active);
    return matchesQuery && matchesStatus;
  }), [query, status, teams]);

  return (
    <main className="orbit-page schedules-page">
      <header className="orbit-page__header">
        <div><span className="page-eyebrow">Órbitas de trabalho</span><h1>Escalas</h1><p>Encontre uma equipe autorizada e continue a preparação do período.</p></div>
        <button type="button" className="btn btn-primary" onClick={() => onCreate(selectedTeamId || filtered[0]?.id)}>Criar nova escala</button>
      </header>
      <div className="schedule-filters" role="search">
        <label>Buscar equipe<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou código" /></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todas</option><option value="active">Ativas</option><option value="inactive">Inativas</option></select></label>
      </div>
      {!teams.length && <div className="orbit-state orbit-state--empty"><h2>Nenhuma equipe autorizada</h2><p>Quando uma equipe for vinculada ao seu acesso, ela aparecerá aqui.</p></div>}
      {teams.length > 0 && !filtered.length && <div className="orbit-state orbit-state--empty"><h2>Nenhuma escala encontrada</h2><p>Ajuste a busca ou o filtro para consultar as equipes disponíveis.</p></div>}
      <div className="schedule-list" aria-live="polite">
        {filtered.map((team) => (
          <article className={`schedule-list__item${team.id === selectedTeamId ? ' is-selected' : ''}`} key={team.id}>
            <div><span className="destination-seal"><strong>{team.scheduleKind === 'ON_CALL' ? 'Plantão' : 'Escala'}</strong><span>{team.name}</span></span><h2>{team.name}</h2><p>{team.code} · {team.active ? 'Equipe ativa' : 'Equipe inativa'}</p></div>
            <div className="schedule-list__actions"><button type="button" className="btn" onClick={() => { onSelectTeam(team.id); onOpen(team.id); }}>Abrir equipe</button><button type="button" className="btn btn-ghost" onClick={() => onCreate(team.id)}>Preparar período</button></div>
          </article>
        ))}
      </div>
    </main>
  );
}
