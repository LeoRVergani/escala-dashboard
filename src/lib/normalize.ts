import { MONTHS_PT } from '../constants';
import type { CellValue, ShiftId } from '../types';

/** Remove acentos e normaliza espaços/caixa para comparação. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/* ---------- Dicionário de turnos ---------- */

const SHIFT_ALIASES: Array<[ShiftId, string[]]> = [
  ['madrugada', ['mad', 'madrugada', 'madrug', 'md']],
  ['manha', ['m', 'manha', 'mh', 'matutino', 'diurno 1']],
  ['tarde', ['t', 'tarde', 'td', 'vespertino']],
  ['noite', ['n', 'noite', 'nt', 'noturno']],
  ['folga', ['f', 'fo', 'folga', 'dsr', 'descanso', 'off']],
  ['ferias', ['fe', 'ferias', 'fer', 'vac', 'vacation']],
  ['plantao', ['p', 'pl', 'plantao', 'sobreaviso', 'on-call', 'oncall', '12x36', '24x48']],
  ['comercial', ['hc', 'com', 'comercial', 'horario comercial', 'adm', 'administrativo', 'expediente']],
  ['extra', ['he', 'extra', 'hora extra', 'h.e', 'h.e.']],
  ['afastamento', ['af', 'afastamento', 'afastado', 'atestado', 'licenca', 'licenca medica', 'inss', 'lm']],
];

const ALIAS_MAP = new Map<string, ShiftId>();
for (const [id, aliases] of SHIFT_ALIASES) {
  for (const a of aliases) ALIAS_MAP.set(a, id);
}

/** Interpreta faixa de horário como "07:00-15:00", "22h às 06h", "8-18". */
function shiftFromTimeRange(raw: string): ShiftId | null {
  const m = raw.match(
    /(\d{1,2})[:h]?(\d{2})?\s*(?:-|–|—|a|as|às|ate|até)\s*(\d{1,2})[:h]?(\d{2})?/i,
  );
  if (!m) return null;
  const start = parseInt(m[1], 10);
  const end = parseInt(m[3], 10);
  if (start > 23 || end > 23) return null;
  const span = (end - start + 24) % 24 || 24;
  if (start >= 7 && start <= 10 && span >= 8 && span <= 11) return 'comercial';
  if (span >= 12) return 'plantao';
  if (start >= 0 && start < 5) return 'madrugada';
  if (start >= 5 && start < 12) return 'manha';
  if (start >= 12 && start < 18) return 'tarde';
  return 'noite';
}

/**
 * Converte o texto bruto de uma célula em CellValue.
 * Retorna null para vazio; valores não reconhecidos viram `custom`
 * preservando o texto original.
 */
export function normalizeShift(rawInput: unknown): CellValue | null {
  if (rawInput === null || rawInput === undefined) return null;
  const raw = String(rawInput).trim();
  if (!raw || raw === '-' || raw === '—' || raw === '.') return null;

  const key = fold(raw).replace(/\.$/, '');
  const direct = ALIAS_MAP.get(key);
  if (direct) return { shift: direct, text: raw };

  // "FÉRIAS 01-15", "PLANTÃO NOTURNO" etc.: casa pelo primeiro token conhecido
  // ANTES de tentar faixa de horário, para "01-15" não virar duração.
  const firstToken = key.split(/[\s/]+/)[0];
  const byToken = ALIAS_MAP.get(firstToken);
  if (byToken) return { shift: byToken, text: raw };

  const byTime = shiftFromTimeRange(raw);
  if (byTime) return { shift: byTime, text: raw };

  return { shift: 'custom', text: raw };
}

/* ---------- Login × Nome ---------- */

const LOGIN_RE = /^[a-z][a-z0-9._-]{1,29}$/i;

export function looksLikeLogin(s: string): boolean {
  const t = s.trim();
  if (!t || /\s/.test(t)) return false;
  if (!LOGIN_RE.test(t)) return false;
  // Um token curto todo em maiúsculas tende a ser código de turno, não login.
  if (t.length <= 3 && t === t.toUpperCase()) return false;
  return true;
}

export function looksLikeName(s: string): boolean {
  const t = s.trim();
  if (t.length < 3) return false;
  const words = t.split(/\s+/);
  if (words.length < 2) return false;
  return words.every((w) => /^[\p{L}'.-]+$/u.test(w));
}

export interface ParsedIdentity {
  login?: string;
  name?: string;
}

/** Interpreta "Ana Souza (asouza)", "asouza - Ana Souza", login puro ou nome puro. */
export function parseIdentity(raw: string): ParsedIdentity | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return null;

  const paren = t.match(/^(.+?)\s*[([]\s*([A-Za-z0-9._-]+)\s*[)\]]$/);
  if (paren && looksLikeName(paren[1]) && looksLikeLogin(paren[2])) {
    return { name: paren[1].trim(), login: paren[2].toLowerCase() };
  }
  const parenRev = t.match(/^([A-Za-z0-9._-]+)\s*[([]\s*(.+?)\s*[)\]]$/);
  if (parenRev && looksLikeLogin(parenRev[1]) && looksLikeName(parenRev[2])) {
    return { login: parenRev[1].toLowerCase(), name: parenRev[2].trim() };
  }
  const dash = t.match(/^([A-Za-z0-9._-]+)\s*[-–—]\s*(.+)$/);
  if (dash && looksLikeLogin(dash[1]) && looksLikeName(dash[2])) {
    return { login: dash[1].toLowerCase(), name: dash[2].trim() };
  }
  if (looksLikeName(t)) return { name: t };
  if (looksLikeLogin(t)) return { login: t.toLowerCase() };
  return null;
}

/* ---------- Detecção de mês ---------- */

export interface FoundMonth {
  month: number;
  year: number | null;
}

/** Procura mês (pt-BR por extenso/abreviado, mm/aaaa, aaaa-mm) em um texto. */
export function findMonthInText(text: string): FoundMonth | null {
  const t = fold(text);

  for (let i = 0; i < MONTHS_PT.length; i++) {
    const full = fold(MONTHS_PT[i]);
    const abbr = full.slice(0, 3);
    const re = new RegExp(`(?:^|[^a-z])(${full}|${abbr})(?:[^a-z]|$)`);
    if (re.test(t)) {
      const fullYear = t.match(/(?:19|20)\d{2}/);
      const shortYear = t.match(/(?:^|[_\s-])(\d{2})(?:$|[^0-9])/);
      const year = fullYear
        ? parseInt(fullYear[0], 10)
        : shortYear
          ? 2000 + parseInt(shortYear[1], 10)
          : null;
      return { month: i + 1, year };
    }
  }
  const numeric =
    t.match(/(?:^|\D)(0?[1-9]|1[0-2])\s*[/\-.]\s*((?:19|20)\d{2})(?:\D|$)/) ??
    null;
  if (numeric) return { month: parseInt(numeric[1], 10), year: parseInt(numeric[2], 10) };
  const iso = t.match(/((?:19|20)\d{2})\s*[/\-.]\s*(0?[1-9]|1[0-2])(?:\D|$)/);
  if (iso) return { month: parseInt(iso[2], 10), year: parseInt(iso[1], 10) };
  return null;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
