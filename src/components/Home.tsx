export interface HomeSummary {
  hasSchedule: boolean;
  scheduleTypeLabel: string | null;
  periodLabel: string | null;
  peopleCount: number;
  assignmentsCount: number;
  localDraftAvailable: boolean;
  testDriveAvailable: boolean;
  demoWorkspaceLoaded: boolean;
  demoWorkspaceDirty: boolean;
  demoContinueAvailable: boolean;
  officialPackageLoaded: boolean;
  officialEligibleMemberCount: number;
  backendStatus: 'UNKNOWN' | 'ONLINE' | 'OFFLINE';
  firebaseAdminConfigured: boolean | null;
}

interface HomeProps {
  summary: HomeSummary;
  onCreateEmpty: () => void;
  onStartImport: () => void;
  onOpenDraft: () => void;
  onStartTestDrive: () => void;
  onContinueTestDrive: () => void;
  onOpenDemoWorkspace: () => void;
  onContinueDemoWorkspace: () => void;
  onPrepareOfficial: () => void;
  onViewStatus: () => void;
}

function backendStatusLabel(status: HomeSummary['backendStatus']): string {
  if (status === 'ONLINE') return 'Backend online';
  if (status === 'OFFLINE') return 'Backend offline';
  return 'Backend: verificando…';
}

/**
 * Tela inicial (FASE 14E): cartões de entrada + resumo compacto do estado atual. Não
 * mostra a grade nem formulários — cada cartão apenas navega para a seção certa ou
 * dispara a mesma ação que já existia na barra/empty-state anteriores.
 */
export function Home({
  summary,
  onCreateEmpty,
  onStartImport,
  onOpenDraft,
  onStartTestDrive,
  onContinueTestDrive,
  onOpenDemoWorkspace,
  onContinueDemoWorkspace,
  onPrepareOfficial,
  onViewStatus,
}: HomeProps) {
  return (
    <div className="home">
      <section className="home-summary" aria-label="Resumo do estado atual">
        <h2>Resumo</h2>
        <dl>
          <div>
            <dt>Escala carregada</dt>
            <dd>{summary.hasSchedule ? (summary.scheduleTypeLabel ?? 'Sim') : 'Nenhuma'}</dd>
          </div>
          <div>
            <dt>Período</dt>
            <dd>{summary.periodLabel ?? '—'}</dd>
          </div>
          <div>
            <dt>Pessoas</dt>
            <dd>{summary.hasSchedule ? summary.peopleCount : '—'}</dd>
          </div>
          <div>
            <dt>Atribuições</dt>
            <dd>{summary.hasSchedule ? summary.assignmentsCount : '—'}</dd>
          </div>
          <div>
            <dt>Rascunho local</dt>
            <dd>{summary.localDraftAvailable ? 'Disponível' : 'Nenhum'}</dd>
          </div>
          <div>
            <dt>Ambiente Demo</dt>
            <dd>
              {summary.demoWorkspaceLoaded
                ? (summary.demoWorkspaceDirty ? 'Carregado · alterações locais' : 'Carregado · sincronizado')
                : 'Não carregado'}
            </dd>
          </div>
          <div>
            <dt>Publicação Oficial</dt>
            <dd>
              {!summary.officialPackageLoaded
                ? 'Sem pacote carregado'
                : summary.officialEligibleMemberCount > 0
                  ? `${summary.officialEligibleMemberCount} membro(s) elegível(is)`
                  : 'Sem membros elegíveis (dados do Ambiente Demo)'}
            </dd>
          </div>
          <div>
            <dt>Backend</dt>
            <dd>{backendStatusLabel(summary.backendStatus)}</dd>
          </div>
          <div>
            <dt>Firebase Admin</dt>
            <dd>
              {summary.firebaseAdminConfigured === null
                ? 'Indisponível'
                : summary.firebaseAdminConfigured ? 'Configurado' : 'Não configurado'}
            </dd>
          </div>
        </dl>
        <button type="button" className="btn btn-ghost home-view-status" onClick={onViewStatus}>
          Ver status remoto completo
        </button>
      </section>

      <div className="home-cards">
        <article className="home-card">
          <h3>Escala vazia</h3>
          <p>Comece do zero escolhendo o tipo e o período da escala.</p>
          <button type="button" className="btn btn-primary" onClick={onCreateEmpty}>
            Criar escala vazia
          </button>
        </article>

        <article className="home-card">
          <h3>Importar planilha</h3>
          <p>Envie um arquivo .xls/.xlsx existente para revisar e editar.</p>
          <button type="button" className="btn btn-primary" onClick={onStartImport}>
            Importar arquivo
          </button>
        </article>

        <article className="home-card">
          <h3>Rascunho local</h3>
          <p>
            {summary.localDraftAvailable
              ? 'Continue de onde parou neste navegador.'
              : 'Nenhum rascunho salvo neste navegador ainda.'}
          </p>
          <button type="button" className="btn" disabled={!summary.localDraftAvailable} onClick={onOpenDraft}>
            Abrir rascunho atual
          </button>
        </article>

        <article className="home-card">
          <h3>Test Drive</h3>
          <p>Dados fictícios locais, sem publicação nem impacto real.</p>
          <div className="home-card-actions">
            <button type="button" className="btn" onClick={onStartTestDrive}>
              Test Drive — dados fictícios locais
            </button>
            {summary.testDriveAvailable && (
              <button type="button" className="btn btn-ghost" onClick={onContinueTestDrive}>
                Continuar Test Drive
              </button>
            )}
          </div>
        </article>

        <article className="home-card">
          <h3>Ambiente Demo</h3>
          <p>Workspace <code>demo-v1</code>, times e responsáveis fictícios do EscalaICI-KMP-Lab.</p>
          <div className="home-card-actions">
            <button type="button" className="btn" onClick={onOpenDemoWorkspace}>
              Ambiente de Demonstração
            </button>
            {summary.demoContinueAvailable && (
              <button type="button" className="btn btn-ghost" onClick={onContinueDemoWorkspace}>
                Continuar Ambiente de Demonstração
              </button>
            )}
          </div>
        </article>

        <article className="home-card home-card-official">
          <h3>Publicação Oficial</h3>
          <p>Workspace <code>ici-dev</code> — preview, dry-run e publicação revisionada.</p>
          <button type="button" className="btn" onClick={onPrepareOfficial}>
            Preparar publicação oficial
          </button>
        </article>
      </div>
    </div>
  );
}
