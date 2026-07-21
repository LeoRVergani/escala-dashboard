import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as XLSX from 'xlsx';
import {
  MONTHS_PT_TITLE,
  N1_EMAIL_GUARANTEE_CODES,
  N1_PRIMARY_CODES,
  SHIFTS,
} from './constants';
import { detectConflicts } from './lib/conflicts';
import { exportScheduleFile } from './lib/exporter';
import { useHistory } from './lib/history';
import { cycle25To26, periodLabel, scheduleDates } from './lib/dates';
import { autoFillOperationalCycle, moveOnCallRecord as moveOnCallRecordToDate, startsInOperationalCycle } from './lib/onCall';
import { analyzeWorkbook, buildSchedule, newTechId, readWorkbook } from './lib/parser';
import { clearDraft, loadDraft, saveDraft } from './lib/storage';
import { endTestDrive, loadTestDriveSession, saveTestDriveSession } from './lib/testDrive';
import {
  mapN1Conflicts,
  n1CellValue,
  n1Rows,
  n1VisibleState,
  syncN1Aggregate,
  updateN1Cells,
  updateN1Rows,
} from './lib/serviceDeskN1';
import { fold } from './lib/normalize';
import type {
  CellValue,
  ScheduleState,
  ServiceDeskN1Layer,
  ServiceDeskN1Row,
  ServiceDeskN1Shift,
  WorkbookAnalysis,
} from './types';
import { cellKey, ScheduleGrid, type CellKey } from './components/ScheduleGrid';
import { ImportWizard } from './components/ImportWizard';
import { ScheduleTemplateWizard } from './components/ScheduleTemplateWizard';
import { OnCallEditor } from './components/OnCallEditor';
import { SocPlanner } from './components/SocPlanner';
import { ConflictAlertsPanel } from './components/ConflictAlertsPanel';
import { FirebaseDashboardBar } from './components/FirebaseDashboardBar';
import { DemoWorkspaceBanner } from './components/DemoWorkspaceBanner';
import { DemoScenarioSummary } from './components/DemoScenarioSummary';
import { DemoPublicationPanel } from './components/DemoPublicationPanel';
import { DemoPublishDialog } from './components/DemoPublishDialog';
import { OfficialPublishDialog } from './components/OfficialPublishDialog';
import { DemoRemoteResetDialog } from './components/DemoRemoteResetDialog';
import { DemoChangeRequestsDialog } from './components/DemoChangeRequestsDialog';
import { PublicationDialog } from './components/PublicationDialog';
import { SwapRequestsDialog } from './components/SwapRequestsDialog';
import { TeamDialog } from './components/TeamDialog';
import { DemoManagerAssignmentsDialog } from './components/DemoManagerAssignmentsDialog';
import { applyScheduleStateToPackage, demoPackageToScheduleState } from './lib/demoWorkspace/scheduleAdapter';
import { diffDemoPackages } from './lib/demoWorkspace/diff';
import { buildDemoWorkspaceExport, demoWorkspaceExportFileName } from './lib/demoWorkspace/export';
import { moveSocAssignment, removeSocAssignment, updateSocAssignment, type SocShiftId } from './lib/socPlanner';
import { useFirebaseDashboard } from './hooks/useFirebaseDashboard';
import { useDemoWorkspace } from './hooks/useDemoWorkspace';
import { useDemoRemotePublication, type DemoValidationResult } from './hooks/useDemoRemotePublication';
import { useOfficialRemotePublication, type OfficialValidationResult } from './hooks/useOfficialRemotePublication';
import type { DemoWorkspaceDiff } from './lib/demoWorkspace/diff';
import type { DemoPublicationPackage } from './lib/demoWorkspace/dto';
import { eligibleOfficialMembers, toOfficialPackage, type OfficialCorporateLink } from './lib/officialWorkspace/retarget';
import { signInWithMicrosoft, signOutDashboard } from './lib/authRepository';
import { buildPublicationPreview, type PublicationPreview } from './lib/publicationPreview';
import { publishStructuredSchedule, type PublicationMode } from './lib/schedulePublishRepository';
import { decideSwapRequest, loadSwapRequests } from './lib/swapRequestsRepository';
import { saveTeam } from './lib/teamsRepository';
import type { ShiftSwapRequest, Team } from './types';
import { AppShell, type AppShellSectionState } from './components/AppShell';
import { Home, type HomeSummary } from './components/Home';
import { OfficialPublicationWizard } from './components/OfficialPublicationWizard';
import { LocalIdentityBar } from './components/LocalIdentityBar';
import {
  loadStoredNavCollapsed,
  loadStoredSection,
  loadStoredUiCompact,
  storeNavCollapsed,
  storeSection,
  storeUiCompact,
  type AppSection,
} from './lib/navigation';
import { applyTheme, loadStoredTheme, nextTheme, storeTheme } from './lib/theme';
import { useLocalIdentity } from './hooks/useLocalIdentity';

interface PendingImport {
  wb: XLSX.WorkBook;
  analysis: WorkbookAnalysis;
}

type Clipboard =
  | { kind: 'day'; values: Record<string, CellValue | undefined> }
  | { kind: 'week'; values: Record<string, (CellValue | undefined)[]> }
  | null;

function formatN1Name(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s'-])([\p{L}])/gu, (_all, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('pt-BR')}`);
}

function shortN1Name(raw: string): string {
  const full = formatN1Name(raw);
  const words = full.split(/\s+/).filter(Boolean);
  return words.length <= 2 ? full : `${words[0]} ${words[words.length - 1]}`;
}

/** Rótulo humano do tipo de escala para o resumo da Home (FASE 14E). */
function scheduleTypeLabel(state: ScheduleState): string {
  if (state.viewType === 'oncall') return 'Plantão COSI';
  if (state.serviceDeskN1) return 'Service Desk N1 — Escala 6x1';
  if (state.visualGrouping === 'operational-shift') return 'SOC/NOC — Escala 6x1';
  return 'Escala';
}

/**
 * Formata `lastPublishedAt` com segurança para exibição. O tipo declarado é
 * `string | null`, mas o campo vem direto de um documento do Firestore
 * (`server/routes/{demoStatus,officialStatus}.mjs`) e, quando o valor bruto é um
 * `Timestamp` do Admin SDK, o `JSON.stringify` do Express serializa como
 * `{ _seconds, _nanoseconds }` em vez de string - renderizar esse objeto direto em JSX
 * quebra o React ("Objects are not valid as a React child") e, sem Error Boundary, deixa
 * a tela em branco. Nunca renderiza um valor bruto não reconhecido.
 */
function formatRemoteTimestamp(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('pt-BR');
  }
  if (typeof value === 'number') {
    return new Date(value).toLocaleString('pt-BR');
  }
  if (typeof value === 'object' && '_seconds' in (value as Record<string, unknown>)) {
    const seconds = (value as { _seconds: number })._seconds;
    return new Date(seconds * 1000).toLocaleString('pt-BR');
  }
  return '—';
}

/** Conta atribuições preenchidas, independente da visualização (grade, N1 ou plantão). */
function countScheduleAssignments(state: ScheduleState): number {
  if (state.onCallRecords) return state.onCallRecords.length;
  if (state.serviceDeskN1) {
    return [...state.serviceDeskN1.principalRows, ...state.serviceDeskN1.emailGuaranteeRows]
      .reduce((sum, row) => sum + Object.keys(row.cells).length, 0);
  }
  return Object.values(state.cells).reduce((sum, row) => sum + Object.keys(row).length, 0);
}

export default function App() {
  const history = useHistory<ScheduleState | null>(null);
  const firebaseDashboard = useFirebaseDashboard();
  const demoWorkspace = useDemoWorkspace();
  const schedule = history.state;
  // FASE 14E: sempre habilitados (não dependem mais de schedule.origin) - a Home e a seção
  // Histórico/Status precisam do status do backend/Firebase Admin mesmo antes de qualquer
  // workspace ser carregado, e a Publicação Oficial agora é uma seção própria, alcançável
  // sem passar pelo Ambiente Demo primeiro.
  const demoRemotePublication = useDemoRemotePublication(true);
  const officialRemotePublication = useOfficialRemotePublication(true);
  const [activeSection, setActiveSection] = useState<AppSection>(() => loadStoredSection());
  const [navCollapsed, setNavCollapsed] = useState(() => loadStoredNavCollapsed());
  const [uiCompact, setUiCompact] = useState(() => loadStoredUiCompact());
  const [themePreference, setThemePreference] = useState(() => loadStoredTheme());
  const localIdentity = useLocalIdentity();
  const [officialPublishResult, setOfficialPublishResult] = useState<{ revision: number } | null>(null);
  const [n1Layer, setN1Layer] = useState<ServiceDeskN1Layer>('principal');
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [selection, setSelection] = useState<Set<CellKey>>(new Set());
  const [clipboard, setClipboard] = useState<Clipboard>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showConflicts, setShowConflicts] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [draftAvailable, setDraftAvailable] = useState(() => loadDraft() !== null);
  const [testDriveAvailable, setTestDriveAvailable] = useState(() => loadTestDriveSession() !== null);
  const [socCompact, setSocCompact] = useState(() => localStorage.getItem('escala-dashboard:soc-compact') === 'true');
  const fileInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>();
  const conflictPanelRef = useRef<HTMLElement>(null);
  const [plannerFocus, setPlannerFocus] = useState<{ technicianId: string; day: number } | null>(null);
  const [publicationPreview, setPublicationPreview] = useState<PublicationPreview | null>(null);
  const [swapRequests, setSwapRequests] = useState<ShiftSwapRequest[] | null>(null);
  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [showDemoManagerAssignmentsDialog, setShowDemoManagerAssignmentsDialog] = useState(false);
  const [showDemoChangeRequestsDialog, setShowDemoChangeRequestsDialog] = useState(false);
  const [showDemoPublishDialog, setShowDemoPublishDialog] = useState(false);
  const [showDemoRemoteResetDialog, setShowDemoRemoteResetDialog] = useState(false);
  const [officialCorporateLink, setOfficialCorporateLink] = useState<Partial<OfficialCorporateLink>>({});
  const [showOfficialPublishDialog, setShowOfficialPublishDialog] = useState(false);
  // Snapshot congelado no momento da validação: o modal de confirmação e o publish() de fato
  // enviado usam SEMPRE estes valores, nunca o estado "vivo" de demoWorkspace/diff - evita que
  // uma edição no rascunho entre "Validar" e "Publicar" deixe o modal (ou o COMMIT) desalinhado
  // com o que foi de fato validado.
  const [demoPublishSnapshot, setDemoPublishSnapshot] = useState<{
    draftPackage: DemoPublicationPackage;
    localDraftRevision: number;
    validation: DemoValidationResult;
    diff: DemoWorkspaceDiff | null;
  } | null>(null);
  const [officialPublishSnapshot, setOfficialPublishSnapshot] = useState<{
    officialPackage: DemoPublicationPackage;
    corporateLink: OfficialCorporateLink;
    validation: OfficialValidationResult;
  } | null>(null);
  const [firebaseBusy, setFirebaseBusy] = useState(false);
  const [templateWizardMode, setTemplateWizardMode] = useState<'empty' | 'demo' | null>(null);
  const demoWorkspaceState = demoWorkspace.state;

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // Navegação principal (FASE 14E) - substitui o antigo alternador local `socView`. É só
  // estado do App, sem router: trocar de seção nunca remonta o componente, então rascunho,
  // seleção, desfazer/refazer e o rascunho do Ambiente Demo continuam intactos.
  const navigate = useCallback((section: AppSection) => {
    setActiveSection(section);
    storeSection(section);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemePreference((prev) => {
      const next = nextTheme(prev);
      storeTheme(next);
      applyTheme(next);
      return next;
    });
  }, []);

  useEffect(() => {
    applyTheme(themePreference);
    if (themePreference !== 'system' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    if (!media) return;
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [themePreference]);

  const isSoc = Boolean(schedule?.visualGrouping === 'operational-shift' && !schedule.serviceDeskN1 && schedule.viewType !== 'oncall');

  useEffect(() => {
    if (!schedule && (activeSection === 'grid' || activeSection === 'planner')) {
      navigate('home');
    } else if (activeSection === 'planner' && !isSoc) {
      navigate('grid');
    }
  }, [schedule, activeSection, isSoc, navigate]);

  const conflicts = useMemo(
    () => (schedule ? detectConflicts(schedule) : []),
    [schedule],
  );

  const visibleSchedule = useMemo(
    () => (schedule?.serviceDeskN1 ? n1VisibleState(schedule, n1Layer) : schedule),
    [schedule, n1Layer],
  );

  const visibleN1Rows = useMemo(
    () => (schedule?.serviceDeskN1 ? n1Rows(schedule, n1Layer) : []),
    [schedule, n1Layer],
  );

  const n1RowsById = useMemo(
    () => Object.fromEntries(visibleN1Rows.map((row) => [row.id, row])),
    [visibleN1Rows],
  );

  const gridConflicts = useMemo(
    () => (schedule?.serviceDeskN1 ? mapN1Conflicts(conflicts, schedule, n1Layer) : conflicts),
    [conflicts, schedule, n1Layer],
  );

  useEffect(() => {
    if (!showConflicts) return;
    conflictPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [showConflicts, activeSection]);

  const openConflictPanel = useCallback(() => {
    setShowConflicts(true);
    window.requestAnimationFrame(() => conflictPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  }, []);

  const demoTeams = useMemo(
    () => [...(demoWorkspaceState?.draftPackage.teams ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    [demoWorkspaceState],
  );

  const demoWorkspaceDiff = useMemo(() => {
    if (!demoWorkspaceState?.dirty) return null;
    return diffDemoPackages(demoWorkspaceState.baselinePackage, demoWorkspaceState.draftPackage);
  }, [demoWorkspaceState]);

  // Publicação Oficial reaproveita o mesmo pacote já carregado pelo fluxo de importação Demo
  // (mesmo parser/adapter) só retitulando workspaceId para ici-dev - não é um pipeline de
  // importação separado. Ver docs/spec/64-ESCALAICI-DASHBOARD-PUBLICACAO-OFICIAL.md.
  const officialPackage = useMemo(
    () => (demoWorkspaceState ? toOfficialPackage(demoWorkspaceState.draftPackage) : null),
    [demoWorkspaceState],
  );

  const resetDemoSchedule = useCallback((teamId: string): boolean => {
    const current = demoWorkspace.state;
    if (!current) return false;
    history.reset(demoPackageToScheduleState(current.draftPackage, teamId));
    setN1Layer('principal');
    setSelection(new Set());
    setClipboard(null);
    return true;
  }, [demoWorkspace, history]);

  const restoreDemoWorkspace = useCallback(() => {
    const confirmed = window.confirm('Esta ação descartará apenas as alterações locais do Ambiente de Demonstração.\n\nNenhum dado real será alterado.\nNenhum dado será enviado ao Firebase.');
    if (!confirmed) return;

    demoWorkspace.restore();
    const restoredState = demoWorkspace.state;
    if (schedule?.demoTeamId && restoredState) {
      history.reset(demoPackageToScheduleState(restoredState.draftPackage, schedule.demoTeamId));
      setN1Layer('principal');
      setSelection(new Set());
      setClipboard(null);
    }
    notify('Cenário de demonstração restaurado.');
  }, [demoWorkspace, history, notify, schedule?.demoTeamId]);

  const exportDemoWorkspace = useCallback(() => {
    const current = demoWorkspace.state;
    if (!current) return;

    const envelope = buildDemoWorkspaceExport(current.draftPackage, current.localDraftRevision);
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = demoWorkspaceExportFileName(current.localDraftRevision);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    notify('Pacote Demo exportado.');
  }, [demoWorkspace, notify]);

  const validateDemoPublication = useCallback(async () => {
    const current = demoWorkspace.state;
    if (!current) return;
    await demoRemotePublication.validate(current.draftPackage, current.localDraftRevision);
  }, [demoWorkspace, demoRemotePublication]);

  const openDemoPublishDialog = useCallback(async () => {
    if (demoRemotePublication.busy !== 'IDLE') return;
    const current = demoWorkspace.state;
    if (!current) return;
    // Revalida o rascunho ATUAL antes de abrir o modal - o usuário pode ter editado a grade
    // depois do último clique em "Validar publicação". O objeto retornado (não o estado
    // `validation` do hook) vira o snapshot congelado do modal/publish, para que nenhuma
    // edição feita enquanto o modal está aberto altere o que de fato será publicado.
    const validation = await demoRemotePublication.validate(current.draftPackage, current.localDraftRevision);
    if (!validation) return;
    setDemoPublishSnapshot({
      draftPackage: current.draftPackage,
      localDraftRevision: current.localDraftRevision,
      validation,
      diff: demoWorkspaceDiff,
    });
    setShowDemoPublishDialog(true);
  }, [demoWorkspace, demoRemotePublication, demoWorkspaceDiff]);

  const confirmDemoPublication = useCallback(async () => {
    const snapshot = demoPublishSnapshot;
    if (!snapshot) return;
    const result = await demoRemotePublication.publish(snapshot.draftPackage, snapshot.localDraftRevision);
    if (!result.ok) return;
    setShowDemoPublishDialog(false);
    setDemoPublishSnapshot(null);
    notify(`Ambiente de Demonstração publicado na revisão ${result.publicationRevision}.`);
  }, [demoPublishSnapshot, demoRemotePublication, notify]);

  const validateOfficialPublication = useCallback(async () => {
    if (!officialPackage || !officialCorporateLink.memberId || !officialCorporateLink.teamId) return;
    await officialRemotePublication.validate(officialPackage, officialCorporateLink as OfficialCorporateLink);
  }, [officialPackage, officialCorporateLink, officialRemotePublication]);

  const openOfficialPublishDialog = useCallback(async () => {
    if (officialRemotePublication.busy !== 'IDLE') return;
    if (!officialPackage || !officialCorporateLink.memberId || !officialCorporateLink.teamId) return;
    const link = officialCorporateLink as OfficialCorporateLink;
    // Mesmo raciocínio do snapshot Demo (ver openDemoPublishDialog acima): revalida o pacote
    // atual e congela o resultado - o modal e o publish() usam sempre este snapshot, nunca o
    // estado "vivo", para não publicar algo diferente do que foi mostrado na confirmação.
    const validation = await officialRemotePublication.validate(officialPackage, link);
    if (!validation) return;
    setOfficialPublishSnapshot({ officialPackage, corporateLink: link, validation });
    setOfficialPublishResult(null);
    setShowOfficialPublishDialog(true);
  }, [officialPackage, officialCorporateLink, officialRemotePublication]);

  const confirmOfficialPublication = useCallback(async () => {
    const snapshot = officialPublishSnapshot;
    if (!snapshot) return;
    const result = await officialRemotePublication.publish(snapshot.officialPackage, snapshot.corporateLink);
    if (!result.ok) return;
    setShowOfficialPublishDialog(false);
    setOfficialPublishSnapshot(null);
    setOfficialPublishResult({ revision: result.publicationRevision });
    notify(`Workspace oficial ici-dev publicado na revisão ${result.publicationRevision}.`);
  }, [officialPublishSnapshot, officialRemotePublication, notify]);

  const confirmDemoRemoteReset = useCallback(async () => {
    const result = await demoRemotePublication.resetRemote();
    if (!result.ok) return;
    setShowDemoRemoteResetDialog(false);
    notify('Demo publicado restaurado no Firebase.');
  }, [demoRemotePublication, notify]);

  const loadDemoWorkspace = useCallback(async () => {
    const loaded = await demoWorkspace.load({ resumePersisted: true });
    if (!loaded) {
      notify(demoWorkspace.validationError?.message ?? 'Não foi possível carregar o Ambiente de Demonstração.');
      return;
    }
    const firstTeamId = [...(demoWorkspace.state?.draftPackage.teams ?? [])]
      .sort((a, b) => a.id.localeCompare(b.id))[0]?.id;
    if (!firstTeamId || !resetDemoSchedule(firstTeamId)) {
      notify('O Ambiente de Demonstração não possui time carregável.');
      return;
    }
    navigate('demo');
    notify('Ambiente de Demonstração carregado.');
  }, [demoWorkspace, notify, resetDemoSchedule, navigate]);

  /* ---------- Importação ---------- */

  const openFile = useCallback(
    async (file: File) => {
      try {
        const buf = await file.arrayBuffer();
        const wb = readWorkbook(buf);
        const analysis = analyzeWorkbook(wb, file.name);
        setPending({ wb, analysis });
      } catch (err) {
        notify(`Não foi possível ler “${file.name}”: ${(err as Error).message}`);
      }
    },
    [notify],
  );

  const confirmImport = useCallback(
    (optionKey: string) => {
      if (!pending) return;
      try {
        const option = pending.analysis.options.find((item) => item.key === optionKey);
        if (firebaseDashboard.selectedTeam && option && !firebaseDashboard.selectedTeam.allowedImportLayouts.includes(option.layout)) {
          const confirmed = window.confirm(`O layout ${option.layout} não está permitido para ${firebaseDashboard.selectedTeam.name}. Deseja importar apenas para revisar, sem publicação automática?`);
          if (!confirmed) return;
        }
        const result = buildSchedule(pending.wb, pending.analysis, optionKey);
        history.reset({ ...result.state, sourceFileName: pending.analysis.fileName, sourceSheet: option?.sheetName, sourceLayout: option?.layout });
        setN1Layer('principal');
        setSelection(new Set());
        setClipboard(null);
        setPending(null);
        navigate('grid');
        notify(
          result.state.viewType === 'oncall'
            ? `Importados ${result.importedRecords ?? result.state.onCallRecords?.length ?? 0} plantões de ${result.state.technicians.length} plantonistas.`
            : `Importado: ${result.state.technicians.length} técnicos, ${result.recognizedShifts} registros reconhecidos, ${result.customShifts} personalizados.`,
        );
      } catch (err) {
        notify(`Falha na importação: ${(err as Error).message}`);
      }
    },
    [pending, history, notify, firebaseDashboard.selectedTeam, navigate],
  );

  const openPublication = useCallback(async () => {
    if (!schedule || !firebaseDashboard.user || !firebaseDashboard.selectedTeam) return;
    setFirebaseBusy(true);
    try { setPublicationPreview(await buildPublicationPreview(schedule, firebaseDashboard.selectedTeam, firebaseDashboard.user, conflicts)); }
    catch (error) { firebaseDashboard.setError((error as Error).message); }
    finally { setFirebaseBusy(false); }
  }, [schedule, firebaseDashboard.user, firebaseDashboard.selectedTeam, conflicts, firebaseDashboard.setError]);

  const confirmPublication = useCallback(async (mode: PublicationMode) => {
    if (!publicationPreview) return;
    setFirebaseBusy(true);
    try { await publishStructuredSchedule(publicationPreview, mode); setPublicationPreview(null); notify('Escala publicada nas coleções estruturadas do Escala ICI.'); }
    catch (error) { firebaseDashboard.setError((error as Error).message); }
    finally { setFirebaseBusy(false); }
  }, [publicationPreview, notify, firebaseDashboard.setError]);

  const openSwaps = useCallback(async () => {
    if (!firebaseDashboard.user) return;
    setFirebaseBusy(true);
    try { setSwapRequests(await loadSwapRequests(firebaseDashboard.user, firebaseDashboard.teams)); }
    catch (error) { firebaseDashboard.setError((error as Error).message); }
    finally { setFirebaseBusy(false); }
  }, [firebaseDashboard.user, firebaseDashboard.teams, firebaseDashboard.setError]);

  const decideSwap = useCallback(async (request: ShiftSwapRequest, decision: 'APPROVED' | 'REJECTED') => {
    if (!firebaseDashboard.user) return;
    setFirebaseBusy(true);
    try { await decideSwapRequest(firebaseDashboard.user, firebaseDashboard.teams, request, decision); setSwapRequests((current) => current?.filter((item) => item.id !== request.id) ?? null); notify(`Solicitação ${decision === 'APPROVED' ? 'aprovada' : 'rejeitada'}. Alterações na escala continuam manuais quando os dois assignments não estão identificados.`); }
    catch (error) { firebaseDashboard.setError((error as Error).message); }
    finally { setFirebaseBusy(false); }
  }, [firebaseDashboard.user, firebaseDashboard.teams, firebaseDashboard.setError, notify]);

  /* ---------- Edição ---------- */

  const mutate = useCallback(
    (fn: (draft: ScheduleState) => ScheduleState) => {
      history.set((prev) => (prev ? fn(prev) : prev));
    },
    [history],
  );

  const mutateVisibleCells = useCallback(
    (fn: (cells: ScheduleState['cells']) => ScheduleState['cells']) => {
      mutate((prev) =>
        prev.serviceDeskN1
          ? updateN1Cells(prev, n1Layer, fn)
          : { ...prev, cells: fn(prev.cells) },
      );
    },
    [mutate, n1Layer],
  );

  const applyShift = useCallback(
    (keys: CellKey[], value: CellValue | null) => {
      mutateVisibleCells((current) => {
        const cells = { ...current };
        for (const k of keys) {
          const [techId, dayStr] = k.split(':');
          const day = Number(dayStr);
          const row = { ...(cells[techId] ?? {}) };
          if (value) row[day] = value;
          else delete row[day];
          cells[techId] = row;
        }
        return cells;
      });
    },
    [mutateVisibleCells],
  );

  const copyValueTo = useCallback(
    (source: CellKey, target: CellKey) => {
      mutateVisibleCells((current) => {
        const [sTech, sDay] = source.split(':');
        const v = current[sTech]?.[Number(sDay)];
        const [tTech, tDay] = target.split(':');
        const cells = { ...current };
        const row = { ...(cells[tTech] ?? {}) };
        if (v) row[Number(tDay)] = v;
        else delete row[Number(tDay)];
        cells[tTech] = row;
        return cells;
      });
    },
    [mutateVisibleCells],
  );

  const fillRange = useCallback(
    (techId: string, fromDay: number, toDay: number, value: CellValue | null) => {
      const [d1, d2] = [Math.min(fromDay, toDay), Math.max(fromDay, toDay)];
      const keys: CellKey[] = [];
      for (let d = d1; d <= d2; d++) keys.push(cellKey(techId, d));
      applyShift(keys, value);
      notify(`Dias ${d1}–${d2} preenchidos.`);
    },
    [applyShift, notify],
  );

  const copyDay = useCallback(
    (day: number) => {
      if (!visibleSchedule) return;
      const values: Record<string, CellValue | undefined> = {};
      for (const t of visibleSchedule.technicians) values[t.id] = visibleSchedule.cells[t.id]?.[day];
      setClipboard({ kind: 'day', values });
      notify(`Dia ${day} copiado.`);
    },
    [visibleSchedule, notify],
  );

  const pasteDay = useCallback(
    (day: number) => {
      if (clipboard?.kind !== 'day' || !visibleSchedule) return;
      mutateVisibleCells((current) => {
        const cells = { ...current };
        for (const t of visibleSchedule.technicians) {
          const v = clipboard.values[t.id];
          const row = { ...(cells[t.id] ?? {}) };
          if (v) row[day] = v;
          else delete row[day];
          cells[t.id] = row;
        }
        return cells;
      });
      notify(`Escala colada no dia ${day}.`);
    },
    [clipboard, mutateVisibleCells, notify, visibleSchedule],
  );

  const clearDay = useCallback(
    (day: number) => {
      if (!visibleSchedule) return;
      mutateVisibleCells((current) => {
        const cells = { ...current };
        for (const t of visibleSchedule.technicians) {
          const row = { ...(cells[t.id] ?? {}) };
          delete row[day];
          cells[t.id] = row;
        }
        return cells;
      });
      notify(`Dia ${day} limpo.`);
    },
    [mutateVisibleCells, notify, visibleSchedule],
  );

  const copyWeek = useCallback(
    (startDay: number) => {
      if (!visibleSchedule) return;
      const values: Record<string, (CellValue | undefined)[]> = {};
      for (const t of visibleSchedule.technicians) {
        values[t.id] = Array.from({ length: 7 }, (_, i) => visibleSchedule.cells[t.id]?.[startDay + i]);
      }
      setClipboard({ kind: 'week', values });
      notify(`Semana copiada (dias ${startDay}–${startDay + 6}).`);
    },
    [visibleSchedule, notify],
  );

  const pasteWeek = useCallback(
    (startDay: number) => {
      if (clipboard?.kind !== 'week' || !visibleSchedule) return;
      mutateVisibleCells((current) => {
        const total = scheduleDates(visibleSchedule).length;
        const cells = { ...current };
        for (const t of visibleSchedule.technicians) {
          const src = clipboard.values[t.id] ?? [];
          const row = { ...(cells[t.id] ?? {}) };
          for (let i = 0; i < 7; i++) {
            const day = startDay + i;
            if (day > total) break;
            const v = src[i];
            if (v) row[day] = v;
            else delete row[day];
          }
          cells[t.id] = row;
        }
        return cells;
      });
      notify(`Semana colada a partir do dia ${startDay}.`);
    },
    [clipboard, mutateVisibleCells, notify, visibleSchedule],
  );

  /* ---------- Técnicos ---------- */

  const addTechnician = useCallback(
    (login: string, name: string) => {
      if (schedule?.origin === 'demo-workspace-package') {
        notify('A composição de membros do Ambiente de Demonstração é fixa pela fixture oficial.');
        return;
      }
      mutate((prev) => {
        if (prev.serviceDeskN1) {
          const fullName = formatN1Name(name || 'Novo técnico');
          const technicianId = newTechId();
          const row: ServiceDeskN1Row = {
            id: `n1-new-${newTechId()}`,
            technicianId,
            personKey: fold(fullName),
            fullName,
            displayName: shortN1Name(fullName),
            employeeCode: login || undefined,
            shift: 'manha',
            pauseTime: '11:00',
            cells: {},
          };
          return updateN1Rows(prev, n1Layer, (rows) => [...rows, row]);
        }
        return {
          ...prev,
          technicians: [
            ...prev.technicians,
            {
              id: newTechId(),
              login: login ? login.toLowerCase() : undefined,
              name: name || undefined,
            },
          ],
        };
      });
      notify('Técnico adicionado.');
    },
    [mutate, notify, n1Layer, schedule?.origin],
  );

  const editTechnician = useCallback(
    (id: string, login: string, name: string) => {
      if (schedule?.origin === 'demo-workspace-package') {
        notify('A composição de membros do Ambiente de Demonstração é fixa pela fixture oficial.');
        return;
      }
      mutate((prev) => {
        if (prev.serviceDeskN1) {
          const target = [...prev.serviceDeskN1.principalRows, ...prev.serviceDeskN1.emailGuaranteeRows]
            .find((row) => row.id === id);
          if (!target) return prev;
          const fullName = formatN1Name(name || target.fullName);
          const update = (row: ServiceDeskN1Row): ServiceDeskN1Row =>
            row.technicianId === target.technicianId
              ? {
                  ...row,
                  fullName,
                  displayName: shortN1Name(fullName),
                  personKey: fold(fullName),
                  employeeCode: login || undefined,
                }
              : row;
          return syncN1Aggregate({
            ...prev,
            serviceDeskN1: {
              ...prev.serviceDeskN1,
              principalRows: prev.serviceDeskN1.principalRows.map(update),
              emailGuaranteeRows: prev.serviceDeskN1.emailGuaranteeRows.map(update),
            },
          });
        }
        return {
          ...prev,
          technicians: prev.technicians.map((t) =>
            t.id === id
              ? { ...t, login: login ? login.toLowerCase() : undefined, name: name || undefined }
              : t,
          ),
        };
      });
    },
    [mutate, notify, schedule?.origin],
  );

  const removeTechnician = useCallback(
    (id: string) => {
      if (schedule?.origin === 'demo-workspace-package') {
        notify('A composição de membros do Ambiente de Demonstração é fixa pela fixture oficial.');
        return;
      }
      mutate((prev) => {
        if (prev.serviceDeskN1) {
          return updateN1Rows(prev, n1Layer, (rows) => rows.filter((row) => row.id !== id));
        }
        const cells = { ...prev.cells };
        delete cells[id];
        return {
          ...prev,
          technicians: prev.technicians.filter((t) => t.id !== id),
          cells,
        };
      });
      setSelection((sel) => {
        const next = new Set([...sel].filter((k) => !k.startsWith(`${id}:`)));
        return next.size === sel.size ? sel : next;
      });
      notify('Técnico removido.');
    },
    [mutate, notify, n1Layer, schedule?.origin],
  );

  const updateN1Pause = useCallback(
    (rowId: string, pauseTime: string) => {
      mutate((prev) => {
        if (!prev.serviceDeskN1) return prev;
        const target = n1Rows(prev, n1Layer).find((row) => row.id === rowId);
        if (!target) return prev;
        const updateCurrent = (row: ServiceDeskN1Row) =>
          row.id === rowId ? { ...row, pauseTime: pauseTime || undefined } : row;
        const updateLinked = (row: ServiceDeskN1Row) =>
          row.technicianId === target.technicianId ? { ...row, pauseTime: pauseTime || undefined } : row;
        return syncN1Aggregate({
          ...prev,
          serviceDeskN1: {
            ...prev.serviceDeskN1,
            principalRows: n1Layer === 'principal'
              ? prev.serviceDeskN1.principalRows.map(updateCurrent)
              : prev.serviceDeskN1.principalRows.map(updateLinked),
            emailGuaranteeRows: n1Layer === 'email-garantia'
              ? prev.serviceDeskN1.emailGuaranteeRows.map(updateCurrent)
              : prev.serviceDeskN1.emailGuaranteeRows.map(updateLinked),
          },
        });
      });
    },
    [mutate, n1Layer],
  );

  const updateN1Shift = useCallback(
    (rowId: string, shift: ServiceDeskN1Shift) => {
      mutate((prev) => {
        if (!prev.serviceDeskN1) return prev;
        const target = n1Rows(prev, n1Layer).find((row) => row.id === rowId);
        if (!target) return prev;
        const updateCurrent = (row: ServiceDeskN1Row) => row.id === rowId ? { ...row, shift } : row;
        const updateLinked = (row: ServiceDeskN1Row) => row.technicianId === target.technicianId ? { ...row, shift } : row;
        return syncN1Aggregate({
          ...prev,
          serviceDeskN1: {
            ...prev.serviceDeskN1,
            principalRows: n1Layer === 'principal'
              ? prev.serviceDeskN1.principalRows.map(updateCurrent)
              : prev.serviceDeskN1.principalRows.map(updateLinked),
            emailGuaranteeRows: n1Layer === 'email-garantia'
              ? prev.serviceDeskN1.emailGuaranteeRows.map(updateCurrent)
              : prev.serviceDeskN1.emailGuaranteeRows.map(updateLinked),
          },
        });
      });
    },
    [mutate, n1Layer],
  );


  const updateOnCallRecord = useCallback(
    (record: NonNullable<ScheduleState['onCallRecords']>[number]) => {
      const start = new Date(record.start).getTime();
      const end = new Date(record.end).getTime();
      const durationMinutes = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 60000)) : record.durationMinutes;
      mutate((prev) => ({
        ...prev,
        onCallRecords: (prev.onCallRecords ?? []).map((item) => item.id === record.id ? { ...record, durationMinutes } : item),
      }));
    },
    [mutate],
  );

  const addOnCallRecord = useCallback(
    (record: NonNullable<ScheduleState['onCallRecords']>[number]) => {
      const start = new Date(record.start).getTime();
      const end = new Date(record.end).getTime();
      const durationMinutes = Number.isFinite(start) && Number.isFinite(end)
        ? Math.max(0, Math.round((end - start) / 60000))
        : record.durationMinutes;
      mutate((prev) => {
        const key = fold(record.technician);
        const hasTechnician = prev.technicians.some((technician) => fold(technician.name ?? '') === key);
        return {
          ...prev,
          technicians: hasTechnician
            ? prev.technicians
            : [...prev.technicians, { id: newTechId(), name: record.technician.trim() }],
          onCallRecords: [...(prev.onCallRecords ?? []), { ...record, durationMinutes }]
            .sort((a, b) => a.start.localeCompare(b.start) || a.technician.localeCompare(b.technician, 'pt-BR')),
        };
      });
    },
    [mutate],
  );

  const deleteOnCallRecord = useCallback(
    (recordId: string) => mutate((prev) => ({
      ...prev,
      onCallRecords: (prev.onCallRecords ?? []).filter((record) => record.id !== recordId),
    })),
    [mutate],
  );

  const moveOnCallRecord = useCallback(
    (recordId: string, dateIso: string) => mutate((prev) => ({
      ...prev,
      onCallRecords: (prev.onCallRecords ?? [])
        .map((record) => record.id === recordId ? moveOnCallRecordToDate(record, dateIso) : record)
        .sort((a, b) => a.start.localeCompare(b.start) || a.technician.localeCompare(b.technician, 'pt-BR')),
    })),
    [mutate],
  );

  const addOnCallTechnicians = useCallback(
    (names: string[]) => mutate((prev) => {
      const existing = new Set(prev.technicians.map((technician) => fold(technician.name ?? '')));
      const additions = names
        .map((name) => name.trim())
        .filter((name) => name && !existing.has(fold(name)))
        .map((name) => {
          existing.add(fold(name));
          return { id: newTechId(), name };
        });
      return { ...prev, technicians: [...prev.technicians, ...additions] };
    }),
    [mutate],
  );

  const renameOnCallTechnician = useCallback(
    (technicianId: string, name: string) => mutate((prev) => {
      const current = prev.technicians.find((technician) => technician.id === technicianId);
      if (!current) return prev;
      const oldName = current.name ?? '';
      return {
        ...prev,
        technicians: prev.technicians.map((technician) => technician.id === technicianId ? { ...technician, name } : technician),
        onCallRecords: (prev.onCallRecords ?? []).map((record) => record.technician === oldName ? { ...record, technician: name } : record),
      };
    }),
    [mutate],
  );

  const setOnCallTechnicianColor = useCallback(
    (technicianId: string, color: string) => mutate((prev) => ({
      ...prev,
      technicians: prev.technicians.map((technician) =>
        technician.id === technicianId ? { ...technician, color } : technician,
      ),
    })),
    [mutate],
  );

  const removeOnCallTechnician = useCallback(
    (technicianId: string) => {
      const technician = schedule?.technicians.find((item) => item.id === technicianId);
      if (!technician) return;
      const hasRecords = schedule?.onCallRecords?.some((record) => record.technician === technician.name);
      if (hasRecords && !window.confirm(`“${technician.name}” possui plantões. Remover apenas da lista de nomes disponíveis? Os plantões existentes serão mantidos.`)) return;
      mutate((prev) => ({ ...prev, technicians: prev.technicians.filter((item) => item.id !== technicianId) }));
    },
    [mutate, schedule],
  );

  const setOnCallMonth = useCallback(
    (monthKey: ScheduleState['monthKey']) => mutate((prev) => ({ ...prev, monthKey, dates: cycle25To26(monthKey).dates })),
    [mutate],
  );

  const autoFillOnCallMonth = useCallback(
    () => mutate((prev) => ({
      ...prev,
      onCallRecords: autoFillOperationalCycle(prev.onCallRecords ?? [], prev.technicians, prev.monthKey, () => `plantao-${newTechId()}`),
    })),
    [mutate],
  );

  const clearOnCallMonth = useCallback(
    () => mutate((prev) => ({
      ...prev,
      onCallRecords: (prev.onCallRecords ?? []).filter((record) => !startsInOperationalCycle(record, prev.monthKey)),
    })),
    [mutate],
  );

  /* ---------- Rascunho, teclado ---------- */

  useEffect(() => {
    if (!schedule) return;
    const id = window.setTimeout(() => {
      if (schedule.origin === 'demo-template') {
        saveTestDriveSession(schedule);
      } else if (schedule.origin === 'demo-workspace-package') {
        if (!schedule.demoTeamId || !demoWorkspace.state) return;
        const next = applyScheduleStateToPackage(demoWorkspace.state.draftPackage, schedule, schedule.demoTeamId);
        if (JSON.stringify(next.scheduleAssignments) !== JSON.stringify(demoWorkspace.state.draftPackage.scheduleAssignments)) {
          demoWorkspace.updateDraft((draft) => applyScheduleStateToPackage(draft, schedule, schedule.demoTeamId!));
        }
      } else {
        saveDraft(schedule, firebaseDashboard.selectedTeamId || undefined);
      }
    }, 800);
    return () => window.clearTimeout(id);
  }, [schedule, firebaseDashboard.selectedTeamId, demoWorkspace]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        history.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size > 0) {
        e.preventDefault();
        applyShift([...selection], null);
      } else if (e.key === 'Escape') {
        setSelection(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, selection, applyShift]);

  /* ---------- Render ---------- */

  const monthTitle = schedule
    ? schedule.viewType === 'oncall'
      ? `Plantões · ${periodLabel(schedule)}`
      : schedule.dates?.length
        ? periodLabel(schedule)
        : `${MONTHS_PT_TITLE[schedule.monthKey.month - 1]} de ${schedule.monthKey.year}`
    : '';

  const importedN1Legend = schedule?.serviceDeskN1
    ? (n1Layer === 'principal'
        ? schedule.serviceDeskN1.principalLegend ?? []
        : schedule.serviceDeskN1.emailGuaranteeLegend ?? [])
    : [];
  const n1Codes = importedN1Legend.length
    ? importedN1Legend.map((item) => ({ code: item.code, label: item.description, description: item.description }))
    : n1Layer === 'principal'
      ? N1_PRIMARY_CODES
      : N1_EMAIL_GUARANTEE_CODES;

  const officialEligibleCount = officialPackage ? eligibleOfficialMembers(officialPackage).length : 0;

  const homeSummary: HomeSummary = {
    hasSchedule: Boolean(schedule),
    scheduleTypeLabel: schedule ? scheduleTypeLabel(schedule) : null,
    periodLabel: schedule ? monthTitle : null,
    peopleCount: schedule?.technicians.length ?? 0,
    assignmentsCount: schedule ? countScheduleAssignments(schedule) : 0,
    localDraftAvailable: draftAvailable,
    testDriveAvailable,
    demoWorkspaceLoaded: Boolean(demoWorkspaceState),
    demoWorkspaceDirty: demoWorkspaceState?.dirty ?? false,
    demoContinueAvailable: demoWorkspace.hasPersistedDraft,
    officialPackageLoaded: Boolean(officialPackage),
    officialEligibleMemberCount: officialEligibleCount,
    backendStatus: demoRemotePublication.backendStatus !== 'UNKNOWN' ? demoRemotePublication.backendStatus : officialRemotePublication.backendStatus,
    firebaseAdminConfigured: demoRemotePublication.firebaseAdminStatus?.configured ?? officialRemotePublication.firebaseAdminStatus?.configured ?? null,
  };

  // Estado de cada item da navegação (FASE 14E): "Grade"/"Planejador" desabilitam com
  // explicação quando não há como mostrar nada útil ali, em vez de aparecerem vazios ou
  // simplesmente não funcionarem. "Ambiente Demo" ganha um badge quando é a origem da
  // escala em edição, para o usuário nunca perder de vista em qual ambiente está mesmo
  // com o cabeçalho recolhido.
  const sectionState: Partial<Record<AppSection, AppShellSectionState>> = {};
  if (!schedule) {
    sectionState.grid = { disabled: true, reason: 'Carregue ou importe uma escala primeiro.' };
    sectionState.planner = { disabled: true, reason: 'Carregue ou importe uma escala primeiro.' };
  } else if (!isSoc) {
    sectionState.planner = { disabled: true, reason: 'Disponível apenas para escalas SOC/NOC rotativas.' };
  }
  if (schedule?.origin === 'demo-workspace-package') {
    sectionState.demo = { badge: 'ativo' };
  }

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void openFile(f);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept=".xls,.xlsx,.xlsm"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openFile(f);
          e.target.value = '';
        }}
      />

      <AppShell
        activeSection={activeSection}
        onNavigate={navigate}
        navCollapsed={navCollapsed}
        onToggleNavCollapsed={() => setNavCollapsed((prev) => { const next = !prev; storeNavCollapsed(next); return next; })}
        uiCompact={uiCompact}
        onToggleUiCompact={() => setUiCompact((prev) => { const next = !prev; storeUiCompact(next); return next; })}
        themePreference={themePreference}
        onCycleTheme={cycleTheme}
        sectionState={sectionState}
        identityBar={(
          <LocalIdentityBar
            identity={localIdentity.identity}
            activeTeam={localIdentity.activeTeam}
            onSetChefeName={localIdentity.setChefeName}
            onAddTeam={localIdentity.addTeam}
            onSetActiveTeam={localIdentity.setActiveTeam}
          />
        )}
        footer={schedule && schedule.origin !== 'demo-workspace-package' ? (
          <span className="shell-draft-note">
            rascunho salvo automaticamente
            {' · '}
            <button
              className="icon-btn"
              onClick={() => {
                if (schedule.origin === 'demo-template') {
                  endTestDrive();
                  setTestDriveAvailable(false);
                  notify('Dados fictícios do Test Drive apagados.');
                } else {
                  clearDraft(schedule, firebaseDashboard.selectedTeamId || undefined);
                  setDraftAvailable(false);
                  notify('Rascunho local apagado.');
                }
              }}
            >
              apagar rascunho
            </button>
          </span>
        ) : null}
        topBar={
          <>
            <header className="topbar">
              <div className="brand">
                Painel de Escalas
                <small>v1.14.0 · Início → Importar → Planejador/Grade → Demo/Oficial</small>
              </div>
              {schedule && (
                <>
                  <div className="month-title">
                    {monthTitle}
                    {schedule.isDemo && <span className="badge-demo">dados fictícios</span>}
                    {schedule.sourceLabel && !schedule.isDemo && (
                      <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
                        {schedule.sourceLabel}
                      </span>
                    )}
                  </div>
                  <div className="toolbar" role="toolbar" aria-label="Ações da escala">
                    <button className="btn" onClick={() => fileInput.current?.click()}>
                      Importar arquivo
                    </button>
                    {(activeSection === 'grid' || activeSection === 'planner') && (
                      <>
                        <button className="btn" onClick={history.undo} disabled={!history.canUndo}>
                          Desfazer
                        </button>
                        <button className="btn" onClick={history.redo} disabled={!history.canRedo}>
                          Refazer
                        </button>
                        {schedule.viewType !== 'oncall' && (
                          <button
                            className="btn"
                            disabled={selection.size === 0}
                            onClick={() => {
                              applyShift([...selection], null);
                              notify('Seleção limpa.');
                            }}
                          >
                            Limpar seleção
                          </button>
                        )}
                      </>
                    )}
                    <button
                      className="btn"
                      onClick={() => {
                        if (schedule.origin === 'demo-template') {
                          saveTestDriveSession(schedule);
                          setTestDriveAvailable(true);
                          notify('Test Drive salvo neste navegador.');
                        } else if (schedule.origin === 'demo-workspace-package') {
                          demoWorkspace.saveLocalRevision();
                          notify('Revisão local do Ambiente de Demonstração registrada neste navegador.');
                        } else {
                          saveDraft(schedule, firebaseDashboard.selectedTeamId || undefined);
                          setDraftAvailable(true);
                          notify('Rascunho salvo neste navegador.');
                        }
                      }}
                    >
                      Salvar rascunho
                    </button>
                    <button className="btn btn-primary" onClick={() => exportScheduleFile(schedule)}>
                      Exportar XLSX
                    </button>
                    {(activeSection === 'grid' || activeSection === 'planner') && schedule.viewType !== 'oncall' && (
                      <button
                        className={`conflict-chip${conflicts.length ? ' has' : ''}`}
                        aria-pressed={showConflicts}
                        onClick={openConflictPanel}
                      >
                        Alertas: {conflicts.length}
                      </button>
                    )}
                  </div>
                </>
              )}
            </header>

            <FirebaseDashboardBar
              configured={firebaseDashboard.configured}
              user={firebaseDashboard.user}
              teams={firebaseDashboard.teams}
              selectedTeamId={firebaseDashboard.selectedTeamId}
              loading={firebaseDashboard.loading || firebaseBusy}
              error={firebaseDashboard.error}
              hasSchedule={Boolean(schedule)}
              canPublish={Boolean(schedule && firebaseDashboard.user && firebaseDashboard.selectedTeam && !schedule.isDemo && schedule.technicians.length && (schedule.viewType === 'oncall' ? schedule.onCallRecords?.length : Object.values(schedule.cells).some((row) => Object.values(row).some(Boolean))))}
              onTeamChange={firebaseDashboard.setSelectedTeamId}
              onLogin={() => { firebaseDashboard.setError(null); void signInWithMicrosoft().catch((error) => firebaseDashboard.setError((error as Error).message)); }}
              onLogout={() => void signOutDashboard().catch((error) => firebaseDashboard.setError((error as Error).message))}
              onImport={() => fileInput.current?.click()}
              onSaveDraft={() => {
                if (schedule?.origin === 'demo-template') {
                  saveTestDriveSession(schedule);
                  setTestDriveAvailable(true);
                  notify('Test Drive salvo neste navegador.');
                } else if (schedule?.origin === 'demo-workspace-package') {
                  demoWorkspace.saveLocalRevision();
                  notify('Revisão local do Ambiente de Demonstração registrada neste navegador.');
                } else if (schedule && firebaseDashboard.selectedTeam) {
                  saveDraft(schedule, firebaseDashboard.selectedTeam.id);
                  setDraftAvailable(true);
                  notify(`Rascunho salvo para ${firebaseDashboard.selectedTeam.name}.`);
                }
              }}
              onPublish={() => void openPublication()}
              onSwaps={() => void openSwaps()}
              onManageTeams={() => setShowTeamDialog(true)}
            />

            {schedule && schedule.origin === 'demo-template' && (
              <div className="n1-modebar" role="status">
                <div>
                  <strong>Test Drive — dados fictícios salvos somente neste navegador</strong>
                </div>
                <button
                  className="btn"
                  onClick={() => {
                    endTestDrive();
                    history.reset(null);
                    setTestDriveAvailable(false);
                    navigate('home');
                    notify('Dados fictícios do Test Drive apagados.');
                  }}
                >
                  Encerrar Test Drive e apagar dados locais
                </button>
              </div>
            )}

            {schedule && schedule.origin === 'demo-workspace-package' && (
              <DemoWorkspaceBanner
                workspaceId={demoWorkspaceState?.workspaceId ?? 'demo-v1'}
                sourcePublicationRevision={demoWorkspaceState?.sourcePublicationRevision ?? 1}
                dirty={demoWorkspaceState?.dirty ?? false}
              />
            )}
          </>
        }
      >
        {activeSection === 'home' && (
          <Home
            summary={homeSummary}
            onCreateEmpty={() => {
              if (draftAvailable && !window.confirm('Já existe um rascunho salvo. Criar uma nova escala vazia pode sobrescrevê-lo. Deseja continuar?')) return;
              setTemplateWizardMode('empty');
            }}
            onStartImport={() => {
              navigate('import');
              fileInput.current?.click();
            }}
            onOpenDraft={() => {
              const d = loadDraft();
              if (d) {
                history.reset(d.state);
                navigate('grid');
                notify(`Rascunho de ${new Date(d.savedAt).toLocaleString('pt-BR')} restaurado.`);
              } else {
                setDraftAvailable(false);
                notify('Nenhum rascunho válido encontrado.');
              }
            }}
            onStartTestDrive={() => {
              if (testDriveAvailable && !window.confirm('Já existe um Test Drive salvo. Iniciar um novo vai sobrescrevê-lo. Deseja continuar?')) return;
              setTemplateWizardMode('demo');
            }}
            onContinueTestDrive={() => {
              const session = loadTestDriveSession();
              if (session) {
                history.reset(session.state);
                navigate('grid');
                notify(`Test Drive de ${new Date(session.savedAt).toLocaleString('pt-BR')} restaurado.`);
              } else {
                setTestDriveAvailable(false);
                notify('Nenhum Test Drive válido encontrado.');
              }
            }}
            onOpenDemoWorkspace={() => void loadDemoWorkspace()}
            onContinueDemoWorkspace={() => void loadDemoWorkspace()}
            onPrepareOfficial={() => navigate('official')}
            onViewStatus={() => navigate('status')}
          />
        )}

        {activeSection === 'import' && (
          <main className="empty">
            <div className={`dropzone${dragOver ? ' dragover' : ''}`}>
              <h1>Importar planilha de escala</h1>
              <p>
                Arraste um arquivo .xls ou .xlsx para cá, ou use o botão abaixo. O painel
                identifica as abas e os meses e você escolhe o período ou bloco que deseja
                importar.
              </p>
              <div className="empty-actions">
                <button className="btn btn-primary" onClick={() => fileInput.current?.click()}>
                  Importar arquivo
                </button>
                <button className="btn btn-ghost" onClick={() => navigate('home')}>
                  Voltar ao Início
                </button>
              </div>
              <div className="flow">
                Importar arquivo → escolher período/bloco → revisar → editar → salvar ou exportar
              </div>
            </div>
          </main>
        )}

        {activeSection === 'grid' && schedule && schedule.viewType === 'oncall' && (
          <OnCallEditor
            records={schedule.onCallRecords ?? []}
            technicians={schedule.technicians}
            monthKey={schedule.monthKey}
            onChange={updateOnCallRecord}
            onAddRecord={addOnCallRecord}
            onDeleteRecord={deleteOnCallRecord}
            onMoveRecord={moveOnCallRecord}
            onAddTechnicians={addOnCallTechnicians}
            onRenameTechnician={renameOnCallTechnician}
            onSetTechnicianColor={setOnCallTechnicianColor}
            onRemoveTechnician={removeOnCallTechnician}
            onSetMonth={setOnCallMonth}
            onAutoFill={autoFillOnCallMonth}
            onClearMonth={clearOnCallMonth}
          />
        )}

        {activeSection === 'grid' && schedule && schedule.viewType !== 'oncall' && (
          <>
            {schedule.serviceDeskN1 && (
              <div className="n1-modebar" aria-label="Visualização Service Desk N1">
                <div>
                  <strong>Modo Service Desk N1</strong>
                  <span>turnos, pausas e atividades vinculados ao mesmo técnico</span>
                </div>
                <div className="n1-tabs" role="tablist" aria-label="Escalas do Service Desk N1">
                  <button
                    role="tab"
                    aria-selected={n1Layer === 'principal'}
                    className="btn"
                    onClick={() => {
                      setN1Layer('principal');
                      setSelection(new Set());
                      setClipboard(null);
                    }}
                  >
                    Escala principal
                  </button>
                  <button
                    role="tab"
                    aria-selected={n1Layer === 'email-garantia'}
                    className="btn"
                    disabled={schedule.serviceDeskN1.emailGuaranteeRows.length === 0}
                    title={schedule.serviceDeskN1.emailGuaranteeRows.length === 0 ? 'Esta aba não possui escala de e-mail e garantia.' : undefined}
                    onClick={() => {
                      setN1Layer('email-garantia');
                      setSelection(new Set());
                      setClipboard(null);
                    }}
                  >
                    E-mail e garantia
                  </button>
                </div>
                <span className="n1-layer-summary">
                  {visibleN1Rows.length} linha{visibleN1Rows.length === 1 ? '' : 's'} · nomes abreviados na grade; nome completo preservado
                </span>
              </div>
            )}

            <div className="legend" aria-label="Legenda e preenchimento rápido">
              <span className="hint">
                {selection.size > 0
                  ? `Clique em um código para aplicar às ${selection.size} células selecionadas:`
                  : schedule.serviceDeskN1
                    ? `Legenda da ${n1Layer === 'principal' ? 'escala principal' : 'escala de e-mail e garantia'}:`
                    : 'Legenda (selecione células para preencher em lote):'}
              </span>
              {schedule.serviceDeskN1
                ? n1Codes.map((item) => (
                    <button
                      key={item.code}
                      className={`chip n1-legend-code n1-code-${item.code.replace(/[^A-Z0-9]+/g, '-')}`}
                      disabled={selection.size === 0}
                      title={item.description}
                      onClick={() => {
                        applyShift([...selection], n1CellValue(item.code));
                        notify(`${item.code} · ${item.label} aplicado a ${selection.size} células.`);
                      }}
                    >
                      {item.code} · {item.label}
                    </button>
                  ))
                : SHIFTS.map((s) => (
                    <button
                      key={s.id}
                      className="chip"
                      disabled={selection.size === 0}
                      style={{
                        ['--chip-bg' as string]: `var(--sh-${s.id}-bg)`,
                        ['--chip-fg' as string]: `var(--sh-${s.id}-fg)`,
                      }}
                      onClick={() => {
                        applyShift([...selection], { shift: s.id });
                        notify(`${s.label} aplicado a ${selection.size} células.`);
                      }}
                    >
                      {s.code} · {s.label}
                    </button>
                  ))}
              <button
                className="chip chip-clear"
                disabled={selection.size === 0}
                onClick={() => setSelection(new Set())}
              >
                Desmarcar
              </button>
            </div>

            {visibleSchedule && (
              <ScheduleGrid
                state={visibleSchedule}
                selection={selection}
                conflicts={gridConflicts}
                onSelectionChange={setSelection}
                onApplyShift={applyShift}
                onCopyValueTo={copyValueTo}
                onFillRange={fillRange}
                onCopyDay={copyDay}
                onPasteDay={pasteDay}
                onClearDay={clearDay}
                onCopyWeek={copyWeek}
                onPasteWeek={pasteWeek}
                canPasteDay={clipboard?.kind === 'day'}
                canPasteWeek={clipboard?.kind === 'week'}
                onAddTechnician={addTechnician}
                onEditTechnician={editTechnician}
                onRemoveTechnician={removeTechnician}
                serviceDeskN1={schedule.serviceDeskN1 ? {
                  layer: n1Layer,
                  rowsById: n1RowsById,
                  legend: n1Codes,
                  onUpdatePause: updateN1Pause,
                  onUpdateShift: updateN1Shift,
                } : undefined}
              />
            )}
            {showConflicts && (
              <div className="conflict-panel-wrap">
                <ConflictAlertsPanel ref={conflictPanelRef} conflicts={gridConflicts} onNavigate={(conflict) => {
                  if (conflict.day) setSelection(new Set([cellKey(conflict.techId, conflict.day)]));
                }} />
              </div>
            )}
          </>
        )}

        {activeSection === 'planner' && schedule && isSoc && (
          <>
            <SocPlanner
              state={schedule}
              compact={socCompact}
              onCompactChange={(value) => { setSocCompact(value); localStorage.setItem('escala-dashboard:soc-compact', String(value)); }}
              onMove={(item, day, shift: SocShiftId) => mutate((current) => moveSocAssignment(current, { ...item, toDay: day, shift }))}
              onRemove={(technicianId, day) => mutate((current) => removeSocAssignment(current, technicianId, day))}
              onEdit={(technicianId, day, value) => mutate((current) => updateSocAssignment(current, technicianId, day, value))}
              focusedCell={plannerFocus}
            />
            {showConflicts && (
              <div className="conflict-panel-wrap">
                <ConflictAlertsPanel ref={conflictPanelRef} conflicts={gridConflicts} onNavigate={(conflict) => {
                  if (conflict.day) setPlannerFocus({ technicianId: conflict.techId, day: conflict.day });
                }} />
              </div>
            )}
          </>
        )}

        {activeSection === 'demo' && (
          <div className="demo-section">
            {!demoWorkspaceState && (
              <div className="demo-section-empty">
                <p>Nenhum Ambiente Demo carregado neste navegador.</p>
                <div className="empty-actions">
                  <button className="btn btn-primary" onClick={() => void loadDemoWorkspace()}>
                    Ambiente de Demonstração
                  </button>
                  {demoWorkspace.hasPersistedDraft && (
                    <button className="btn" onClick={() => void loadDemoWorkspace()}>
                      Continuar Ambiente de Demonstração
                    </button>
                  )}
                </div>
              </div>
            )}
            {demoWorkspaceState && (
              <>
                <DemoScenarioSummary
                  pkg={demoWorkspaceState.draftPackage}
                  sourcePublicationRevision={demoWorkspaceState.sourcePublicationRevision}
                  localDraftRevision={demoWorkspaceState.localDraftRevision}
                  dirty={demoWorkspaceState.dirty}
                  diff={demoWorkspaceDiff}
                />
                <DemoPublicationPanel
                  draftPackage={demoWorkspaceState.draftPackage}
                  localDraftRevision={demoWorkspaceState.localDraftRevision}
                  dirty={demoWorkspaceState.dirty}
                  backendStatus={demoRemotePublication.backendStatus}
                  firebaseAdminStatus={demoRemotePublication.firebaseAdminStatus}
                  validation={demoRemotePublication.validation}
                  busy={demoRemotePublication.busy}
                  lastError={demoRemotePublication.lastError}
                  onValidate={() => void validateDemoPublication()}
                  onPublishClick={() => void openDemoPublishDialog()}
                  onResetClick={() => setShowDemoRemoteResetDialog(true)}
                />
                <div className="demo-workspace-controls" aria-label="Controles do Ambiente de Demonstração">
                  <div className="demo-workspace-tabs" role="tablist" aria-label="Times do Ambiente de Demonstração">
                    {demoTeams.map((team) => (
                      <button
                        key={team.id}
                        role="tab"
                        aria-selected={schedule?.demoTeamId === team.id}
                        className="btn"
                        onClick={() => resetDemoSchedule(team.id)}
                      >
                        {team.name}
                      </button>
                    ))}
                  </div>
                  <button className="btn" onClick={() => setShowDemoManagerAssignmentsDialog(true)}>
                    Responsáveis e aprovações
                  </button>
                  <button className="btn" onClick={() => setShowDemoChangeRequestsDialog(true)}>
                    Solicitações Demo
                  </button>
                  <button className="btn" onClick={restoreDemoWorkspace}>
                    Restaurar cenário de demonstração
                  </button>
                  <button className="btn" onClick={exportDemoWorkspace}>
                    Exportar pacote Demo
                  </button>
                  <button
                    className="btn demo-workspace-exit"
                    onClick={() => {
                      demoWorkspace.exit();
                      history.reset(null);
                      setSelection(new Set());
                      setClipboard(null);
                      navigate('home');
                      notify('Ambiente de Demonstração fechado.');
                    }}
                  >
                    Sair do Ambiente de Demonstração
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {activeSection === 'official' && (
          <OfficialPublicationWizard
            officialPackage={officialPackage}
            corporateLink={officialCorporateLink}
            onCorporateLinkChange={setOfficialCorporateLink}
            backendStatus={officialRemotePublication.backendStatus}
            firebaseAdminStatus={officialRemotePublication.firebaseAdminStatus}
            validation={officialRemotePublication.validation}
            busy={officialRemotePublication.busy}
            lastError={officialRemotePublication.lastError}
            onValidate={() => void validateOfficialPublication()}
            onPublishClick={() => void openOfficialPublishDialog()}
            publishResult={officialPublishResult}
            onGoToDemo={() => navigate('demo')}
          />
        )}

        {activeSection === 'status' && (
          <div className="status-section" aria-label="Histórico e status remoto">
            <h2>Histórico / Status</h2>
            <div className="status-grid">
              <section className="status-card">
                <h3>Ambiente Demo — workspace demo-v1</h3>
                <dl>
                  <div><dt>Backend</dt><dd>{demoRemotePublication.backendStatus}</dd></div>
                  <div><dt>Firebase Admin</dt><dd>{demoRemotePublication.firebaseAdminStatus?.configured ? 'Configurado' : 'Não configurado'}</dd></div>
                  <div><dt>Revisão ativa</dt><dd>{demoRemotePublication.firebaseAdminStatus?.activePublicationRevision ?? '—'}</dd></div>
                  <div><dt>Último publish</dt><dd>{formatRemoteTimestamp(demoRemotePublication.firebaseAdminStatus?.lastPublishedAt)}</dd></div>
                  <div><dt>Status</dt><dd>{demoRemotePublication.firebaseAdminStatus?.status ?? '—'}</dd></div>
                </dl>
              </section>
              <section className="status-card">
                <h3>Publicação Oficial — workspace ici-dev</h3>
                <dl>
                  <div><dt>Backend</dt><dd>{officialRemotePublication.backendStatus}</dd></div>
                  <div><dt>Firebase Admin</dt><dd>{officialRemotePublication.firebaseAdminStatus?.configured ? 'Configurado' : 'Não configurado'}</dd></div>
                  <div><dt>ALLOW_OFFICIAL_FIRESTORE_WRITE</dt><dd>{officialRemotePublication.firebaseAdminStatus?.allowOfficialFirestoreWrite ? 'true' : 'false'}</dd></div>
                  <div><dt>Revisão ativa</dt><dd>{officialRemotePublication.firebaseAdminStatus?.activePublicationRevision ?? '—'}</dd></div>
                  <div><dt>Último publish</dt><dd>{formatRemoteTimestamp(officialRemotePublication.firebaseAdminStatus?.lastPublishedAt)}</dd></div>
                  <div><dt>Status</dt><dd>{officialRemotePublication.firebaseAdminStatus?.status ?? '—'}</dd></div>
                </dl>
              </section>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => { void demoRemotePublication.refreshStatus(); void officialRemotePublication.refreshStatus(); }}
            >
              Atualizar status
            </button>
          </div>
        )}

        {activeSection === 'settings' && (
          <div className="settings-section" aria-label="Configurações">
            <h2>Configurações</h2>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={uiCompact}
                onChange={() => setUiCompact((prev) => { const next = !prev; storeUiCompact(next); return next; })}
              />
              Modo compacto (reduz espaçamento em toda a interface)
            </label>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={socCompact}
                onChange={(e) => { setSocCompact(e.target.checked); localStorage.setItem('escala-dashboard:soc-compact', String(e.target.checked)); }}
              />
              Modo compacto do Planejador SOC/NOC
            </label>
            <p className="muted">
              Backend Express configurado em <code>{(import.meta.env.VITE_DASHBOARD_API_BASE_URL as string | undefined) || 'http://127.0.0.1:3001'}</code>.
            </p>
          </div>
        )}
      </AppShell>

      {templateWizardMode && (
        <ScheduleTemplateWizard
          mode={templateWizardMode}
          onCancel={() => setTemplateWizardMode(null)}
          onConfirm={(state) => {
            if (
              templateWizardMode === 'empty'
              && draftAvailable
              && !window.confirm('Já existe um rascunho salvo. Criar uma nova escala vazia pode sobrescrevê-lo. Deseja continuar?')
            ) {
              return;
            }
            if (
              templateWizardMode === 'demo'
              && testDriveAvailable
              && !window.confirm('Já existe um Test Drive salvo. Iniciar um novo vai sobrescrevê-lo. Deseja continuar?')
            ) {
              return;
            }
            history.reset(state);
            setN1Layer('principal');
            setSelection(new Set());
            setClipboard(null);
            setTemplateWizardMode(null);
            navigate('grid');
            notify(
              state.isDemo
                ? 'Test Drive carregado — dados fictícios locais.'
                : 'Escala vazia criada. Complete os dados no editor.',
            );
          }}
        />
      )}

      {pending && (
        <ImportWizard
          analysis={pending.analysis}
          onConfirm={confirmImport}
          onCancel={() => setPending(null)}
        />
      )}

      {publicationPreview && firebaseDashboard.selectedTeam && <PublicationDialog preview={publicationPreview} team={firebaseDashboard.selectedTeam} busy={firebaseBusy} onCancel={() => setPublicationPreview(null)} onPublish={(mode) => void confirmPublication(mode)} />}
      {swapRequests && <SwapRequestsDialog requests={swapRequests} teams={firebaseDashboard.teams} busy={firebaseBusy} onClose={() => setSwapRequests(null)} onDecide={(request, decision) => void decideSwap(request, decision)} />}
      {showDemoManagerAssignmentsDialog && demoWorkspace.state && <DemoManagerAssignmentsDialog pkg={demoWorkspace.state.draftPackage} onCancel={() => setShowDemoManagerAssignmentsDialog(false)} onSave={(nextPackage) => {
        demoWorkspace.updateDraft(() => nextPackage);
        setShowDemoManagerAssignmentsDialog(false);
        notify('Responsáveis e aprovações atualizados localmente.');
      }} />}
      {showDemoChangeRequestsDialog && demoWorkspace.state && (
        <DemoChangeRequestsDialog
          pkg={demoWorkspace.state.draftPackage}
          onClose={() => setShowDemoChangeRequestsDialog(false)}
        />
      )}
      {showDemoPublishDialog && demoPublishSnapshot && (
        <DemoPublishDialog
          draftPackage={demoPublishSnapshot.draftPackage}
          validation={demoPublishSnapshot.validation}
          diff={demoPublishSnapshot.diff}
          busy={demoRemotePublication.busy}
          lastError={demoRemotePublication.lastError}
          onCancel={() => {
            setShowDemoPublishDialog(false);
            setDemoPublishSnapshot(null);
          }}
          onPublish={() => void confirmDemoPublication()}
        />
      )}
      {showOfficialPublishDialog && officialPublishSnapshot && (
        <OfficialPublishDialog
          officialPackage={officialPublishSnapshot.officialPackage}
          corporateLink={officialPublishSnapshot.corporateLink}
          validation={officialPublishSnapshot.validation}
          busy={officialRemotePublication.busy}
          lastError={officialRemotePublication.lastError}
          onCancel={() => {
            setShowOfficialPublishDialog(false);
            setOfficialPublishSnapshot(null);
          }}
          onPublish={() => void confirmOfficialPublication()}
        />
      )}
      {showDemoRemoteResetDialog && (
        <DemoRemoteResetDialog
          firebaseAdminStatus={demoRemotePublication.firebaseAdminStatus}
          busy={demoRemotePublication.busy}
          lastError={demoRemotePublication.lastError}
          onCancel={() => setShowDemoRemoteResetDialog(false)}
          onReset={() => void confirmDemoRemoteReset()}
        />
      )}
      {showTeamDialog && firebaseDashboard.user?.isSystemAdmin && <TeamDialog onCancel={() => setShowTeamDialog(false)} onSave={(team: Team) => {
        setFirebaseBusy(true);
        void saveTeam(firebaseDashboard.user!, team).then(() => firebaseDashboard.reloadTeams(firebaseDashboard.user!)).then(() => { setShowTeamDialog(false); notify('Time salvo.'); }).catch((error) => firebaseDashboard.setError((error as Error).message)).finally(() => setFirebaseBusy(false));
      }} />}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
