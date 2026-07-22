import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectConflicts } from '../src/lib/conflicts';
import { findMonthInText } from '../src/lib/normalize';
import { analyzeWorkbook, buildSchedule, readWorkbook } from '../src/lib/parser';
import type { ScheduleState } from '../src/types';

function loadFixture(name: string) {
  const bytes = readFileSync(resolve('tests/fixtures', name));
  const wb = readWorkbook(new Uint8Array(bytes));
  return { wb, analysis: analyzeWorkbook(wb, name) };
}

describe('Equipe N1 — estrutura real sanitizada', () => {
  it('obtém corretamente o ano dos sufixos _25 e _26', () => {
    expect(findMonthInText('Janeiro_25')).toEqual({ month: 1, year: 2025 });
    expect(findMonthInText('Janeiro_26')).toEqual({ month: 1, year: 2026 });

    const { analysis } = loadFixture('equipe-n1-ficticio.xls');
    expect(analysis.options.filter((o) => o.sheetName === 'Janeiro_25').every((o) => o.monthKey.year === 2025)).toBe(true);
    expect(analysis.options.filter((o) => o.sheetName === 'Janeiro_26').every((o) => o.monthKey.year === 2026)).toBe(true);
  });

  it('não duplica opções do mesmo mês/bloco por nome, título ou datas', () => {
    const { analysis } = loadFixture('equipe-n1-ficticio.xls');
    expect(new Set(analysis.options.map((option) => option.key)).size).toBe(analysis.options.length);
    for (const sheetName of ['Janeiro_25', 'Fevereiro_25', 'Janeiro_26']) {
      const options = analysis.options.filter((option) => option.sheetName === sheetName);
      expect(options).toHaveLength(2); // principal + e-mail/garantia, e não dois anos para cada bloco
      expect(new Set(options.map((option) => option.blockId)).size).toBe(2);
    }
  });

  it('não transforma totais, legenda, códigos ou atividades em técnicos', () => {
    const { analysis } = loadFixture('equipe-n1-ficticio.xls');
    const sheet = analysis.sheets.find((candidate) => candidate.sheetName === 'Janeiro_25')!;
    const identities = sheet.technicians.map((tech) => `${tech.name ?? ''} ${tech.login ?? ''}`.toLowerCase());
    for (const forbidden of ['legenda', 'total', 'dias normais', 'executa a atividade', 'todos os nocs', 'm1', 'm2', 'm3', 'm4', 'aus']) {
      expect(identities.some((identity) => identity.includes(forbidden))).toBe(false);
    }
    expect(sheet.technicians).toHaveLength(5);
  });

  it('oferece escolha entre o bloco principal e o bloco auxiliar sem misturá-los', () => {
    const { wb, analysis } = loadFixture('equipe-n1-ficticio.xls');
    const options = analysis.options.filter((option) => option.sheetName === 'Janeiro_25');
    const principal = options.find((option) => option.primary)!;
    const auxiliary = options.find((option) => !option.primary)!;
    expect(principal.label).toBe('Service Desk N1 — escala completa');
    expect(principal.serviceDeskN1).toBe(true);
    expect(principal.secondaryBlockId).toBeTruthy();
    expect(auxiliary.label).toMatch(/EMAIL E GARANTIA/i);

    const mainResult = buildSchedule(wb, analysis, principal.key);
    const auxResult = buildSchedule(wb, analysis, auxiliary.key);
    expect(mainResult.state.technicians).toHaveLength(5);
    expect(auxResult.state.technicians).toHaveLength(2);
    expect(mainResult.state.serviceDeskN1?.principalRows).toHaveLength(5);
    expect(mainResult.state.serviceDeskN1?.emailGuaranteeRows).toHaveLength(2);
    expect(mainResult.state.serviceDeskN1?.emailGuaranteeRows.every((row) =>
      mainResult.state.technicians.some((tech) => tech.id === row.technicianId),
    )).toBe(true);
  });

  it('preserva nome completo, nome curto, turno e horário de pausa do Service Desk N1', () => {
    const { wb, analysis } = loadFixture('equipe-n1-ficticio.xls');
    const option = analysis.options.find((candidate) => candidate.sheetName === 'Janeiro_25' && candidate.primary)!;
    const result = buildSchedule(wb, analysis, option.key);
    const rows = result.state.serviceDeskN1!.principalRows;

    expect(rows.find((row) => row.fullName === 'Alice Exemplo')).toMatchObject({
      displayName: 'Alice Exemplo',
      employeeCode: '9001',
      shift: 'madrugada',
      pauseTime: '05:00',
    });
    expect(rows.find((row) => row.fullName === 'Carla Teste')).toMatchObject({ shift: 'manha', pauseTime: '08:35' });
    expect(rows.find((row) => row.fullName === 'Erica Um Dia')).toMatchObject({ shift: 'tarde', pauseTime: '17:40' });
    expect(rows.find((row) => row.fullName === 'Daniel Amostra')).toMatchObject({ shift: 'noite', pauseTime: '23:30' });
  });

  it('mantém M1–M4 na escala principal e E/G/T na escala complementar', () => {
    const { wb, analysis } = loadFixture('equipe-n1-ficticio.xls');
    const option = analysis.options.find((candidate) => candidate.sheetName === 'Janeiro_25' && candidate.primary)!;
    const result = buildSchedule(wb, analysis, option.key);
    const principalCodes = result.state.serviceDeskN1!.principalRows.flatMap((row) => Object.values(row.cells).map((cell) => cell?.text));
    const activityCodes = result.state.serviceDeskN1!.emailGuaranteeRows.flatMap((row) => Object.values(row.cells).map((cell) => cell?.text));
    expect(principalCodes).toEqual(expect.arrayContaining(['M1', 'M2', 'M3', 'M4']));
    expect(activityCodes).toEqual(expect.arrayContaining(['E', 'G', 'T']));
  });


  it('atribui os quatro turnos somente pela ordem dos grupos separados por linha vazia', () => {
    const { wb, analysis } = loadFixture('equipe-n1-ficticio.xls');
    const option = analysis.options.find((candidate) => candidate.sheetName === 'Janeiro_25' && candidate.primary)!;
    const rows = buildSchedule(wb, analysis, option.key).state.serviceDeskN1!.principalRows;
    const counts = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.shift] = (acc[row.shift] ?? 0) + 1;
      return acc;
    }, {});

    // As linhas separadoras possuem caixas decorativas muito à direita na fixture.
    // Mesmo assim, apenas A..última coluna de data definem se a linha está vazia.
    expect(rows.map((row) => row.shift)).toEqual(['madrugada', 'madrugada', 'manha', 'tarde', 'noite']);
    expect(counts).toEqual({ madrugada: 2, manha: 1, tarde: 1, noite: 1 });
  });

  it('lê os textos exatos das duas legendas diretamente da planilha', () => {
    const { wb, analysis } = loadFixture('equipe-n1-ficticio.xls');
    const option = analysis.options.find((candidate) => candidate.sheetName === 'Janeiro_25' && candidate.primary)!;
    const n1 = buildSchedule(wb, analysis, option.key).state.serviceDeskN1!;

    expect(n1.principalLegend).toEqual(expect.arrayContaining([
      { code: '1', description: 'Trabalha (dias normais de trabalho)' },
      { code: '6', description: 'Trabalha (dias normais de trabalho)' },
      { code: 'M1', description: 'Monitoramento NOC Muralha, SME e WEBS' },
      { code: 'M4', description: 'Monitoramento NOC CORP, SEC, SME e Servidores Externos' },
    ]));
    expect(n1.emailGuaranteeLegend).toEqual(expect.arrayContaining([
      { code: 'E', description: 'Executa a atividade de E-mail' },
      { code: 'G', description: 'Executa a atividade de garantia' },
      { code: 'T', description: 'Todos (E-mail e Garantia)' },
    ]));
  });
});

describe('SOC — abas Escala e Escalistas', () => {
  it('oferece a opção combinada Escala + Escalistas sem remover as opções isoladas', () => {
    const { analysis } = loadFixture('soc-combinado-regressao-ficticio.xlsx');

    expect(analysis.options.some((candidate) => candidate.layout === 'soc-daily')).toBe(true);
    expect(analysis.options.some((candidate) => candidate.layout === 'soc-escalistas')).toBe(true);
    const combined = analysis.options.find((candidate) => candidate.layout === 'soc-combined');
    expect(combined).toMatchObject({
      label: 'Período completo cruzando Escala + Escalistas',
      periodStart: '2026-06-26',
      periodEnd: '2026-07-25',
      socDailySheetName: 'Escala',
      socEscalistasSheetName: 'Escalistas',
    });
  });

  it('aceita /, quebra de linha, vírgula e ponto e vírgula como separadores de nomes no SOC combinado', () => {
    const { wb, analysis } = loadFixture('soc-combinado-regressao-ficticio.xlsx');
    const option = analysis.options.find((candidate) => candidate.layout === 'soc-combined')!;
    const result = buildSchedule(wb, analysis, option.key);
    const targetDay = result.state.dates!.indexOf('2026-07-22') + 1;
    const shiftByLogin = Object.fromEntries(result.state.technicians.map((tech) => [
      tech.login,
      result.state.cells[tech.id][targetDay]?.shift,
    ]));

    expect(shiftByLogin).toMatchObject({
      mad01: 'madrugada',
      mad02: 'madrugada',
      ffonseca: 'manha',
      manha02: 'manha',
      tarde01: 'tarde',
      tarde02: 'tarde',
      noite01: 'noite',
      noite02: 'noite',
    });
    expect(shiftByLogin.ferias01).toBe('ferias');
    expect(shiftByLogin.afast01).toBe('afastamento');
  });

  it('separa vários logins por / e mantém o período completo atravessando dois meses', () => {
    const { wb, analysis } = loadFixture('soc-controle-julho-ficticio.xlsx');
    const option = analysis.options.find((candidate) => candidate.layout === 'soc-daily')!;
    const result = buildSchedule(wb, analysis, option.key);
    expect(result.state.technicians).toHaveLength(9);
    expect(result.state.visualGrouping).toBe('operational-shift');
    expect(result.state.dates).toHaveLength(32);
    expect(result.state.dates?.[0]).toBe('2026-06-25');
    expect(result.state.dates?.[result.state.dates.length - 1]).toBe('2026-07-26');

    const soc01 = result.state.technicians.find((tech) => tech.login === 'soc01')!;
    const soc02 = result.state.technicians.find((tech) => tech.login === 'soc02')!;
    const firstImportedDay = result.state.dates!.indexOf('2026-06-26') + 1;
    expect(result.state.cells[soc01.id][firstImportedDay]?.shift).toBe('madrugada');
    expect(result.state.cells[soc02.id][firstImportedDay]?.shift).toBe('madrugada');
  });

  it('herda o último turno informado quando a coluna B está vazia', () => {
    const { wb, analysis } = loadFixture('soc-controle-julho-ficticio.xlsx');
    const option = analysis.options.find((candidate) => candidate.layout === 'soc-escalistas')!;
    const result = buildSchedule(wb, analysis, option.key);
    expect(result.state.visualGrouping).toBe('operational-shift');
    const inherited = result.state.technicians.find((tech) => tech.login === 'soc02')!;
    const firstImportedDay = result.state.dates!.indexOf('2026-06-26') + 1;
    expect(result.state.cells[inherited.id][firstImportedDay]?.shift).toBe('madrugada');
  });

  it.each([
    [2, 'DF', 'folga'],
    [3, 'DU', 'folga'],
    [4, 'X', 'ferias'],
    [5, 'BH', 'folga'],
    [6, 'AN', 'folga'],
    [7, 'HE', 'extra'],
    [8, '#', 'afastamento'],
  ] as const)('interpreta o código %s/%s como %s', (day, raw, expected) => {
    const { wb, analysis } = loadFixture('soc-controle-julho-ficticio.xlsx');
    const option = analysis.options.find((candidate) => candidate.layout === 'soc-escalistas')!;
    const result = buildSchedule(wb, analysis, option.key);
    const tech = result.state.technicians.find((candidate) => candidate.login === 'soc01')!;
    const firstImportedDay = result.state.dates!.indexOf('2026-06-26') + 1;
    expect(result.state.cells[tech.id][firstImportedDay + day - 1]).toMatchObject({ shift: expected, text: raw });
  });
});

describe('Relatório Plantão COSI — estrutura própria', () => {
  it('interpreta data textual com dia da semana e ignora o resumo J/K/L', () => {
    const { wb, analysis } = loadFixture('relatorio-plantao-ficticio.xlsx');
    expect(analysis.sheets).toHaveLength(1);
    expect(analysis.sheets[0].layout).toBe('oncall');
    expect(analysis.options[0]).toMatchObject({ techCount: 3, recordCount: 31, monthKey: { year: 2026, month: 7 } });

    const result = buildSchedule(wb, analysis, analysis.options[0].key);
    expect(result.state.viewType).toBe('oncall');
    expect(result.state.onCallRecords).toHaveLength(31);
    expect(result.state.technicians).toHaveLength(3);
    expect(result.state.onCallRecords?.some((record) => record.technician.includes('N° Plantões'))).toBe(false);
  });

  it('preserva início, fim e duração de plantão que atravessa a meia-noite', () => {
    const { wb, analysis } = loadFixture('relatorio-plantao-ficticio.xlsx');
    const result = buildSchedule(wb, analysis, analysis.options[0].key);
    const first = result.state.onCallRecords![0];
    expect(first.start).toBe('2026-06-25T19:00');
    expect(first.end).toBe('2026-06-26T07:00');
    expect(first.durationMinutes).toBe(12 * 60);
  });
});

describe('alertas com datas e horários reais', () => {
  it('alerta exatamente ao atingir 7 dias consecutivos', () => {
    const state: ScheduleState = {
      monthKey: { year: 2026, month: 7 },
      dates: ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07'],
      technicians: [{ id: 't1', login: 'teste' }],
      cells: { t1: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1, { shift: 'manha' }])) },
    };
    const sequences = detectConflicts(state).filter((conflict) => conflict.kind === 'sequencia');
    expect(sequences).toHaveLength(1);
    expect(sequences[0].day).toBe(7);
    expect(sequences[0].message).toContain('7+ dias consecutivos');
  });

  it('calcula descanso inferior a 11h pelas faixas reais, sem depender de Noite → Manhã', () => {
    const state: ScheduleState = {
      monthKey: { year: 2026, month: 7 },
      dates: ['2026-07-01', '2026-07-02'],
      technicians: [{ id: 't1', name: 'Técnico Teste' }],
      cells: {
        t1: {
          1: { shift: 'custom', text: '18:00-23:00' },
          2: { shift: 'custom', text: '05:00-11:00' },
        },
      },
    };
    const rests = detectConflicts(state).filter((conflict) => conflict.kind === 'descanso');
    expect(rests).toHaveLength(1);
    expect(rests[0].message).toContain('descanso de 6h');
    expect(rests[0].message).toContain('mínimo esperado: 11h');
  });
});
