/** Identificadores canônicos de turno. `custom` preserva texto livre. */
export type ShiftId =
  | 'madrugada'
  | 'manha'
  | 'tarde'
  | 'noite'
  | 'folga'
  | 'ferias'
  | 'plantao'
  | 'comercial'
  | 'extra'
  | 'afastamento'
  | 'custom';

export interface ShiftDef {
  id: ShiftId;
  label: string;
  /** Código curto usado na exportação e nos chips. */
  code: string;
}

export interface CellValue {
  shift: ShiftId;
  /** Texto original/personalizado. */
  text?: string;
}

export interface Technician {
  id: string;
  login?: string;
  name?: string;
  /** Cor escolhida para identificação visual, em hexadecimal CSS. */
  color?: string;
}

export type ServiceDeskN1Shift = 'madrugada' | 'manha' | 'tarde' | 'noite';
export type ServiceDeskN1Layer = 'principal' | 'email-garantia';

/**
 * Uma linha visual do modelo real do Service Desk N1.
 *
 * A mesma pessoa pode aparecer em mais de uma linha quando muda de turno no
 * decorrer do mês. `technicianId` mantém o vínculo com a pessoa única, enquanto
 * `id` identifica a linha editável exatamente como ela aparece na planilha.
 */
export interface ServiceDeskN1Row {
  id: string;
  technicianId: string;
  personKey: string;
  fullName: string;
  displayName: string;
  employeeCode?: string;
  shift: ServiceDeskN1Shift;
  pauseTime?: string;
  sourceRow?: number;
  cells: Record<number, CellValue | undefined>;
}

export interface ServiceDeskN1LegendItem {
  code: string;
  description: string;
}

export interface ServiceDeskN1Data {
  principalRows: ServiceDeskN1Row[];
  emailGuaranteeRows: ServiceDeskN1Row[];
  /** Legendas lidas diretamente da planilha de origem. */
  principalLegend: ServiceDeskN1LegendItem[];
  emailGuaranteeLegend: ServiceDeskN1LegendItem[];
}

export interface MonthKey {
  year: number;
  /** 1–12 */
  month: number;
}

export interface OnCallRecord {
  id: string;
  technician: string;
  /** ISO local: YYYY-MM-DDTHH:mm */
  start: string;
  /** ISO local: YYYY-MM-DDTHH:mm */
  end: string;
  durationMinutes: number;
}

/** Estado editável da grade ou do relatório de plantões. */
export interface ScheduleState {
  monthKey: MonthKey;
  technicians: Technician[];
  /** cells[technicianId][índice da coluna, começando em 1] */
  cells: Record<string, Record<number, CellValue | undefined>>;
  /** Datas reais das colunas, em ordem. Ausente = mês civil inteiro de monthKey. */
  dates?: string[];
  viewType?: 'schedule' | 'oncall';
  onCallRecords?: OnCallRecord[];
  sourceLabel?: string;
  isDemo?: boolean;
  origin?: 'import' | 'empty-template' | 'demo-template' | 'demo-workspace-package' | 'official-firebase' | 'manual';
  /** Time do pacote Demo atualmente projetado na grade. */
  demoTeamId?: string;
  officialTeamId?: string;
  /** Organiza os colaboradores por turno predominante no período (uso do SOC). */
  visualGrouping?: 'operational-shift';
  /** Metadados e segunda grade específicos da Equipe Técnicos de TI N1. */
  serviceDeskN1?: ServiceDeskN1Data;
  /** Metadados não sensíveis usados no preview/publicação estruturada. */
  sourceFileName?: string;
  sourceSheet?: string;
  sourceLayout?: SheetLayout;
}

export type ScheduleTemplateKind = 'plantao-cosi' | 'soc-noc-6x1' | 'service-desk-n1-6x1';

export interface ScheduleTemplateDefinition {
  kind: ScheduleTemplateKind;
  label: string;
  shortLabel: string;
  description: string;
  /** SOC e COSI usam o ciclo operacional 25->26 (cycle25To26); N1 usa mês civil. */
  periodStrategy: 'cycle-25-26' | 'calendar-month';
  viewType: NonNullable<ScheduleState['viewType']>;
  visualGrouping?: NonNullable<ScheduleState['visualGrouping']>;
  serviceDeskN1: boolean;
  allowedShiftCodes: string[];
}

/* ---------- Integração Escala ICI / Firebase ---------- */

export type ScheduleKind = 'REGULAR' | 'ON_CALL';

export interface Team {
  id: string;
  code: string;
  name: string;
  responsibleLogin: string;
  scheduleKind: ScheduleKind;
  active: boolean;
  allowedImportLayouts: SheetLayout[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserLink {
  firebaseUid: string;
  login: string;
  active: boolean;
  role?: 'USER' | 'SCHEDULE_ADMIN';
  primaryTeamId?: string;
  teamIds?: string[];
  updatedAt?: unknown;
  grantedBy?: string;
  grantedAt?: string;
}

export interface AuthenticatedDashboardUser {
  uid: string;
  displayName?: string;
  login: string;
  role: 'USER' | 'SCHEDULE_ADMIN';
  teamIds: string[];
  isSystemAdmin: boolean;
  link: UserLink;
}

export type SwapRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ShiftSwapRequest {
  id: string;
  teamId: string;
  periodId: string;
  requesterMemberId: string;
  requesterLogin: string;
  requesterAssignmentId: string;
  requestedMemberId?: string;
  requestedLogin?: string;
  requestedAssignmentId?: string;
  reason: string;
  status: SwapRequestStatus;
  createdAt: unknown;
  decidedAt?: unknown;
  decidedByLogin?: string;
  decisionNote?: string;
}

/* ---------- Análise de importação ---------- */

export type SheetLayout =
  | 'matrix'
  | 'long'
  | 'n1'
  | 'soc-daily'
  | 'soc-escalistas'
  | 'soc-combined'
  | 'oncall'
  | 'unknown';

export interface MonthDetection {
  year: number | null;
  month: number; // 1–12
  source: 'sheetName' | 'title' | 'header' | 'dates';
  label: string;
}

export interface TechRowInfo {
  row: number;
  login?: string;
  name?: string;
  raw: string;
}

export interface IgnoredRow {
  row: number;
  reason: string;
  preview: string;
}

export interface RecognizedBlock {
  id: string;
  title: string;
  headerRow: number;
  startRow: number;
  endRow: number;
  techCount: number;
  primary: boolean;
}

export interface SheetAnalysis {
  sheetName: string;
  layout: SheetLayout;
  months: MonthDetection[];
  headerRow?: number;
  /** dia (1–31) -> índice da coluna */
  dayColumns?: Record<number, number>;
  technicians: TechRowInfo[];
  ignoredRows: IgnoredRow[];
  blocks?: RecognizedBlock[];
  errors: string[];
  warnings: string[];
}

/** Uma opção concreta de importação. */
export interface ImportOption {
  key: string;
  sheetName: string;
  monthKey: MonthKey;
  monthLabel: string;
  techCount: number;
  layout: SheetLayout;
  label?: string;
  periodStart?: string;
  periodEnd?: string;
  recordCount?: number;
  blockId?: string;
  /** Bloco complementar de e-mail/garantia ligado à escala principal N1. */
  secondaryBlockId?: string;
  /** Abre o modo visual próprio do Service Desk N1 com duas grades vinculadas. */
  serviceDeskN1?: boolean;
  /** Abas fonte usadas pela importação SOC combinada Escala + Escalistas. */
  socDailySheetName?: string;
  socEscalistasSheetName?: string;
  primary?: boolean;
  technicians?: TechRowInfo[];
}

export interface WorkbookAnalysis {
  fileName: string;
  sheets: SheetAnalysis[];
  options: ImportOption[];
  errors: string[];
}

export interface ImportResult {
  state: ScheduleState;
  recognizedShifts: number;
  customShifts: number;
  emptyCells: number;
  importedRecords?: number;
}

/* ---------- Conflitos ---------- */

export type ConflictKind =
  | 'descanso'
  | 'sequencia'
  | 'ferias-interrompidas'
  | 'tecnico-duplicado';

export interface Conflict {
  kind: ConflictKind;
  techId: string;
  day?: number;
  message: string;
}
