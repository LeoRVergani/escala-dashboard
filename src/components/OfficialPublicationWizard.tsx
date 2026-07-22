import { useState } from 'react';
import type { DemoPublicationPackage } from '../lib/demoWorkspace/dto';
import type { OfficialCorporateLink } from '../lib/officialWorkspace/retarget';
import {
  eligibleOfficialMembers,
  eligibleOfficialTeams,
  isOfficialLinkEligible,
  validateCorporateLinkLocally,
} from '../lib/officialWorkspace/retarget';
import type {
  OfficialBackendStatus,
  OfficialFirebaseAdminStatus,
  OfficialRemoteBusy,
  OfficialRemoteError,
  OfficialValidationResult,
} from '../hooks/useOfficialRemotePublication';
import { OfficialCorporateLinkForm } from './OfficialCorporateLinkForm';
import { DiagnosticsPanel, type DiagnosticItem } from './DiagnosticsPanel';

interface OfficialPublicationWizardProps {
  officialPackage: DemoPublicationPackage | null;
  officialSource: 'none' | 'import' | 'dashboard' | 'demo';
  demoPackageAvailable: boolean;
  corporateLink: Partial<OfficialCorporateLink>;
  onCorporateLinkChange: (link: Partial<OfficialCorporateLink>) => void;
  backendStatus: OfficialBackendStatus;
  firebaseAdminStatus: OfficialFirebaseAdminStatus | null;
  validation: OfficialValidationResult | null;
  busy: OfficialRemoteBusy;
  lastError: OfficialRemoteError | null;
  onValidate: () => void;
  onPublishClick: () => void;
  publishResult: { revision: number } | null;
  onStartImport: () => void;
  onStartEmptySchedule: () => void;
  onSelectDemoPackage: () => void;
  onGoToDemo: () => void;
}

interface StepDef {
  step: number;
  label: string;
  valid: boolean;
}

function backendStatusLabel(status: OfficialBackendStatus): string {
  if (status === 'ONLINE') return 'Online';
  if (status === 'OFFLINE') return 'Offline';
  return 'Verificando…';
}

/**
 * Wizard/stepper da Publicação Oficial (FASE 14E, seção "Publicação Oficial" +
 * "Vínculo corporativo oficial"). Substitui o antigo painel único, que ficava dentro do
 * bloco condicional do Ambiente Demo e nunca filtrava membros/equipes contaminados pelo
 * Ambiente Demo (causa raiz do erro "identificador incompatível com o workspace ici-dev"
 * relatado — ver docs/spec/08-DASHBOARD-NAVEGACAO-UX-E-PUBLICACAO-GUIADA.md).
 *
 * Hoje a única origem possível de `officialPackage` é o pacote do Ambiente Demo
 * retitulado (arquitetura preservada da FASE 14D — não existe pipeline de importação XLS
 * separado). Por isso, na prática, os passos abaixo tendem a mostrar "nenhum membro
 * elegível" até que um pacote realmente oficial (workspaceId ici-dev, sem "demo" no id)
 * exista - isso é o comportamento CORRETO, não um bug: nenhum dado fictício deve virar
 * publicação oficial.
 */
export function OfficialPublicationWizard({
  officialPackage,
  officialSource,
  demoPackageAvailable,
  corporateLink,
  onCorporateLinkChange,
  backendStatus,
  firebaseAdminStatus,
  validation,
  busy,
  lastError,
  onValidate,
  onPublishClick,
  publishResult,
  onStartImport,
  onStartEmptySchedule,
  onSelectDemoPackage,
  onGoToDemo,
}: OfficialPublicationWizardProps) {
  const [step, setStep] = useState(1);

  const eligibleMembers = officialPackage ? eligibleOfficialMembers(officialPackage) : [];
  const eligibleTeams = officialPackage ? eligibleOfficialTeams(officialPackage) : [];
  const hasEligibleTeam = eligibleTeams.length > 0;
  const hasEligibleData = eligibleMembers.length > 0 && hasEligibleTeam;
  const referentialLinkError = officialPackage ? validateCorporateLinkLocally(officialPackage, corporateLink) : 'Nenhum pacote carregado.';
  const linkEligible = officialPackage ? isOfficialLinkEligible(officialPackage, corporateLink) : false;
  const linkOk = !referentialLinkError && linkEligible;
  const backendOnline = backendStatus === 'ONLINE';
  const dryRunOk = validation?.status === 'VALIDATED';
  const writeEnabled = firebaseAdminStatus?.allowOfficialFirestoreWrite === true;
  const canPublish = backendOnline && firebaseAdminStatus?.configured === true && writeEnabled && linkOk && dryRunOk && busy === 'IDLE';

  const steps: StepDef[] = [
    { step: 1, label: 'Origem da escala', valid: Boolean(officialPackage && hasEligibleTeam) },
    { step: 2, label: 'Revisão dos dados', valid: Boolean(officialPackage && hasEligibleTeam) },
    { step: 3, label: 'Diagnósticos', valid: true },
    { step: 4, label: 'Vínculo corporativo', valid: hasEligibleData && backendOnline },
    { step: 5, label: 'Dry-run', valid: hasEligibleData && backendOnline && linkOk },
    { step: 6, label: 'Revisão do plano', valid: hasEligibleData && backendOnline && linkOk && dryRunOk },
    { step: 7, label: 'Confirmação', valid: hasEligibleData && backendOnline && linkOk && dryRunOk },
    { step: 8, label: 'Resultado', valid: true },
  ];
  // "Diagnósticos" (3) e "Resultado" (8) ficam sempre alcançáveis - são exatamente onde o
  // usuário vai para entender POR QUE uma etapa anterior está bloqueada, ou para conferir o
  // resultado de uma tentativa passada. As demais seguem a cadeia estrita: só alcançável se
  // toda etapa anterior (exceto 3) já for válida.
  const reachable: Record<number, boolean> = { 1: true, 3: true, 8: true };
  reachable[2] = steps[0].valid;
  reachable[4] = steps[0].valid && steps[1].valid;
  reachable[5] = reachable[4] && steps[3].valid;
  reachable[6] = reachable[5] && steps[4].valid;
  reachable[7] = reachable[6] && steps[5].valid;

  const diagnostics: DiagnosticItem[] = [];
  if (!officialPackage) {
    diagnostics.push({ id: 'no-package', severity: 'info', message: 'Nenhum pacote oficial carregado ainda. Escolha uma origem na etapa 1.' });
  } else if (!hasEligibleTeam && eligibleMembers.length === 0) {
    diagnostics.push({
      id: 'demo-contamination',
      severity: 'error',
      message: 'Os dados carregados pertencem ao Ambiente Demo (workspace demo-v1) e nunca são aceitos na publicação oficial.',
      detail: 'IDs contendo "demo" são rejeitados no cliente (eligibleOfficialMembers/Teams) e no servidor (assertOfficialOnlyWritePlan.mjs).',
    });
  } else if (!hasEligibleData) {
    diagnostics.push({
      id: 'official-no-members',
      severity: 'info',
      message: 'A origem oficial tem equipe elegível, mas ainda não possui membros disponíveis para vínculo corporativo.',
    });
  }
  if (backendStatus === 'OFFLINE') {
    diagnostics.push({ id: 'backend-offline', severity: 'error', message: 'Backend indisponível — inicie o servidor Express (npm run server:dev) e confirme VITE_DASHBOARD_API_BASE_URL.' });
  } else if (backendStatus === 'UNKNOWN') {
    diagnostics.push({ id: 'backend-unknown', severity: 'info', message: 'Verificando status do backend…' });
  }
  if (backendOnline && firebaseAdminStatus && !firebaseAdminStatus.configured) {
    diagnostics.push({ id: 'admin-missing', severity: 'warning', message: 'Firebase Admin não configurado no servidor — dry-run funciona, a publicação real não.' });
  }
  if (firebaseAdminStatus && !writeEnabled) {
    diagnostics.push({ id: 'flag-disabled', severity: 'info', message: 'ALLOW_OFFICIAL_FIRESTORE_WRITE está desligada — publicação oficial desabilitada neste ambiente. O dry-run continua disponível.' });
  }
  if (officialPackage && corporateLink.memberId && corporateLink.teamId && !linkOk) {
    diagnostics.push({ id: 'link-invalid', severity: 'error', message: referentialLinkError ?? 'O vínculo selecionado usa dados do Ambiente Demo, incompatíveis com o workspace ici-dev.' });
  }
  if (lastError) {
    diagnostics.push({ id: 'last-error', severity: 'error', message: lastError.message, detail: lastError.code });
  }

  const goTo = (target: number) => {
    if (reachable[target]) setStep(target);
  };

  return (
    <section className="official-wizard" aria-label="Publicação Oficial — workspace ici-dev">
      <div className="official-wizard-head">
        <h2>Publicação Oficial — workspace ici-dev</h2>
        <p className="official-wizard-warning" role="alert">
          Esta área grava dados reais consumidos pelo Escala ICI (KMP). Confira cada etapa
          com atenção antes de confirmar.
        </p>
      </div>

      <div className="official-wizard-steps" role="tablist" aria-label="Etapas da publicação oficial">
        {steps.map((item) => (
          <button
            key={item.step}
            type="button"
            role="tab"
            aria-selected={step === item.step}
            aria-label={item.label}
            className={`official-wizard-step-tab${item.valid ? '' : ' invalid'}`}
            disabled={!reachable[item.step]}
            title={!reachable[item.step] ? 'Conclua a etapa anterior primeiro.' : item.label}
            onClick={() => goTo(item.step)}
          >
            <span className="official-wizard-step-number" aria-hidden="true">{item.step}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="official-wizard-panel">
        {step === 1 && (
          <div className="official-wizard-step-content">
            <h3>1 · Origem da escala</h3>
            <div className="official-source-options" role="group" aria-label="Origem da escala oficial">
              <button
                type="button"
                className="official-source-option"
                aria-pressed={officialSource === 'import'}
                onClick={onStartImport}
              >
                <b>Escala importada</b>
                <span>XLS/XLSX processado pelo parser existente.</span>
              </button>
              <button
                type="button"
                className="official-source-option"
                aria-pressed={officialSource === 'dashboard'}
                onClick={onStartEmptySchedule}
              >
                <b>Escala criada no Dashboard</b>
                <span>Cria um pacote oficial a partir do modelo vazio.</span>
              </button>
              <button
                type="button"
                className="official-source-option official-source-option-blocked"
                aria-pressed={officialSource === 'demo'}
                onClick={onSelectDemoPackage}
              >
                <b>Pacote Demo <span className="official-source-badge">bloqueado</span></b>
                <span>Retitula workspaceId para ici-dev, mas os IDs continuam contaminados por design.</span>
              </button>
            </div>
            {!officialPackage && (
              <p>
                Nenhum pacote carregado. Para usar a opção bloqueada, abra o{' '}
                <button type="button" className="link-btn" onClick={onGoToDemo}>Ambiente Demo</button>
                {demoPackageAvailable ? ' e selecione o pacote Demo.' : ' primeiro.'}
              </p>
            )}
            {officialPackage && (
              <>
                <p>
                  Pacote atual: <strong>{officialPackage.teams.length}</strong> equipe(s),{' '}
                  <strong>{officialPackage.members.length}</strong> membro(s) no total.
                </p>
                <p className={hasEligibleData ? 'official-wizard-ok' : 'official-wizard-blocked'}>
                  {hasEligibleData
                    ? `${eligibleMembers.length} membro(s) e ${eligibleTeams.length} equipe(s) elegíveis para ici-dev.`
                    : hasEligibleTeam
                      ? `${eligibleTeams.length} equipe(s) elegível(is), sem membros no pacote.`
                      : 'Nenhum membro ou equipe elegível — todo o pacote pertence ao Ambiente Demo (workspace demo-v1) e é filtrado automaticamente.'}
                </p>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="official-wizard-step-content">
            <h3>2 · Revisão dos dados</h3>
            <dl className="official-wizard-summary-list">
              <div><dt>Equipes elegíveis</dt><dd>{eligibleTeams.length}</dd></div>
              <div><dt>Membros elegíveis</dt><dd>{eligibleMembers.length}</dd></div>
              <div><dt>Períodos no pacote</dt><dd>{officialPackage?.schedulePeriods.length ?? 0}</dd></div>
              <div><dt>Atribuições no pacote</dt><dd>{officialPackage?.scheduleAssignments.length ?? 0}</dd></div>
            </dl>
          </div>
        )}

        {step === 3 && (
          <div className="official-wizard-step-content">
            <h3>3 · Diagnósticos</h3>
            <dl className="official-wizard-summary-list">
              <div><dt>Backend</dt><dd>{backendStatusLabel(backendStatus)}</dd></div>
              <div><dt>Firebase Admin</dt><dd>{firebaseAdminStatus?.configured ? 'Configurado' : 'Não configurado'}</dd></div>
              <div><dt>Publicação oficial (flag)</dt><dd>{writeEnabled ? 'Habilitada' : 'Desabilitada'}</dd></div>
              <div><dt>Revisão ativa em ici-dev</dt><dd>{firebaseAdminStatus?.activePublicationRevision ?? '—'}</dd></div>
            </dl>
            <DiagnosticsPanel items={diagnostics} emptyMessage="Nenhum diagnóstico pendente." />
          </div>
        )}

        {step === 4 && officialPackage && (
          <div className="official-wizard-step-content">
            <h3>4 · Vínculo corporativo</h3>
            <OfficialCorporateLinkForm pkg={officialPackage} link={corporateLink} onChange={onCorporateLinkChange} />
            {corporateLink.memberId && corporateLink.teamId && !linkOk && (
              <p className="official-publication-link-error" role="alert">
                {referentialLinkError ?? 'O vínculo selecionado usa dados do Ambiente Demo, incompatíveis com o workspace ici-dev.'}
              </p>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="official-wizard-step-content">
            <h3>5 · Dry-run</h3>
            <p>Executa a validação completa no servidor sem gravar nada — sempre disponível, mesmo com a publicação oficial desabilitada.</p>
            <button type="button" className="btn" disabled={!linkOk || busy !== 'IDLE' || !backendOnline} onClick={onValidate}>
              {busy === 'VALIDATING' ? 'Validando…' : 'Executar dry-run'}
            </button>
            {validation && (
              <div className="official-publication-validation" role="status">
                <strong>Última validação: {validation.status}</strong>
                <span>Revisão ativa: {validation.currentActiveRevision}</span>
                <span>Próxima revisão: {validation.nextPublicationRevision}</span>
                <span>Checksum: {validation.checksumStatus}</span>
              </div>
            )}
            {lastError && <p className="official-publication-error" role="alert">{lastError.message}</p>}
          </div>
        )}

        {step === 6 && (
          <div className="official-wizard-step-content">
            <h3>6 · Revisão do plano</h3>
            {validation && officialPackage ? (
              <dl className="official-wizard-summary-list">
                <div><dt>Workspace</dt><dd>ici-dev</dd></div>
                <div><dt>Próxima revisão</dt><dd>{validation.nextPublicationRevision}</dd></div>
                <div><dt>Times</dt><dd>{validation.counts.teams ?? 0}</dd></div>
                <div><dt>Membros</dt><dd>{validation.counts.members ?? 0}</dd></div>
                <div><dt>Períodos</dt><dd>{validation.counts.schedulePeriods ?? 0}</dd></div>
                <div><dt>Atribuições</dt><dd>{validation.counts.scheduleAssignments ?? 0}</dd></div>
                <div>
                  <dt>Vínculo</dt>
                  <dd>
                    {officialPackage.members.find((item) => item.id === corporateLink.memberId)?.displayName}
                    {' — '}
                    {officialPackage.teams.find((item) => item.id === corporateLink.teamId)?.name}
                  </dd>
                </div>
              </dl>
            ) : (
              <p>Execute o dry-run na etapa anterior para revisar o plano.</p>
            )}
          </div>
        )}

        {step === 7 && (
          <div className="official-wizard-step-content">
            <h3>7 · Confirmação</h3>
            <button type="button" className="btn btn-primary" disabled={!canPublish} onClick={onPublishClick}>
              Publicar oficialmente
            </button>
            {!writeEnabled && (
              <p className="official-publication-disabled" role="status">
                Publicação oficial desabilitada neste ambiente.
              </p>
            )}
          </div>
        )}

        {step === 8 && (
          <div className="official-wizard-step-content">
            <h3>8 · Resultado</h3>
            {publishResult && (
              <p className="official-wizard-ok" role="status">
                Workspace oficial ici-dev publicado na revisão {publishResult.revision}.
              </p>
            )}
            {!publishResult && lastError && (
              <p className="official-publication-error" role="alert">{lastError.message}</p>
            )}
            {!publishResult && !lastError && (
              <p>Nenhuma publicação foi realizada nesta sessão ainda.</p>
            )}
          </div>
        )}
      </div>

      <div className="official-wizard-nav">
        <button type="button" className="btn" disabled={step === 1} onClick={() => goTo(step - 1)}>Voltar</button>
        <button type="button" className="btn" disabled={step === 8 || !reachable[step + 1]} onClick={() => goTo(step + 1)}>Avançar</button>
      </div>
    </section>
  );
}
