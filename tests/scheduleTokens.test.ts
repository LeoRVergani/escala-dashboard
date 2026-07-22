import { describe, expect, it } from 'vitest';
import {
  ALL_SCHEDULE_TOKENS,
  SITUACAO_TOKENS,
  TURNO_TOKENS,
  situationForAssignment,
} from '../src/lib/scheduleTokens';

describe('tokens canônicos da escala SOC', () => {
  it('define os 4 turnos com código, rótulo e cor exatos da spec', () => {
    expect(TURNO_TOKENS.map(({ code, label, colorHex }) => ({ code, label, colorHex }))).toEqual([
      { code: 'Md', label: 'Madrugada', colorHex: '#6366F1' },
      { code: 'M', label: 'Manhã', colorHex: '#FACC15' },
      { code: 'T', label: 'Tarde', colorHex: '#F97316' },
      { code: 'N', label: 'Noite', colorHex: '#1D4ED8' },
    ]);
  });

  it('define as 8 situações com código, rótulo e cor exatos da spec', () => {
    expect(SITUACAO_TOKENS.map(({ code, label, colorHex }) => ({ code, label, colorHex }))).toEqual([
      { code: 'DU', label: 'DSR — Dia útil', colorHex: '#EA580C' },
      { code: 'DF', label: 'DSR — Final de semana', colorHex: '#E11D48' },
      { code: 'BH', label: 'Compensação BH', colorHex: '#D97706' },
      { code: 'AN', label: 'Folga Aniversário', colorHex: '#06B6D4' },
      { code: 'X', label: 'Férias', colorHex: '#2563EB' },
      { code: '#', label: 'Afastamento/Atestado', colorHex: '#374151' },
      { code: 'Folga', label: 'Folga — Feriado', colorHex: '#7C3AED' },
      { code: 'HE', label: 'Hora Extra', colorHex: '#16A34A' },
    ]);
  });

  it('mantém a ordem estável: turnos primeiro e situações na ordem da tabela', () => {
    expect(ALL_SCHEDULE_TOKENS.map(({ code, order }) => ({ code, order }))).toEqual([
      { code: 'Md', order: 1 },
      { code: 'M', order: 2 },
      { code: 'T', order: 3 },
      { code: 'N', order: 4 },
      { code: 'DU', order: 5 },
      { code: 'DF', order: 6 },
      { code: 'BH', order: 7 },
      { code: 'AN', order: 8 },
      { code: 'X', order: 9 },
      { code: '#', order: 10 },
      { code: 'Folga', order: 11 },
      { code: 'HE', order: 12 },
    ]);
  });

  it('marca countsAsOff como true apenas para DU, DF e Folga', () => {
    const countsAsOffCodes = ALL_SCHEDULE_TOKENS
      .filter((token) => token.countsAsOff)
      .map((token) => token.code);

    expect(countsAsOffCodes).toEqual(['DU', 'DF', 'Folga']);
    expect(ALL_SCHEDULE_TOKENS.filter((token) => !token.countsAsOff).map((token) => token.code)).toEqual([
      'Md',
      'M',
      'T',
      'N',
      'BH',
      'AN',
      'X',
      '#',
      'HE',
    ]);
  });

  it('resolve folga com código preservado usando normalização de texto', () => {
    expect(situationForAssignment('folga', 'DU').code).toBe('DU');
    expect(situationForAssignment('folga', 'df').code).toBe('DF');
    expect(situationForAssignment('folga', 'BH').code).toBe('BH');
    expect(situationForAssignment('folga', 'AN ').code).toBe('AN');
  });

  it('usa Folga como fallback de compatibilidade para folga sem código ou desconhecida', () => {
    expect(situationForAssignment('folga', undefined).code).toBe('Folga');
    expect(situationForAssignment('folga', 'texto-desconhecido-xyz').code).toBe('Folga');
  });

  it('resolve férias sempre como X independentemente do texto', () => {
    expect(situationForAssignment('ferias', undefined).code).toBe('X');
    expect(situationForAssignment('ferias', 'DU').code).toBe('X');
    expect(situationForAssignment('ferias', 'texto qualquer').code).toBe('X');
  });

  it('resolve os turnos canônicos pelo ShiftId', () => {
    expect(situationForAssignment('madrugada', undefined).code).toBe('Md');
  });

  it('retorna fallback mínimo para ShiftId fora do contrato de situação', () => {
    expect(() => situationForAssignment('plantao', undefined)).not.toThrow();
    expect(situationForAssignment('plantao', undefined)).toMatchObject({
      code: 'P',
      label: 'Plantão',
      colorHex: '#6b7280',
      countsAsOff: false,
    });
  });
});
