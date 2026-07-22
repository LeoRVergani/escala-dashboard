import * as XLSX from 'xlsx';
import type {
  CellValue,
  ImportOption,
  ImportResult,
  MonthDetection,
  MonthKey,
  OnCallRecord,
  RecognizedBlock,
  ScheduleState,
  ServiceDeskN1LegendItem,
  ServiceDeskN1Row,
  ServiceDeskN1Shift,
  SheetAnalysis,
  ShiftId,
  TechRowInfo,
  Technician,
  WorkbookAnalysis,
} from '../types';
import {
  daysInMonth,
  findMonthInText,
  fold,
  looksLikeLogin,
  looksLikeName,
  normalizeShift,
  parseIdentity,
} from './normalize';
import { cycle25To26, isoDate } from './dates';
import { normalizeOnCallRecordToRule } from './onCall';

type Cell = string | number | boolean | Date | null;
type Grid = Cell[][];

const MAX_SCAN_ROWS = 700;
const MAX_SCAN_COLS = 140;
const N1_STOP_RE = /total escalado|total em folga|total em ferias|total em monitoramento|^legenda$/i;
const TECH_NOISE_RE = /legenda|total escalado|total em folga|total em ferias|total em monitoramento|dias normais de trabalho|dia da semana|executa a atividade|todos os nocs|^colaborador$|^turno$|^madrugada$|^manha$|^tarde$|^noite$/;
const N1_CODE_RE = /^(?:m[1-4]?|x|aus|f)$/i;

function sheetToGrid(ws: XLSX.WorkSheet): Grid {
  const aoa = XLSX.utils.sheet_to_json<Cell[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  }) as Grid;
  return aoa.slice(0, MAX_SCAN_ROWS).map((row) => (row ?? []).slice(0, MAX_SCAN_COLS));
}

function cellText(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return isoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

function rowPreview(row: Cell[]): string {
  return row.map(cellText).filter(Boolean).slice(0, 6).join(' | ').slice(0, 120);
}

function dateFromCell(value: Cell, defaultYear?: number): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  const raw = cellText(value);
  const m = raw.match(/(?:^|\D)(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : defaultYear;
  if (!year || day < 1 || day > 31 || month < 1 || month > 12) return null;
  if (year < 100) year += 2000;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function dateToIso(date: Date): string {
  return isoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function parseTextualDateTime(value: Cell): string | null {
  const raw = cellText(value);
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (hour > 23 || minute > 59) return null;
  const d = new Date(year, month - 1, day, hour, minute);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${isoDate(year, month, day)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function localDateTimeMs(value: string): number {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return Number.NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime();
}

function uniqueMonthsFromDates(dates: string[]): MonthDetection[] {
  const seen = new Set<string>();
  const result: MonthDetection[] = [];
  for (const value of dates) {
    const [year, month] = value.split('-').map(Number);
    const key = `${year}-${month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      year,
      month,
      source: 'dates',
      label: `datas da planilha (${String(month).padStart(2, '0')}/${year})`,
    });
  }
  return result;
}

function monthLabel(year: number, month: number): string {
  return `${String(month).padStart(2, '0')}/${year}`;
}

function baseAnalysis(sheetName: string, layout: SheetAnalysis['layout']): SheetAnalysis {
  return {
    sheetName,
    layout,
    months: [],
    technicians: [],
    ignoredRows: [],
    errors: [],
    warnings: [],
  };
}

function technicianKey(login?: string, name?: string): string {
  return login?.toLowerCase() ?? fold(name ?? '');
}


/* ------------------------------------------------------------------ */
/* Equipe N1: várias regiões por aba                                  */
/* ------------------------------------------------------------------ */

interface N1BlockData {
  info: RecognizedBlock;
  titleRow: number;
  dateColumns: number[];
  dates: string[];
  technicians: N1TechRowInfo[];
  legend: ServiceDeskN1LegendItem[];
  ignored: SheetAnalysis['ignoredRows'];
}

interface N1TechRowInfo extends TechRowInfo {
  employeeCode?: string;
  pauseTime?: string;
  shift: ServiceDeskN1Shift;
}

function formatPersonName(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s'-])([\p{L}])/gu, (_all, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('pt-BR')}`);
}

function shortPersonName(raw: string): string {
  const full = formatPersonName(raw);
  const words = full.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return full;
  const particles = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  const last = [...words].reverse().find((word, index) => index === 0 || !particles.has(fold(word))) ?? words[words.length - 1];
  return `${words[0]} ${last}`;
}

function timeFromCell(value: Cell): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const h = String(value.getUTCHours()).padStart(2, '0');
    const m = String(value.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const minutes = Math.round(value * 24 * 60) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const match = String(value ?? '').match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : undefined;
}

const N1_SHIFT_ORDER: ServiceDeskN1Shift[] = ['madrugada', 'manha', 'tarde', 'noite'];

function rowHasN1StopCell(row: Cell[]): boolean {
  return row.some((value) => {
    const text = fold(cellText(value));
    return Boolean(text) && N1_STOP_RE.test(text);
  });
}

function rowHasScaleTitle(row: Cell[]): boolean {
  return row.some((value) => /^ESCALA\b/i.test(cellText(value)));
}

function isBlankInsideN1Block(row: Cell[], lastDateCol: number): boolean {
  return row.slice(0, lastDateCol + 1).every((value) => cellText(value) === '');
}

function readN1Legend(
  grid: Grid,
  stopRow: number,
  firstDateCol: number,
): ServiceDeskN1LegendItem[] {
  let legendRow = -1;
  for (let r = Math.max(0, stopRow); r < Math.min(grid.length, stopRow + 20); r++) {
    if (r > stopRow && rowHasScaleTitle(grid[r] ?? [])) break;
    if ((grid[r] ?? []).some((value) => fold(cellText(value)) === 'legenda')) {
      legendRow = r;
      break;
    }
  }
  if (legendRow < 0) return [];
  const result: ServiceDeskN1LegendItem[] = [];
  let emptyRows = 0;
  for (let r = legendRow + 1; r < Math.min(grid.length, legendRow + 20); r++) {
    if (rowHasScaleTitle(grid[r] ?? [])) break;
    // A legenda real fica antes da primeira coluna de data. Caixas decorativas
    // à direita não participam da leitura.
    const values = (grid[r] ?? []).slice(0, firstDateCol).map(cellText).filter(Boolean);
    if (!values.length) {
      emptyRows += 1;
      if (emptyRows >= 2 && result.length) break;
      continue;
    }
    emptyRows = 0;
    const code = values[0].trim().toUpperCase();
    const description = values.slice(1).join(' ').trim();
    if (!code || !description || fold(code) === 'legenda') continue;
    if (/^N[º°O]?$/i.test(code)) {
      for (let number = 1; number <= 6; number++) result.push({ code: String(number), description });
    } else if (/^(?:X|AUS|F|M|M[1-4]|G|E|T|JOB|ATH)$/i.test(code)) {
      result.push({ code, description });
    }
  }
  return [...new Map(result.map((item) => [item.code, item])).values()];
}

function n1TechnicianFromRow(
  row: Cell[],
  rowIndex: number,
  firstDateCol: number,
  dateColumns: number[],
  shift: ServiceDeskN1Shift,
): N1TechRowInfo | null {
  const labelParts = row.slice(0, firstDateCol).map(cellText).filter(Boolean);
  const joined = fold(labelParts.join(' '));
  if (!joined || TECH_NOISE_RE.test(joined) || labelParts.some((part) => N1_CODE_RE.test(part))) return null;
  const scheduled = dateColumns.filter((col) => cellText(row[col]) !== '').length;
  if (scheduled < 1) return null;
  // Estrutura real: B ordem, C matrícula, D nome, E pausa, F... datas.
  const name = cellText(row[3]) || [...labelParts].reverse().find((part) => looksLikeName(part));
  if (!name || !looksLikeName(name)) return null;
  const pauseTime = timeFromCell(row[4]);
  const employeeCode = cellText(row[2]) || undefined;
  return {
    row: rowIndex,
    name: formatPersonName(name),
    raw: labelParts.join(' | '),
    employeeCode,
    pauseTime,
    shift,
  };
}

function findN1Blocks(grid: Grid): N1BlockData[] {
  const blocks: N1BlockData[] = [];
  for (let titleRow = 0; titleRow < grid.length; titleRow++) {
    const title = grid[titleRow].map(cellText).find((value) => /^ESCALA\b/i.test(value));
    if (!title) continue;
    let headerRow = -1;
    let dateColumns: number[] = [];
    let dates: string[] = [];
    for (let r = titleRow; r <= Math.min(titleRow + 5, grid.length - 1); r++) {
      const cols: number[] = [];
      const values: string[] = [];
      for (let c = 0; c < grid[r].length; c++) {
        const date = dateFromCell(grid[r][c]);
        if (date) {
          cols.push(c);
          values.push(dateToIso(date));
        }
      }
      if (cols.length >= 20) {
        headerRow = r;
        dateColumns = cols;
        dates = values;
        break;
      }
    }
    if (headerRow < 0) continue;

    const firstDateCol = Math.min(...dateColumns);
    const lastDateCol = Math.max(...dateColumns);
    let endRow = grid.length;
    for (let r = headerRow + 1; r < grid.length; r++) {
      // Compare célula a célula. A linha da Legenda também pode conter caixas
      // decorativas à direita, portanto concatenar a linha quebraria a parada.
      if (rowHasN1StopCell(grid[r] ?? []) || (r > headerRow + 1 && rowHasScaleTitle(grid[r] ?? []))) {
        endRow = r;
        break;
      }
    }

    const technicians: N1TechRowInfo[] = [];
    const ignored: SheetAnalysis['ignoredRows'] = [];
    let groupIndex = 0;
    let technicianSinceSeparator = false;
    for (let r = headerRow + 1; r < endRow; r++) {
      const row = grid[r] ?? [];
      // Somente A..última data definem o bloco. Valores em tabelas decorativas
      // mais à direita não impedem que esta seja uma linha separadora.
      if (isBlankInsideN1Block(row, lastDateCol)) {
        if (technicianSinceSeparator && groupIndex < N1_SHIFT_ORDER.length - 1) {
          groupIndex += 1;
          technicianSinceSeparator = false;
        }
        continue;
      }
      const technician = n1TechnicianFromRow(
        row,
        r,
        firstDateCol,
        dateColumns,
        N1_SHIFT_ORDER[Math.min(groupIndex, N1_SHIFT_ORDER.length - 1)],
      );
      if (technician) {
        technicians.push(technician);
        technicianSinceSeparator = true;
      } else if (row.slice(0, lastDateCol + 1).some((cell) => cellText(cell))) {
        ignored.push({ row: r + 1, reason: 'fora das linhas reais de colaboradores do bloco', preview: rowPreview(row.slice(0, lastDateCol + 1)) });
      }
    }

    const uniqueTechnicians = [...new Map(technicians.map((tech) => [fold(tech.name ?? tech.login ?? tech.raw), tech])).values()];
    const id = `block-${blocks.length + 1}`;
    blocks.push({
      info: {
        id,
        title,
        headerRow,
        startRow: headerRow + 1,
        endRow,
        techCount: uniqueTechnicians.length,
        primary: blocks.length === 0,
      },
      titleRow,
      dateColumns,
      dates,
      technicians,
      legend: readN1Legend(grid, endRow, firstDateCol),
      ignored,
    });
  }
  return blocks;
}

function analyzeN1Sheet(sheetName: string, grid: Grid): { analysis: SheetAnalysis; options: ImportOption[] } | null {
  const blocks = findN1Blocks(grid);
  const month = findMonthInText(sheetName);
  if (!blocks.length || !month?.year) return null;
  const analysis = baseAnalysis(sheetName, 'n1');
  analysis.months = [{ year: month.year, month: month.month, source: 'sheetName', label: `nome da aba “${sheetName}”` }];
  analysis.blocks = blocks.map((block) => block.info);
  analysis.technicians = blocks[0] ? [...new Map(blocks[0].technicians.map((tech) => [fold(tech.name ?? tech.login ?? tech.raw), tech])).values()] : [];
  analysis.ignoredRows = blocks.flatMap((block) => block.ignored);
  if (blocks.length > 1) analysis.warnings.push('Mais de um bloco de escala encontrado. A escala principal abre em visões vinculadas e separadas; os blocos auxiliares também podem ser importados isoladamente.');

  const primaryBlock = blocks.find((block) => block.info.primary) ?? blocks[0];
  const emailGuaranteeBlock = blocks.find((block) => /email|e-mail|garantia/i.test(block.info.title));

  const options = blocks
    .filter((block) => block.technicians.length > 0)
    .map((block) => ({
      key: `${sheetName}::n1::${block.info.id}::${month.year}-${month.month}`,
      sheetName,
      monthKey: { year: month.year!, month: month.month },
      monthLabel: monthLabel(month.year!, month.month),
      techCount: new Set(block.technicians.map((tech) => fold(tech.name ?? tech.login ?? tech.raw))).size,
      layout: 'n1' as const,
      label:
        block.info.id === primaryBlock.info.id && emailGuaranteeBlock
          ? 'Service Desk N1 — escala completa'
          : block.info.primary
            ? 'Escala principal'
            : block.info.title,
      periodStart: block.dates[0],
      periodEnd: block.dates[block.dates.length - 1],
      recordCount: block.technicians.reduce(
        (sum, technician) => sum + block.dateColumns.filter((col) => cellText(grid[technician.row]?.[col]) !== '').length,
        0,
      ) + (
        block.info.id === primaryBlock.info.id && emailGuaranteeBlock && emailGuaranteeBlock.info.id !== primaryBlock.info.id
          ? emailGuaranteeBlock.technicians.reduce(
              (sum, technician) => sum + emailGuaranteeBlock.dateColumns.filter((col) => cellText(grid[technician.row]?.[col]) !== '').length,
              0,
            )
          : 0
      ),
      blockId: block.info.id,
      secondaryBlockId:
        block.info.id === primaryBlock.info.id && emailGuaranteeBlock?.info.id !== primaryBlock.info.id
          ? emailGuaranteeBlock?.info.id
          : undefined,
      serviceDeskN1: block.info.id === primaryBlock.info.id,
      primary: block.info.id === primaryBlock.info.id,
      technicians: [...new Map(block.technicians.map((tech) => [fold(tech.name ?? tech.login ?? tech.raw), tech])).values()],
    }));
  return { analysis, options };
}

function normalizeN1Value(raw: Cell): CellValue | null {
  const text = cellText(raw);
  if (!text || text === '-' || text === '—') return null;
  const key = fold(text);
  if (key === 'f') return { shift: 'folga', text };
  if (key === 'x') return { shift: 'ferias', text };
  if (key === 'aus') return { shift: 'afastamento', text };
  // M/M1..M4 significam monitoramento neste arquivo, e 1..6 são dias normais.
  return { shift: 'custom', text };
}

/* ------------------------------------------------------------------ */
/* SOC — aba Escala                                                   */
/* ------------------------------------------------------------------ */

const SOC_SHIFT_COLS: Array<[number, ShiftId]> = [
  [2, 'madrugada'],
  [3, 'manha'],
  [4, 'tarde'],
  [5, 'noite'],
];
const SOC_NO_DATA_TEXT = 'Sem dado importado';
const SOC_WORK_WITHOUT_SHIFT_TEXT = 'Trabalho sem turno localizado';
const SOC_MULTI_NAME_RE = /[\/\\\n,;]+/;

function multiNameCellText(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return cellText(value);
  return String(value).replace(/\r\n?/g, '\n').trim();
}

function splitSocCell(value: Cell): string[] {
  return multiNameCellText(value)
    .split(SOC_MULTI_NAME_RE)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitSocLogins(value: Cell): string[] {
  return splitSocCell(value)
    .map((part) => part.toLowerCase())
    .filter((part) => looksLikeLogin(part));
}

function isSocDaily(grid: Grid): boolean {
  return fold(cellText(grid[0]?.[0])) === 'dia' && SOC_SHIFT_COLS.every(([col]) => Boolean(cellText(grid[1]?.[col])));
}

function socSpecial(raw: string): { login: string; value: CellValue } | null {
  const m = raw.trim().match(/^(.+?)\s*-\s*([A-Za-z][A-Za-z0-9._-]*)$/);
  if (!m) return null;
  const code = fold(m[1]);
  const login = m[2].toLowerCase();
  if (code.startsWith('ferias')) return { login, value: { shift: 'ferias', text: raw.trim() } };
  if (code === 'du' || code === 'df' || code === 'folga' || code === 'bh' || code === 'an') {
    return { login, value: { shift: 'folga', text: raw.trim() } };
  }
  if (code === 'he') return { login, value: { shift: 'extra', text: raw.trim() } };
  if (code === '#') return { login, value: { shift: 'afastamento', text: raw.trim() } };
  return { login, value: { shift: 'custom', text: raw.trim() } };
}

function analyzeSocDaily(sheetName: string, grid: Grid, baseYear?: number): { analysis: SheetAnalysis; option: ImportOption } | null {
  if (!isSocDaily(grid)) return null;
  const analysis = baseAnalysis(sheetName, 'soc-daily');
  analysis.headerRow = 1;
  const dates: string[] = [];
  const techRows = new Map<string, TechRowInfo>();
  let records = 0;
  for (let r = 2; r < grid.length; r++) {
    const date = dateFromCell(grid[r]?.[0], baseYear);
    if (!date) {
      if (grid[r]?.some((cell) => cellText(cell))) analysis.ignoredRows.push({ row: r + 1, reason: 'data inválida', preview: rowPreview(grid[r]) });
      continue;
    }
    dates.push(dateToIso(date));
    for (const [col] of SOC_SHIFT_COLS) {
      for (const login of splitSocLogins(grid[r]?.[col])) {
        records++;
        if (!techRows.has(login)) techRows.set(login, { row: r, login, raw: login });
      }
    }
    for (const part of splitSocCell(grid[r]?.[6])) {
      const special = socSpecial(part);
      if (!special) {
        analysis.ignoredRows.push({ row: r + 1, reason: 'situação especial não reconhecida', preview: part });
        continue;
      }
      records++;
      if (!techRows.has(special.login)) techRows.set(special.login, { row: r, login: special.login, raw: special.login });
    }
  }
  analysis.months = uniqueMonthsFromDates(dates);
  analysis.technicians = [...techRows.values()];
  const start = dates[0];
  const end = dates[dates.length - 1];
  const [year, month] = end.split('-').map(Number);
  return {
    analysis,
    option: {
      key: `${sheetName}::soc-daily::${start}::${end}`,
      sheetName,
      monthKey: { year, month },
      monthLabel: `${start.slice(8, 10)}/${start.slice(5, 7)}/${start.slice(0, 4)}–${end.slice(8, 10)}/${end.slice(5, 7)}/${end.slice(0, 4)}`,
      techCount: techRows.size,
      layout: 'soc-daily',
      label: 'Período completo da aba Escala',
      periodStart: start,
      periodEnd: end,
      recordCount: records,
      technicians: [...techRows.values()],
      primary: true,
    },
  };
}

/* ------------------------------------------------------------------ */
/* SOC — aba Escalistas                                               */
/* ------------------------------------------------------------------ */

interface EscalistasInfo {
  headerRow: number;
  dateColumns: number[];
  dates: string[];
  technicians: Array<TechRowInfo & { shift: ShiftId }>;
}

function shiftIdFromLabel(value: string): ShiftId | null {
  const key = fold(value);
  if (key === 'madrugada') return 'madrugada';
  if (key === 'manha') return 'manha';
  if (key === 'tarde') return 'tarde';
  if (key === 'noite') return 'noite';
  return null;
}

function findEscalistasInfo(grid: Grid, baseYear: number): EscalistasInfo | null {
  let headerRow = -1;
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    if (grid[r].some((cell) => fold(cellText(cell)) === 'dia/mes')) {
      headerRow = r;
      break;
    }
  }
  if (headerRow < 0) return null;
  const dateColumns: number[] = [];
  const parts: Array<{ day: number; month: number }> = [];
  for (let c = 0; c < grid[headerRow].length; c++) {
    const m = cellText(grid[headerRow][c]).match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!m) continue;
    dateColumns.push(c);
    parts.push({ day: Number(m[1]), month: Number(m[2]) });
  }
  if (dateColumns.length < 20) return null;
  let year = baseYear;
  let previousMonth = parts[0].month;
  const dates = parts.map((part, index) => {
    if (index > 0 && part.month < previousMonth) year++;
    previousMonth = part.month;
    return isoDate(year, part.month, part.day);
  });

  const technicians: EscalistasInfo['technicians'] = [];
  let currentShift: ShiftId | null = null;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const shiftText = cellText(grid[r]?.[1]);
    if (fold(shiftText) === 'legenda') break;
    currentShift = shiftIdFromLabel(shiftText) ?? currentShift;
    const login = cellText(grid[r]?.[2]).toLowerCase();
    if (!currentShift || !looksLikeLogin(login) || fold(login) === 'colaborador') continue;
    technicians.push({ row: r, login, raw: login, shift: currentShift });
  }
  return { headerRow, dateColumns, dates, technicians };
}

function analyzeSocEscalistas(sheetName: string, grid: Grid, baseYear: number): { analysis: SheetAnalysis; option: ImportOption } | null {
  const info = findEscalistasInfo(grid, baseYear);
  if (!info) return null;
  const analysis = baseAnalysis(sheetName, 'soc-escalistas');
  analysis.headerRow = info.headerRow;
  analysis.months = uniqueMonthsFromDates(info.dates);
  analysis.technicians = info.technicians.map(({ shift: _shift, ...tech }) => tech);
  const start = info.dates[0];
  const end = info.dates[info.dates.length - 1];
  const [year, month] = end.split('-').map(Number);
  const recordCount = info.technicians.reduce(
    (sum, tech) => sum + info.dateColumns.filter((col) => cellText(grid[tech.row]?.[col]) !== '').length,
    0,
  );
  return {
    analysis,
    option: {
      key: `${sheetName}::soc-escalistas::${start}::${end}`,
      sheetName,
      monthKey: { year, month },
      monthLabel: `${start.slice(8, 10)}/${start.slice(5, 7)}/${start.slice(0, 4)}–${end.slice(8, 10)}/${end.slice(5, 7)}/${end.slice(0, 4)}`,
      techCount: info.technicians.length,
      layout: 'soc-escalistas',
      label: 'Período completo da aba Escalistas',
      periodStart: start,
      periodEnd: end,
      recordCount,
      technicians: analysis.technicians,
    },
  };
}

function normalizeEscalistasCode(raw: Cell, rowShift: ShiftId): CellValue | null {
  const text = cellText(raw);
  if (!text) return null;
  const key = fold(text);
  if (/^[1-6]$/.test(key)) return { shift: rowShift, text };
  if (['df', 'du', 'bh', 'folga', 'an'].includes(key)) return { shift: 'folga', text };
  if (key === 'x' || key.startsWith('ferias')) return { shift: 'ferias', text };
  if (key === 'he') return { shift: 'extra', text };
  if (key === '#') return { shift: 'afastamento', text };
  return { shift: 'custom', text };
}

/* ------------------------------------------------------------------ */
/* Relatório Plantão COSI                                             */
/* ------------------------------------------------------------------ */

interface OnCallInfo {
  headerRow: number;
  records: OnCallRecord[];
  technicians: TechRowInfo[];
  correctedToOperationalRule: number;
}

function findOnCallInfo(grid: Grid): OnCallInfo | null {
  let headerRow = -1;
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const a = fold(cellText(grid[r]?.[0]));
    const b = fold(cellText(grid[r]?.[1]));
    const c = fold(cellText(grid[r]?.[2]));
    if (a.includes('plantonista seguranca') && b.includes('data inicio') && c.includes('data fim')) {
      headerRow = r;
      break;
    }
  }
  if (headerRow < 0) return null;
  const records: OnCallRecord[] = [];
  const techMap = new Map<string, TechRowInfo>();
  let correctedToOperationalRule = 0;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const technician = cellText(grid[r]?.[0]);
    const start = parseTextualDateTime(grid[r]?.[1]);
    const end = parseTextualDateTime(grid[r]?.[2]);
    if (!technician && !start && !end) continue;
    if (!looksLikeName(technician) || !start || !end) continue;
    const durationMinutes = Math.round((localDateTimeMs(end) - localDateTimeMs(start)) / 60000);
    if (durationMinutes < 0) continue;
    const sourceRecord = { id: `plantao-${r + 1}`, technician, start, end, durationMinutes };
    const normalized = normalizeOnCallRecordToRule(sourceRecord);
    if (normalized.start !== sourceRecord.start || normalized.end !== sourceRecord.end) correctedToOperationalRule++;
    records.push(normalized);
    const key = fold(technician);
    if (!techMap.has(key)) techMap.set(key, { row: r, name: technician, raw: technician });
  }
  return { headerRow, records, technicians: [...techMap.values()], correctedToOperationalRule };
}

function dominantOnCallMonth(records: OnCallRecord[]): MonthKey {
  const counts = new Map<string, number>();
  for (const record of records) {
    const key = record.start.slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const selected = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0]
    ?? records[0].start.slice(0, 7);
  const [year, month] = selected.split('-').map(Number);
  return { year, month };
}

function analyzeOnCall(sheetName: string, grid: Grid): { analysis: SheetAnalysis; option: ImportOption } | null {
  const info = findOnCallInfo(grid);
  if (!info || !info.records.length) return null;
  const analysis = baseAnalysis(sheetName, 'oncall');
  analysis.headerRow = info.headerRow;
  analysis.technicians = info.technicians;
  if (info.correctedToOperationalRule > 0) {
    analysis.warnings.push(`${info.correctedToOperationalRule} horário(s) de borda foram ajustados à regra COSI: dias úteis 19h–07h e sexta/sábado 19h–19h.`);
  }
  const touchedDates = info.records.flatMap((record) => [record.start.slice(0, 10), record.end.slice(0, 10)]).sort();
  analysis.months = uniqueMonthsFromDates(touchedDates);
  const start = info.records.reduce((min, record) => (record.start < min ? record.start : min), info.records[0].start).slice(0, 10);
  const end = info.records.reduce((max, record) => (record.end > max ? record.end : max), info.records[0].end).slice(0, 10);
  const monthKey = dominantOnCallMonth(info.records);
  return {
    analysis,
    option: {
      key: `${sheetName}::oncall::${start}::${end}`,
      sheetName,
      monthKey,
      monthLabel: `${start.slice(8, 10)}/${start.slice(5, 7)}/${start.slice(0, 4)}–${end.slice(8, 10)}/${end.slice(5, 7)}/${end.slice(0, 4)}`,
      techCount: info.technicians.length,
      layout: 'oncall',
      label: 'Relatório completo de plantões',
      periodStart: start,
      periodEnd: end,
      recordCount: info.records.length,
      technicians: info.technicians,
      primary: true,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Parser genérico compatível                                         */
/* ------------------------------------------------------------------ */

interface MatrixHeader {
  headerRow: number;
  dayColumns: Record<number, number>;
  monthFromDates: MonthDetection | null;
}

function asDay(value: Cell): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31) return value;
  const m = cellText(value).match(/^0?([1-9]|[12]\d|3[01])$/);
  return m ? Number(m[1]) : null;
}

function findMatrixHeader(grid: Grid): MatrixHeader | null {
  let best: MatrixHeader | null = null;
  let bestCount = 0;
  for (let r = 0; r < Math.min(grid.length, 45); r++) {
    const dayColumns: Record<number, number> = {};
    const dateMonths = new Map<string, number>();
    for (let c = 0; c < grid[r].length; c++) {
      const day = asDay(grid[r][c]);
      if (day !== null && dayColumns[day] === undefined) {
        dayColumns[day] = c;
        continue;
      }
      const date = dateFromCell(grid[r][c]);
      if (date) {
        if (dayColumns[date.getDate()] === undefined) dayColumns[date.getDate()] = c;
        const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
        dateMonths.set(key, (dateMonths.get(key) ?? 0) + 1);
      }
    }
    const days = Object.keys(dayColumns).map(Number).sort((a, b) => a - b);
    let sequence = 0;
    for (let i = 0; i < days.length; i++) if (days[i] === i + 1) sequence++;
    if (days[0] !== 1 || sequence < 15 || sequence <= bestCount) continue;
    let monthFromDates: MonthDetection | null = null;
    const top = [...dateMonths.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 15) {
      const [year, month] = top[0].split('-').map(Number);
      monthFromDates = { year, month, source: 'dates', label: `datas no cabeçalho (linha ${r + 1})` };
    }
    best = { headerRow: r, dayColumns, monthFromDates };
    bestCount = sequence;
  }
  return best;
}

interface LongHeader {
  headerRow: number;
  dateCol: number;
  nameCol: number | null;
  loginCol: number | null;
  shiftCol: number;
}

function findLongHeader(grid: Grid): LongHeader | null {
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const row = grid[r].map((cell) => fold(cellText(cell)));
    let dateCol = -1;
    let nameCol = -1;
    let loginCol = -1;
    let shiftCol = -1;
    row.forEach((text, col) => {
      if (!text) return;
      if (dateCol < 0 && /^(data|dia)\b/.test(text)) dateCol = col;
      if (loginCol < 0 && /login|usuario|matricula/.test(text)) loginCol = col;
      if (nameCol < 0 && /tecnico|analista|colaborador|funcionario|^nome/.test(text)) nameCol = col;
      if (shiftCol < 0 && /turno|escala|horario|plantao|periodo/.test(text)) shiftCol = col;
    });
    if (dateCol >= 0 && shiftCol >= 0 && (nameCol >= 0 || loginCol >= 0)) {
      return { headerRow: r, dateCol, nameCol: nameCol >= 0 ? nameCol : null, loginCol: loginCol >= 0 ? loginCol : null, shiftCol };
    }
  }
  return null;
}

function genericMonths(sheetName: string, grid: Grid, matrix: MatrixHeader | null): MonthDetection[] {
  const found: MonthDetection[] = [];
  const byName = findMonthInText(sheetName);
  if (byName) found.push({ year: byName.year, month: byName.month, source: 'sheetName', label: `nome da aba “${sheetName}”` });
  const titleLimit = matrix ? matrix.headerRow : Math.min(grid.length, 10);
  for (let r = 0; r < titleLimit; r++) {
    const hit = grid[r].map(cellText).find((text) => text.length >= 3 && findMonthInText(text));
    if (!hit) continue;
    const month = findMonthInText(hit)!;
    found.push({ year: month.year, month: month.month, source: 'title', label: `título “${hit.slice(0, 40)}” (linha ${r + 1})` });
    break;
  }
  if (matrix?.monthFromDates) found.push(matrix.monthFromDates);
  const merged = new Map<number, MonthDetection>();
  for (const value of found) {
    const previous = merged.get(value.month);
    if (!previous || (previous.year === null && value.year !== null)) merged.set(value.month, value);
  }
  return [...merged.values()];
}

function isWeekdayRow(row: Cell[]): boolean {
  const normalized = row
    .map((cell) => fold(cellText(cell)))
    .filter((text) => /^(dom|seg|ter|qua|qui|sex|sab|d|s|t|q)$/.test(text))
    .map((text) => text.charAt(0));
  if (normalized.length < 7) return false;

  const week = ['d', 's', 't', 'q', 'q', 's', 's'];
  const sample = normalized.slice(0, 7);
  return week.some((_, offset) => sample.every((value, index) => value === week[(index + offset) % 7]));
}

function analyzeGenericSheet(sheetName: string, grid: Grid): SheetAnalysis {
  const matrix = findMatrixHeader(grid);
  const long = findLongHeader(grid);
  if (matrix && (!long || matrix.headerRow <= long.headerRow)) {
    const analysis = baseAnalysis(sheetName, 'matrix');
    analysis.headerRow = matrix.headerRow;
    analysis.dayColumns = matrix.dayColumns;
    analysis.months = genericMonths(sheetName, grid, matrix);
    const firstDayCol = Math.min(...Object.values(matrix.dayColumns));
    for (let r = matrix.headerRow + 1; r < grid.length; r++) {
      if (isWeekdayRow(grid[r])) continue;
      const labels = grid[r].slice(0, firstDayCol).map(cellText).filter(Boolean);
      if (!labels.length) continue;
      const joined = labels.join(' ');
      if (TECH_NOISE_RE.test(fold(joined))) {
        analysis.ignoredRows.push({ row: r + 1, reason: 'linha de legenda/observação', preview: rowPreview(grid[r]) });
        continue;
      }
      let login: string | undefined;
      let name: string | undefined;
      for (const part of labels) {
        const identity = parseIdentity(part);
        if (!identity) continue;
        if (!login && identity.login) login = identity.login;
        if (!name && identity.name) name = identity.name;
      }
      if (!login && !name) {
        const identity = parseIdentity(joined);
        if (identity) ({ login, name } = identity);
      }
      if (!login && !name) continue;
      analysis.technicians.push({ row: r, login, name, raw: labels.join(' | ') });
    }
    if (!analysis.months.length) analysis.warnings.push('Mês não identificado.');
    return analysis;
  }
  if (long) {
    const analysis = baseAnalysis(sheetName, 'long');
    analysis.headerRow = long.headerRow;
    const months = new Map<string, MonthDetection>();
    const techs = new Map<string, TechRowInfo>();
    for (let r = long.headerRow + 1; r < grid.length; r++) {
      const date = dateFromCell(grid[r]?.[long.dateCol]);
      const rawLogin = long.loginCol === null ? '' : cellText(grid[r]?.[long.loginCol]);
      const rawName = long.nameCol === null ? '' : cellText(grid[r]?.[long.nameCol]);
      if (!date) {
        if (rawLogin || rawName) analysis.ignoredRows.push({ row: r + 1, reason: 'data inválida ou ausente', preview: rowPreview(grid[r]) });
        continue;
      }
      const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
      months.set(key, { year: date.getFullYear(), month: date.getMonth() + 1, source: 'dates', label: `datas da coluna (${monthLabel(date.getFullYear(), date.getMonth() + 1)})` });
      let login = looksLikeLogin(rawLogin) ? rawLogin.toLowerCase() : undefined;
      let name = looksLikeName(rawName) ? rawName : undefined;
      if (!login && !name && rawName) {
        const identity = parseIdentity(rawName);
        if (identity) ({ login, name } = identity);
      }
      if (!login && !name) continue;
      const tKey = technicianKey(login, name);
      if (!techs.has(tKey)) techs.set(tKey, { row: r, login, name, raw: rawLogin || rawName });
    }
    analysis.months = [...months.values()].sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.month - b.month);
    analysis.technicians = [...techs.values()];
    return analysis;
  }
  const analysis = baseAnalysis(sheetName, 'unknown');
  analysis.errors.push(grid.flat().some((cell) => cellText(cell)) ? 'Layout não reconhecido.' : 'Aba vazia.');
  return analysis;
}

/* ------------------------------------------------------------------ */
/* Arquivo inteiro e construção                                       */
/* ------------------------------------------------------------------ */

export function readWorkbook(data: ArrayBuffer | Uint8Array): XLSX.WorkBook {
  return XLSX.read(data, { type: 'array', cellDates: true });
}

function workbookBaseYear(wb: XLSX.WorkBook): number {
  for (const name of wb.SheetNames) {
    const grid = sheetToGrid(wb.Sheets[name]);
    for (const row of grid.slice(0, 80)) {
      for (const cell of row) {
        const date = dateFromCell(cell);
        if (date) return date.getFullYear();
      }
    }
  }
  return new Date().getFullYear();
}

function buildSocCombinedOptions(options: ImportOption[]): ImportOption[] {
  const dailies = options.filter((option) => option.layout === 'soc-daily');
  const escalistas = options.filter((option) => option.layout === 'soc-escalistas');
  const combined: ImportOption[] = [];
  for (const daily of dailies) {
    for (const escalista of escalistas) {
      if (daily.periodStart !== escalista.periodStart || daily.periodEnd !== escalista.periodEnd) continue;
      const technicians = new Map<string, TechRowInfo>();
      for (const tech of [...(daily.technicians ?? []), ...(escalista.technicians ?? [])]) {
        technicians.set(technicianKey(tech.login, tech.name), tech);
      }
      combined.push({
        key: `${daily.sheetName}+${escalista.sheetName}::soc-combined::${daily.periodStart}::${daily.periodEnd}`,
        sheetName: daily.sheetName,
        monthKey: daily.monthKey,
        monthLabel: daily.monthLabel,
        techCount: technicians.size,
        layout: 'soc-combined',
        label: 'Período completo cruzando Escala + Escalistas',
        periodStart: daily.periodStart,
        periodEnd: daily.periodEnd,
        recordCount: (daily.recordCount ?? 0) + (escalista.recordCount ?? 0),
        technicians: [...technicians.values()],
        socDailySheetName: daily.sheetName,
        socEscalistasSheetName: escalista.sheetName,
        primary: true,
      });
    }
  }
  return combined;
}

export function analyzeWorkbook(wb: XLSX.WorkBook, fileName: string): WorkbookAnalysis {
  const sheets: SheetAnalysis[] = [];
  const options: ImportOption[] = [];
  const baseYear = workbookBaseYear(wb);

  for (const sheetName of wb.SheetNames) {
    const grid = sheetToGrid(wb.Sheets[sheetName]);
    const n1 = analyzeN1Sheet(sheetName, grid);
    if (n1) {
      sheets.push(n1.analysis);
      options.push(...n1.options);
      continue;
    }
    const socDaily = analyzeSocDaily(sheetName, grid, baseYear);
    if (socDaily) {
      sheets.push(socDaily.analysis);
      options.push(socDaily.option);
      continue;
    }
    const escalistas = analyzeSocEscalistas(sheetName, grid, baseYear);
    if (escalistas) {
      sheets.push(escalistas.analysis);
      options.push(escalistas.option);
      continue;
    }
    const onCall = analyzeOnCall(sheetName, grid);
    if (onCall) {
      sheets.push(onCall.analysis);
      options.push(onCall.option);
      continue;
    }

    const generic = analyzeGenericSheet(sheetName, grid);
    sheets.push(generic);
    if (generic.layout === 'matrix' || generic.layout === 'long') {
      for (const detected of generic.months) {
        if (!detected.month) continue;
        const year = detected.year ?? baseYear;
        options.push({
          key: `${sheetName}::generic::${year}-${detected.month}`,
          sheetName,
          monthKey: { year, month: detected.month },
          monthLabel: monthLabel(year, detected.month),
          techCount: generic.technicians.length,
          layout: generic.layout,
          technicians: generic.technicians,
        });
      }
    }
  }

  // A mesma aba/mês/bloco gera apenas uma opção.
  const baseOptions = [...new Map(options.map((option) => [option.key, option])).values()];
  const deduped = [...new Map([...baseOptions, ...buildSocCombinedOptions(baseOptions)].map((option) => [option.key, option])).values()];
  const errors = deduped.length ? [] : ['Nenhuma aba com escala reconhecível foi encontrada neste arquivo.'];
  return { fileName, sheets, options: deduped, errors };
}

let techSeq = 0;
export function newTechId(): string {
  techSeq += 1;
  return `t${Date.now().toString(36)}${techSeq}`;
}

function putCell(
  cells: ScheduleState['cells'],
  techId: string,
  day: number,
  value: CellValue | null,
  counters: { recognized: number; custom: number },
): void {
  if (!value) return;
  const row = (cells[techId] ??= {});
  const previous = row[day];
  if (previous) {
    if (previous.shift === 'custom') counters.custom--;
    else counters.recognized--;
  }
  row[day] = value;
  if (value.shift === 'custom') counters.custom++;
  else counters.recognized++;
}

function buildN1(wb: XLSX.WorkBook, analysis: WorkbookAnalysis, option: ImportOption): ImportResult {
  const grid = sheetToGrid(wb.Sheets[option.sheetName]);
  const blocks = findN1Blocks(grid);
  const block = blocks.find((candidate) => candidate.info.id === option.blockId);
  if (!block) throw new Error('Bloco da escala N1 não encontrado.');

  if (option.serviceDeskN1) {
    const secondary = option.secondaryBlockId
      ? blocks.find((candidate) => candidate.info.id === option.secondaryBlockId)
      : undefined;
    const technicians: Technician[] = [];
    const idsByPerson = new Map<string, string>();
    const counters = { recognized: 0, custom: 0 };

    const buildRows = (source: N1BlockData, prefix: string): ServiceDeskN1Row[] =>
      source.technicians.map((info, index) => {
        const personKey = fold(info.name ?? info.login ?? info.raw);
        let technicianId = idsByPerson.get(personKey);
        if (!technicianId) {
          technicianId = newTechId();
          idsByPerson.set(personKey, technicianId);
          technicians.push({ id: technicianId, name: info.name });
        }
        const rowCells: Record<number, CellValue | undefined> = {};
        source.dateColumns.forEach((col, dayIndex) => {
          const value = normalizeN1Value(grid[info.row]?.[col]);
          if (!value) return;
          rowCells[dayIndex + 1] = value;
          if (value.shift === 'custom') counters.custom += 1;
          else counters.recognized += 1;
        });
        const fullName = info.name ?? info.raw;
        return {
          id: `${prefix}-${info.row + 1}-${index + 1}`,
          technicianId,
          personKey,
          fullName,
          displayName: shortPersonName(fullName),
          employeeCode: info.employeeCode,
          shift: info.shift,
          pauseTime: info.pauseTime,
          sourceRow: info.row + 1,
          cells: rowCells,
        };
      });

    const principalRows = buildRows(block, 'n1-main');
    const emailGuaranteeRows = secondary ? buildRows(secondary, 'n1-eg') : [];
    const cells: ScheduleState['cells'] = {};
    for (const row of principalRows) {
      const target = (cells[row.technicianId] ??= {});
      for (const [day, value] of Object.entries(row.cells)) {
        if (value) target[Number(day)] = value;
      }
    }
    const totalRows = principalRows.length + emailGuaranteeRows.length;
    const totalPossible = totalRows * block.dates.length;
    const filled = counters.recognized + counters.custom;
    return {
      state: {
        monthKey: option.monthKey,
        technicians,
        cells,
        dates: block.dates,
        sourceLabel: `${analysis.fileName} · ${option.sheetName} · Service Desk N1`,
        serviceDeskN1: {
          principalRows,
          emailGuaranteeRows,
          principalLegend: block.legend,
          emailGuaranteeLegend: secondary?.legend ?? [],
        },
      },
      recognizedShifts: counters.recognized,
      customShifts: counters.custom,
      emptyCells: Math.max(0, totalPossible - filled),
      importedRecords: filled,
    };
  }

  const technicians: Technician[] = [];
  const cells: ScheduleState['cells'] = {};
  const counters = { recognized: 0, custom: 0 };
  const idsByTechnician = new Map<string, string>();
  for (const info of block.technicians) {
    const key = fold(info.name ?? info.login ?? info.raw);
    let id = idsByTechnician.get(key);
    if (!id) {
      id = newTechId();
      idsByTechnician.set(key, id);
      technicians.push({ id, login: info.login, name: info.name });
    }
    block.dateColumns.forEach((col, index) => {
      const value = normalizeN1Value(grid[info.row]?.[col]);
      if (value) putCell(cells, id!, index + 1, value, counters);
    });
  }
  const filled = counters.recognized + counters.custom;
  return {
    state: {
      monthKey: option.monthKey,
      technicians,
      cells,
      dates: block.dates,
      sourceLabel: `${analysis.fileName} · ${option.sheetName} · ${option.label ?? block.info.title}`,
    },
    recognizedShifts: counters.recognized,
    customShifts: counters.custom,
    emptyCells: technicians.length * block.dates.length - filled,
    importedRecords: filled,
  };
}

function remapCellsToOperationalCycle(
  cells: ScheduleState['cells'],
  sourceDates: string[],
  monthKey: MonthKey,
): { dates: string[]; cells: ScheduleState['cells'] } {
  const dates = cycle25To26(monthKey).dates;
  const targetIndex = new Map(dates.map((date, index) => [date, index + 1]));
  const remapped: ScheduleState['cells'] = {};
  for (const [technicianId, row] of Object.entries(cells)) {
    const target: Record<number, CellValue | undefined> = {};
    for (const [sourceDay, value] of Object.entries(row)) {
      const date = sourceDates[Number(sourceDay) - 1];
      const day = date ? targetIndex.get(date) : undefined;
      if (day && value) target[day] = value;
    }
    remapped[technicianId] = target;
  }
  return { dates, cells: remapped };
}

interface SocDailyInfo {
  dates: string[];
  logins: Set<string>;
  cellsByLoginAndDate: Map<string, Map<string, CellValue>>;
}

function readSocDailyInfo(grid: Grid, baseYear?: number): SocDailyInfo {
  const dates: string[] = [];
  const logins = new Set<string>();
  const cellsByLoginAndDate = new Map<string, Map<string, CellValue>>();

  const setValue = (login: string, date: string, value: CellValue) => {
    logins.add(login);
    const row = cellsByLoginAndDate.get(login) ?? new Map<string, CellValue>();
    row.set(date, value);
    cellsByLoginAndDate.set(login, row);
  };

  for (let r = 2; r < grid.length; r++) {
    const date = dateFromCell(grid[r]?.[0], baseYear);
    if (!date) continue;
    const dateIso = dateToIso(date);
    dates.push(dateIso);
    for (const [col, shift] of SOC_SHIFT_COLS) {
      for (const login of splitSocLogins(grid[r]?.[col])) {
        setValue(login, dateIso, { shift });
      }
    }
    for (const raw of splitSocCell(grid[r]?.[6])) {
      const special = socSpecial(raw);
      if (special) setValue(special.login, dateIso, special.value);
    }
  }

  return { dates, logins, cellsByLoginAndDate };
}

function countCells(cells: ScheduleState['cells']): number {
  return Object.values(cells).reduce((sum, row) => sum + Object.keys(row).length, 0);
}

function buildSocDaily(wb: XLSX.WorkBook, analysis: WorkbookAnalysis, option: ImportOption): ImportResult {
  const grid = sheetToGrid(wb.Sheets[option.sheetName]);
  const info = readSocDailyInfo(grid, Number(option.periodStart?.slice(0, 4) ?? option.monthKey.year));
  const technicians: Technician[] = [];
  const byLogin = new Map<string, string>();
  for (const login of [...info.logins].sort()) {
    const id = newTechId();
    byLogin.set(login, id);
    technicians.push({ id, login });
  }
  const cells: ScheduleState['cells'] = {};
  const counters = { recognized: 0, custom: 0 };
  for (const [login, row] of info.cellsByLoginAndDate) {
    const id = byLogin.get(login);
    if (!id) continue;
    info.dates.forEach((date, dateIndex) => putCell(cells, id, dateIndex + 1, row.get(date) ?? null, counters));
  }
  const filled = countCells(cells);
  const cycle = remapCellsToOperationalCycle(cells, info.dates, option.monthKey);
  return {
    state: { monthKey: option.monthKey, technicians, cells: cycle.cells, dates: cycle.dates, visualGrouping: 'operational-shift', sourceLabel: `${analysis.fileName} · ${option.sheetName} · ciclo 25–26` },
    recognizedShifts: counters.recognized,
    customShifts: counters.custom,
    emptyCells: technicians.length * cycle.dates.length - filled,
    importedRecords: counters.recognized + counters.custom,
  };
}

function explicitSocNoData(): CellValue {
  return { shift: 'custom', text: SOC_NO_DATA_TEXT };
}

function explicitSocWorkWithoutShift(rawCode: string): CellValue {
  return { shift: 'custom', text: `${SOC_WORK_WITHOUT_SHIFT_TEXT} (${rawCode})` };
}

function isOperationalSocShift(value: CellValue | undefined): value is CellValue & { shift: 'madrugada' | 'manha' | 'tarde' | 'noite' } {
  return value?.shift === 'madrugada' || value?.shift === 'manha' || value?.shift === 'tarde' || value?.shift === 'noite';
}

function combineSocValue(status: CellValue | null, dailyValue: CellValue | undefined): CellValue {
  const statusKey = fold(status?.text ?? '');
  if (/^[1-6]$/.test(statusKey)) {
    return isOperationalSocShift(dailyValue) ? { shift: dailyValue.shift, text: status?.text } : explicitSocWorkWithoutShift(status?.text ?? statusKey);
  }
  if (statusKey === 'he') return { shift: 'extra', text: status?.text ?? 'HE' };
  if (status) return status;
  if (dailyValue) return dailyValue;
  return explicitSocNoData();
}

function buildSocCombined(wb: XLSX.WorkBook, analysis: WorkbookAnalysis, option: ImportOption): ImportResult {
  const dailySheetName = option.socDailySheetName;
  const escalistasSheetName = option.socEscalistasSheetName;
  if (!dailySheetName || !escalistasSheetName) throw new Error('Opção SOC combinada sem abas fonte.');

  const baseYear = Number(option.periodStart?.slice(0, 4) ?? option.monthKey.year);
  const dailyInfo = readSocDailyInfo(sheetToGrid(wb.Sheets[dailySheetName]), baseYear);
  const escalistasGrid = sheetToGrid(wb.Sheets[escalistasSheetName]);
  const escalistasInfo = findEscalistasInfo(escalistasGrid, baseYear);
  if (!escalistasInfo) throw new Error('Estrutura da aba Escalistas não encontrada.');

  const logins = new Set<string>(dailyInfo.logins);
  for (const tech of escalistasInfo.technicians) {
    if (tech.login) logins.add(tech.login);
  }

  const dates = escalistasInfo.dates;
  const technicians: Technician[] = [];
  const byLogin = new Map<string, string>();
  for (const login of [...logins].sort()) {
    const id = newTechId();
    byLogin.set(login, id);
    technicians.push({ id, login });
  }

  const statuses = new Map<string, Map<string, CellValue | null>>();
  for (const tech of escalistasInfo.technicians) {
    if (!tech.login) continue;
    const row = statuses.get(tech.login) ?? new Map<string, CellValue | null>();
    escalistasInfo.dateColumns.forEach((col, index) => {
      const date = escalistasInfo.dates[index];
      if (date) row.set(date, normalizeEscalistasCode(escalistasGrid[tech.row]?.[col], tech.shift));
    });
    statuses.set(tech.login, row);
  }

  const cells: ScheduleState['cells'] = {};
  const counters = { recognized: 0, custom: 0 };
  for (const login of [...logins].sort()) {
    const id = byLogin.get(login);
    if (!id) continue;
    dates.forEach((date, index) => {
      const status = statuses.get(login)?.get(date) ?? null;
      const dailyValue = dailyInfo.cellsByLoginAndDate.get(login)?.get(date);
      putCell(cells, id, index + 1, combineSocValue(status, dailyValue), counters);
    });
  }

  const filled = countCells(cells);
  return {
    state: {
      monthKey: option.monthKey,
      technicians,
      cells,
      dates,
      visualGrouping: 'operational-shift',
      sourceLabel: `${analysis.fileName} · ${dailySheetName} + ${escalistasSheetName}`,
    },
    recognizedShifts: counters.recognized,
    customShifts: counters.custom,
    emptyCells: technicians.length * dates.length - filled,
    importedRecords: filled,
  };
}

function buildSocEscalistas(wb: XLSX.WorkBook, analysis: WorkbookAnalysis, option: ImportOption): ImportResult {
  const grid = sheetToGrid(wb.Sheets[option.sheetName]);
  const info = findEscalistasInfo(grid, Number(option.periodStart?.slice(0, 4) ?? option.monthKey.year));
  if (!info) throw new Error('Estrutura da aba Escalistas não encontrada.');
  const technicians: Technician[] = [];
  const cells: ScheduleState['cells'] = {};
  const counters = { recognized: 0, custom: 0 };
  for (const tech of info.technicians) {
    const id = newTechId();
    technicians.push({ id, login: tech.login });
    info.dateColumns.forEach((col, index) => putCell(cells, id, index + 1, normalizeEscalistasCode(grid[tech.row]?.[col], tech.shift), counters));
  }
  const filled = counters.recognized + counters.custom;
  const cycle = remapCellsToOperationalCycle(cells, info.dates, option.monthKey);
  return {
    state: { monthKey: option.monthKey, technicians, cells: cycle.cells, dates: cycle.dates, visualGrouping: 'operational-shift', sourceLabel: `${analysis.fileName} · ${option.sheetName} · ciclo 25–26` },
    recognizedShifts: counters.recognized,
    customShifts: counters.custom,
    emptyCells: technicians.length * cycle.dates.length - filled,
    importedRecords: filled,
  };
}

function buildOnCall(wb: XLSX.WorkBook, analysis: WorkbookAnalysis, option: ImportOption): ImportResult {
  const info = findOnCallInfo(sheetToGrid(wb.Sheets[option.sheetName]));
  if (!info) throw new Error('Estrutura do relatório de plantões não encontrada.');
  const technicians = info.technicians.map((tech) => ({ id: newTechId(), name: tech.name }));
  return {
    state: {
      monthKey: option.monthKey,
      technicians,
      cells: {},
      dates: cycle25To26(option.monthKey).dates,
      viewType: 'oncall',
      onCallRecords: info.records,
      sourceLabel: `${analysis.fileName} · ${option.sheetName} · ciclo 25–26`,
    },
    recognizedShifts: info.records.length,
    customShifts: 0,
    emptyCells: 0,
    importedRecords: info.records.length,
  };
}

function buildGeneric(wb: XLSX.WorkBook, analysis: WorkbookAnalysis, option: ImportOption): ImportResult {
  const sheet = analysis.sheets.find((candidate) => candidate.sheetName === option.sheetName);
  if (!sheet) throw new Error('Aba não encontrada na análise.');
  const grid = sheetToGrid(wb.Sheets[option.sheetName]);
  const technicians: Technician[] = [];
  const cells: ScheduleState['cells'] = {};
  const counters = { recognized: 0, custom: 0 };
  if (sheet.layout === 'matrix' && sheet.dayColumns) {
    for (const info of sheet.technicians) {
      const id = newTechId();
      technicians.push({ id, login: info.login, name: info.name });
      for (const [day, col] of Object.entries(sheet.dayColumns)) putCell(cells, id, Number(day), normalizeShift(grid[info.row]?.[col]), counters);
    }
  } else if (sheet.layout === 'long') {
    const header = findLongHeader(grid);
    if (!header) throw new Error('Cabeçalho do relatório não encontrado.');
    const byKey = new Map<string, string>();
    for (let r = header.headerRow + 1; r < grid.length; r++) {
      const date = dateFromCell(grid[r]?.[header.dateCol]);
      if (!date || date.getFullYear() !== option.monthKey.year || date.getMonth() + 1 !== option.monthKey.month) continue;
      const rawLogin = header.loginCol === null ? '' : cellText(grid[r]?.[header.loginCol]);
      const rawName = header.nameCol === null ? '' : cellText(grid[r]?.[header.nameCol]);
      let login = looksLikeLogin(rawLogin) ? rawLogin.toLowerCase() : undefined;
      let name = looksLikeName(rawName) ? rawName : undefined;
      if (!login && !name && rawName) {
        const identity = parseIdentity(rawName);
        if (identity) ({ login, name } = identity);
      }
      if (!login && !name) continue;
      const key = technicianKey(login, name);
      let id = byKey.get(key);
      if (!id) {
        id = newTechId();
        byKey.set(key, id);
        technicians.push({ id, login, name });
      }
      putCell(cells, id, date.getDate(), normalizeShift(grid[r]?.[header.shiftCol]), counters);
    }
  }
  const total = daysInMonth(option.monthKey.year, option.monthKey.month);
  const filled = counters.recognized + counters.custom;
  return {
    state: { monthKey: option.monthKey, technicians, cells, sourceLabel: `${analysis.fileName} · ${option.sheetName}` },
    recognizedShifts: counters.recognized,
    customShifts: counters.custom,
    emptyCells: technicians.length * total - filled,
    importedRecords: filled,
  };
}

export function buildSchedule(wb: XLSX.WorkBook, analysis: WorkbookAnalysis, optionKey: string): ImportResult {
  const option = analysis.options.find((candidate) => candidate.key === optionKey);
  if (!option) throw new Error(`Opção de importação inválida: ${optionKey}`);
  switch (option.layout) {
    case 'n1': return buildN1(wb, analysis, option);
    case 'soc-daily': return buildSocDaily(wb, analysis, option);
    case 'soc-escalistas': return buildSocEscalistas(wb, analysis, option);
    case 'soc-combined': return buildSocCombined(wb, analysis, option);
    case 'oncall': return buildOnCall(wb, analysis, option);
    case 'matrix':
    case 'long': return buildGeneric(wb, analysis, option);
    default: throw new Error(`Layout não importável: ${option.layout}`);
  }
}
