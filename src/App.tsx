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
import { PublicationDialog } from './components/PublicationDialog';
import { SwapRequestsDialog } from './components/SwapRequestsDialog';
import { TeamDialog } from './components/TeamDialog';
import { demoPackageToScheduleState } from './lib/demoWorkspace/scheduleAdapter';
import { moveSocAssignment, removeSocAssignment, updateSocAssignment, type SocShiftId } from './lib/socPlanner';
import { useFirebaseDashboard } from './hooks/useFirebaseDashboard';
import { useDemoWorkspace } from './hooks/useDemoWorkspace';
import { signInWithMicrosoft, signOutDashboard } from './lib/authRepository';
import { buildPublicationPreview, type PublicationPreview } from './lib/publicationPreview';
import { publishStructuredSchedule, type PublicationMode } from './lib/schedulePublishRepository';
import { decideSwapRequest, loadSwapRequests } from './lib/swapRequestsRepository';
import { saveTeam } from './lib/teamsRepository';
import type { ShiftSwapRequest, Team } from './types';

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

export default function App() {
  const history = useHistory<ScheduleState | null>(null);
  const firebaseDashboard = useFirebaseDashboard();
  const demoWorkspace = useDemoWorkspace();
  const schedule = history.state;
  const [n1Layer, setN1Layer] = useState<ServiceDeskN1Layer>('principal');
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [selection, setSelection] = useState<Set<CellKey>>(new Set());
  const [clipboard, setClipboard] = useState<Clipboard>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showConflicts, setShowConflicts] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [draftAvailable, setDraftAvailable] = useState(() => loadDraft() !== null);
  const [testDriveAvailable, setTestDriveAvailable] = useState(() => loadTestDriveSession() !== null);
  const [socView, setSocView] = useState<'grid' | 'planner'>(() => localStorage.getItem('escala-dashboard:soc-view') === 'planner' ? 'planner' : 'grid');
  const [socCompact, setSocCompact] = useState(() => localStorage.getItem('escala-dashboard:soc-compact') === 'true');
  const fileInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>();
  const conflictPanelRef = useRef<HTMLElement>(null);
  const [plannerFocus, setPlannerFocus] = useState<{ technicianId: string; day: number } | null>(null);
  const [publicationPreview, setPublicationPreview] = useState<PublicationPreview | null>(null);
  const [swapRequests, setSwapRequests] = useState<ShiftSwapRequest[] | null>(null);
  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [firebaseBusy, setFirebaseBusy] = useState(false);
  const [templateWizardMode, setTemplateWizardMode] = useState<'empty' | 'demo' | null>(null);
  const demoWorkspaceState = demoWorkspace.state;

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

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
  }, [showConflicts, socView]);

  const openConflictPanel = useCallback(() => {
    setShowConflicts(true);
    window.requestAnimationFrame(() => conflictPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  }, []);

  const demoTeams = useMemo(
    () => [...(demoWorkspaceState?.draftPackage.teams ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
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
    notify('Ambiente de Demonstração carregado.');
  }, [demoWorkspace, notify, resetDemoSchedule]);

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
        notify(
          result.state.viewType === 'oncall'
            ? `Importados ${result.importedRecords ?? result.state.onCallRecords?.length ?? 0} plantões de ${result.state.technicians.length} plantonistas.`
            : `Importado: ${result.state.technicians.length} técnicos, ${result.recognizedShifts} registros reconhecidos, ${result.customShifts} personalizados.`,
        );
      } catch (err) {
        notify(`Falha na importação: ${(err as Error).message}`);
      }
    },
    [pending, history, notify, firebaseDashboard.selectedTeam],
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
    [mutate, notify, n1Layer],
  );

  const editTechnician = useCallback(
    (id: string, login: string, name: string) => {
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
    [mutate],
  );

  const removeTechnician = useCallback(
    (id: string) => {
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
    [mutate, notify, n1Layer],
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
        // A persistência do Ambiente de Demonstração pertence ao useDemoWorkspace.
      } else {
        saveDraft(schedule, firebaseDashboard.selectedTeamId || undefined);
      }
    }, 800);
    return () => window.clearTimeout(id);
  }, [schedule, firebaseDashboard.selectedTeamId]);

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
  const isSoc = Boolean(schedule?.visualGrouping === 'operational-shift' && !schedule.serviceDeskN1 && schedule.viewType !== 'oncall');

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

      <header className="topbar">
        <div className="brand">
          Painel de Escalas
          <small>v1.10.0 · importar → escolher período/bloco → revisar → editar → publicar</small>
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
              {schedule.viewType !== 'oncall' && (
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
              notify('Dados fictícios do Test Drive apagados.');
            }}
          >
            Encerrar Test Drive e apagar dados locais
          </button>
        </div>
      )}

      {schedule && schedule.origin === 'demo-workspace-package' && (
        <>
          <DemoWorkspaceBanner
            workspaceId={demoWorkspaceState?.workspaceId ?? 'demo-v1'}
            sourcePublicationRevision={demoWorkspaceState?.sourcePublicationRevision ?? 1}
            dirty={demoWorkspaceState?.dirty ?? false}
          />
          <div className="demo-workspace-controls" aria-label="Controles do Ambiente de Demonstração">
            <div className="demo-workspace-tabs" role="tablist" aria-label="Times do Ambiente de Demonstração">
              {demoTeams.map((team) => (
                <button
                  key={team.id}
                  role="tab"
                  aria-selected={schedule.demoTeamId === team.id}
                  className="btn"
                  onClick={() => resetDemoSchedule(team.id)}
                >
                  {team.name}
                </button>
              ))}
            </div>
            <button
              className="btn demo-workspace-exit"
              onClick={() => {
                demoWorkspace.exit();
                history.reset(null);
                setSelection(new Set());
                setClipboard(null);
                notify('Ambiente de Demonstração fechado.');
              }}
            >
              Sair do Ambiente de Demonstração
            </button>
          </div>
        </>
      )}

      {schedule?.serviceDeskN1 && schedule.viewType !== 'oncall' && (
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

      {schedule && schedule.viewType !== 'oncall' && (
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
      )}

      {isSoc && <div className="soc-viewbar">
        <div role="tablist" aria-label="Visualização da Escala SOC">
          <button className="btn" aria-selected={socView === 'grid'} onClick={() => { setSocView('grid'); localStorage.setItem('escala-dashboard:soc-view', 'grid'); }}>Grade</button>
          <button className="btn" aria-selected={socView === 'planner'} onClick={() => { setSocView('planner'); localStorage.setItem('escala-dashboard:soc-view', 'planner'); }}>Planejador</button>
        </div>
        <span>As duas visualizações editam a mesma escala.</span>
      </div>}

      {!schedule && (
        <main className="empty">
          <div className={`dropzone${dragOver ? ' dragover' : ''}`}>
            <h1>Comece importando uma planilha de escala</h1>
            <p>
              Arraste um arquivo .xls ou .xlsx para cá. O painel identifica as abas e os meses e
              você escolhe o período ou bloco que deseja importar.
            </p>
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={() => fileInput.current?.click()}>
                Importar arquivo
              </button>
              <button
                className="btn"
                onClick={() => setTemplateWizardMode('demo')}
              >
                Test Drive — dados fictícios locais
              </button>
              <button
                className="btn"
                onClick={() => void loadDemoWorkspace()}
              >
                Ambiente de Demonstração
              </button>
              <button
                className="btn"
                onClick={() => setTemplateWizardMode('empty')}
              >
                Criar escala vazia
              </button>
              {draftAvailable && (
                <button
                  className="btn"
                  onClick={() => {
                    const d = loadDraft();
                    if (d) {
                      history.reset(d.state);
                      notify(`Rascunho de ${new Date(d.savedAt).toLocaleString('pt-BR')} restaurado.`);
                    } else {
                      setDraftAvailable(false);
                      notify('Nenhum rascunho válido encontrado.');
                    }
                  }}
                >
                  Continuar rascunho salvo
                </button>
              )}
              {testDriveAvailable && (
                <button
                  className="btn"
                  onClick={() => {
                    const session = loadTestDriveSession();
                    if (session) {
                      history.reset(session.state);
                      notify(`Test Drive de ${new Date(session.savedAt).toLocaleString('pt-BR')} restaurado.`);
                    } else {
                      setTestDriveAvailable(false);
                      notify('Nenhum Test Drive válido encontrado.');
                    }
                  }}
                >
                  Continuar Test Drive
                </button>
              )}
              {demoWorkspace.hasPersistedDraft && (
                <button
                  className="btn"
                  onClick={() => void loadDemoWorkspace()}
                >
                  Continuar Ambiente de Demonstração
                </button>
              )}
            </div>
            <div className="flow">
              Importar arquivo → escolher período/bloco → revisar → editar → salvar ou exportar
            </div>
          </div>
        </main>
      )}

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
            notify(
              state.isDemo
                ? 'Test Drive carregado — dados fictícios locais.'
                : 'Escala vazia criada. Complete os dados no editor.',
            );
          }}
        />
      )}

      {schedule && schedule.viewType === 'oncall' && (
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

      {schedule && visibleSchedule && schedule.viewType !== 'oncall' && (!isSoc || socView === 'grid') && (
        <>
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
          {showConflicts && (
            <div className="conflict-panel-wrap">
              <ConflictAlertsPanel ref={conflictPanelRef} conflicts={gridConflicts} onNavigate={(conflict) => {
                if (conflict.day) setSelection(new Set([cellKey(conflict.techId, conflict.day)]));
              }} />
            </div>
          )}
        </>
      )}
      {schedule && isSoc && socView === 'planner' && <SocPlanner
        state={schedule}
        compact={socCompact}
        onCompactChange={(value) => { setSocCompact(value); localStorage.setItem('escala-dashboard:soc-compact', String(value)); }}
        onMove={(item, day, shift: SocShiftId) => mutate((current) => moveSocAssignment(current, { ...item, toDay: day, shift }))}
        onRemove={(technicianId, day) => mutate((current) => removeSocAssignment(current, technicianId, day))}
        onEdit={(technicianId, day, value) => mutate((current) => updateSocAssignment(current, technicianId, day, value))}
        focusedCell={plannerFocus}
      />}
      {schedule && isSoc && socView === 'planner' && showConflicts && (
        <div className="conflict-panel-wrap">
          <ConflictAlertsPanel ref={conflictPanelRef} conflicts={gridConflicts} onNavigate={(conflict) => {
            if (conflict.day) setPlannerFocus({ technicianId: conflict.techId, day: conflict.day });
          }} />
        </div>
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
      {showTeamDialog && firebaseDashboard.user?.isSystemAdmin && <TeamDialog onCancel={() => setShowTeamDialog(false)} onSave={(team: Team) => {
        setFirebaseBusy(true);
        void saveTeam(firebaseDashboard.user!, team).then(() => firebaseDashboard.reloadTeams(firebaseDashboard.user!)).then(() => { setShowTeamDialog(false); notify('Time salvo.'); }).catch((error) => firebaseDashboard.setError((error as Error).message)).finally(() => setFirebaseBusy(false));
      }} />}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {schedule && schedule.origin !== 'demo-workspace-package' && (
        <span className="muted" style={{ position: 'fixed', bottom: 6, right: 12, fontSize: 11 }}>
          rascunho salvo automaticamente neste navegador
          {' · '}
          <button
            className="icon-btn"
            style={{ fontSize: 11 }}
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
      )}
    </div>
  );
}
