import { SHIFT_BY_ID } from '../constants';
import type { ShiftDef, ShiftId } from '../types';
import { fold } from './normalize';

export interface ScheduleToken {
  code: string;
  label: string;
  colorHex: string;
  countsAsOff: boolean;
  order: number;
}

const FALLBACK_COLOR_HEX = '#6b7280';

export const TURNO_TOKENS: ScheduleToken[] = [
  { code: 'Md', label: 'Madrugada', colorHex: '#6366F1', countsAsOff: false, order: 1 },
  { code: 'M', label: 'Manhã', colorHex: '#FACC15', countsAsOff: false, order: 2 },
  { code: 'T', label: 'Tarde', colorHex: '#F97316', countsAsOff: false, order: 3 },
  { code: 'N', label: 'Noite', colorHex: '#1D4ED8', countsAsOff: false, order: 4 },
];

export const SITUACAO_TOKENS: ScheduleToken[] = [
  { code: 'DU', label: 'DSR — Dia útil', colorHex: '#EA580C', countsAsOff: true, order: 5 },
  { code: 'DF', label: 'DSR — Final de semana', colorHex: '#E11D48', countsAsOff: true, order: 6 },
  { code: 'BH', label: 'Compensação BH', colorHex: '#D97706', countsAsOff: false, order: 7 },
  { code: 'AN', label: 'Folga Aniversário', colorHex: '#06B6D4', countsAsOff: false, order: 8 },
  { code: 'X', label: 'Férias', colorHex: '#2563EB', countsAsOff: false, order: 9 },
  { code: '#', label: 'Afastamento/Atestado', colorHex: '#374151', countsAsOff: false, order: 10 },
  { code: 'Folga', label: 'Folga — Feriado', colorHex: '#7C3AED', countsAsOff: true, order: 11 },
  { code: 'HE', label: 'Hora Extra', colorHex: '#16A34A', countsAsOff: false, order: 12 },
];

export const ALL_SCHEDULE_TOKENS: ScheduleToken[] = [...TURNO_TOKENS, ...SITUACAO_TOKENS];

const TURNO_TOKEN_BY_SHIFT: Partial<Record<ShiftId, ScheduleToken>> = {
  madrugada: TURNO_TOKENS[0],
  manha: TURNO_TOKENS[1],
  tarde: TURNO_TOKENS[2],
  noite: TURNO_TOKENS[3],
};

const SITUACAO_TOKEN_BY_CODE: Record<string, ScheduleToken> = Object.fromEntries(
  SITUACAO_TOKENS.map((token) => [fold(token.code), token]),
);

function tokenByCode(code: string): ScheduleToken {
  return SITUACAO_TOKEN_BY_CODE[fold(code)];
}

function fallbackTokenForShift(shift: ShiftId): ScheduleToken {
  const shiftDef = (SHIFT_BY_ID as Record<string, ShiftDef | undefined>)[shift];
  return {
    code: shiftDef?.code ?? String(shift),
    label: shiftDef?.label ?? String(shift),
    colorHex: FALLBACK_COLOR_HEX,
    countsAsOff: false,
    order: 999,
  };
}

export function situationForAssignment(shift: ShiftId, text: string | undefined): ScheduleToken {
  const normalizedText = fold(text ?? '');

  if (shift === 'folga') {
    if (normalizedText === 'du') return tokenByCode('DU');
    if (normalizedText === 'df') return tokenByCode('DF');
    if (normalizedText === 'bh') return tokenByCode('BH');
    if (normalizedText === 'an') return tokenByCode('AN');
    return tokenByCode('Folga');
  }

  if (shift === 'ferias') return tokenByCode('X');
  if (shift === 'extra') return tokenByCode('HE');
  if (shift === 'afastamento') return tokenByCode('#');

  const turnoToken = TURNO_TOKEN_BY_SHIFT[shift];
  return turnoToken ?? fallbackTokenForShift(shift);
}
