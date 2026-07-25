import type { Team } from '../types';
import { AppButton } from './ui/AppButton';

interface TeamHomePageProps {
  team: Team;
  hasSchedule: boolean;
  periodLabel?: string | null;
  peopleCount: number;
  draftAvailable: boolean;
  onOpenSchedule: () => void;
  onCreate: () => void;
  onOpenDraft: () => void;
  onDiscardDraft: () => void;
  onBack: () => void;
}

export function TeamHomePage({ team, hasSchedule, periodLabel, peopleCount, draftAvailable, onOpenSchedule, onCreate, onOpenDraft, onDiscardDraft, onBack }: TeamHomePageProps) {
  return <main className="orbit-page team-home-page">
    <button type="button" className="link-btn" onClick={onBack}>← Minhas equipes</button>
    <header className="orbit-page__header"><div><span className="page-eyebrow">Equipe autorizada · {team.code}</span><h1>{team.name}</h1><p>{team.scheduleKind === 'ON_CALL' ? 'Plantão COSI' : 'Escala 6x1'} · {team.active ? 'Equipe ativa' : 'Equipe inativa'}</p></div><span className="status-badge status-badge--active">Destino protegido</span></header>
    <section className="team-home-summary"><div><span className="page-eyebrow">Período atual</span><strong>{periodLabel ?? 'Nenhum período carregado'}</strong><span>{hasSchedule ? `${peopleCount} colaboradores no estado atual` : 'Prepare ou importe um período para começar.'}</span></div><AppButton variant="primary" onClick={hasSchedule ? onOpenSchedule : onCreate}>{hasSchedule ? 'Abrir escala atual' : 'Preparar próximo período'}</AppButton></section>
    {draftAvailable && <section className="draft-banner" role="status"><div><strong>Há um rascunho local para esta equipe.</strong><span>Continue a revisão ou descarte somente este rascunho.</span></div><div><AppButton variant="primary" onClick={onOpenDraft}>Continuar rascunho</AppButton><AppButton variant="ghost" onClick={onDiscardDraft}>Descartar rascunho</AppButton></div></section>}
    <section className="metric-grid"><div className="metric-card"><span>Colaboradores</span><strong>{hasSchedule ? peopleCount : '—'}</strong></div><div className="metric-card"><span>Publicação</span><strong>Não carregada</strong></div><div className="metric-card"><span>Situação</span><strong>{hasSchedule ? 'Em revisão' : 'A preparar'}</strong></div></section>
  </main>;
}
