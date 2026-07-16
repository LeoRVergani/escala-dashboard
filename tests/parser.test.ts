import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  findMonthInText,
  normalizeShift,
  parseIdentity,
} from '../src/lib/normalize';
import { analyzeWorkbook, buildSchedule, readWorkbook } from '../src/lib/parser';

/** Escreve um workbook em memória e o relê pelo parser real (round-trip). */
function roundTrip(
  build: (wb: XLSX.WorkBook) => void,
  bookType: XLSX.BookType = 'xlsx',
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  build(wb);
  const buf = XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer;
  return readWorkbook(buf);
}

const aoa = (rows: unknown[][]) => XLSX.utils.aoa_to_sheet(rows as never[][]);

/* ------------------------------------------------------------------ */
/* normalizeShift                                                      */
/* ------------------------------------------------------------------ */
describe('normalizeShift', () => {
  it('reconhece códigos e apelidos comuns', () => {
    expect(normalizeShift('M')?.shift).toBe('manha');
    expect(normalizeShift('t')?.shift).toBe('tarde');
    expect(normalizeShift('Noite')?.shift).toBe('noite');
    expect(normalizeShift('MAD')?.shift).toBe('madrugada');
    expect(normalizeShift('F')?.shift).toBe('folga');
    expect(normalizeShift('DSR')?.shift).toBe('folga');
    expect(normalizeShift('FÉRIAS')?.shift).toBe('ferias');
    expect(normalizeShift('12x36')?.shift).toBe('plantao');
    expect(normalizeShift('HC')?.shift).toBe('comercial');
    expect(normalizeShift('HE')?.shift).toBe('extra');
    expect(normalizeShift('Atestado')?.shift).toBe('afastamento');
  });

  it('interpreta faixas de horário', () => {
    expect(normalizeShift('08:00-17:00')?.shift).toBe('comercial');
    expect(normalizeShift('07h às 19h')?.shift).toBe('plantao'); // 12h de duração
    expect(normalizeShift('19:00-07:00')?.shift).toBe('plantao');
    expect(normalizeShift('00:00-06:00')?.shift).toBe('madrugada');
    expect(normalizeShift('13:00 - 19:00')?.shift).toBe('tarde');
  });

  it('usa o primeiro token quando há complemento ("PLANTÃO NOTURNO")', () => {
    expect(normalizeShift('Plantão 12x36')?.shift).toBe('plantao');
    expect(normalizeShift('FÉRIAS 01-15')?.shift).toBe('ferias');
  });

  it('preserva texto não reconhecido como personalizado e ignora vazios', () => {
    const v = normalizeShift('Sobrevoo Data Center');
    expect(v).toEqual({ shift: 'custom', text: 'Sobrevoo Data Center' });
    expect(normalizeShift('')).toBeNull();
    expect(normalizeShift('-')).toBeNull();
    expect(normalizeShift(null)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* parseIdentity                                                       */
/* ------------------------------------------------------------------ */
describe('parseIdentity', () => {
  it('reconhece "Nome Completo (login)" e "login (Nome Completo)"', () => {
    expect(parseIdentity('Ana Souza (asouza)')).toEqual({ name: 'Ana Souza', login: 'asouza' });
    expect(parseIdentity('iva.mock (Ivana Mock)')).toEqual({ login: 'iva.mock', name: 'Ivana Mock' });
  });
  it('reconhece "login - Nome", nome puro e login puro', () => {
    expect(parseIdentity('jr.silva - José Roberto Silva')).toEqual({
      login: 'jr.silva',
      name: 'José Roberto Silva',
    });
    expect(parseIdentity('Maria de Fátima')).toEqual({ name: 'Maria de Fátima' });
    expect(parseIdentity('mfatima')).toEqual({ login: 'mfatima' });
  });
  it('rejeita textos que não são identidade', () => {
    expect(parseIdentity('TOTAL GERAL 123')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* findMonthInText                                                     */
/* ------------------------------------------------------------------ */
describe('findMonthInText', () => {
  it('mês por extenso, abreviado, mm/aaaa e aaaa-mm', () => {
    expect(findMonthInText('Escala JULHO 2026')).toEqual({ month: 7, year: 2026 });
    expect(findMonthInText('escala jun')).toEqual({ month: 6, year: null });
    expect(findMonthInText('07/2026')).toEqual({ month: 7, year: 2026 });
    expect(findMonthInText('2026-03')).toEqual({ month: 3, year: 2026 });
    expect(findMonthInText('Equipe N1')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Layout MATRIZ — estilo "Escalas Equipe N1.xls"                      */
/* ------------------------------------------------------------------ */
describe('layout matriz (estilo Equipe N1)', () => {
  const buildN1 = (wb: XLSX.WorkBook) => {
    const days31 = Array.from({ length: 31 }, (_, i) => i + 1);
    XLSX.utils.book_append_sheet(
      wb,
      aoa([
        ['ESCALA EQUIPE N1 (FICTÍCIO)'],
        [],
        ['TÉCNICO', ...days31],
        ['Ana Exemplo (ana.exemplo)', ...days31.map((d) => (d % 7 === 0 ? 'F' : 'M'))],
        ['bruno.ficticio - Bruno Fictício', ...days31.map((d) => (d % 2 ? 'P' : 'F'))],
        ['Carla Teste', ...days31.map(() => 'T')],
        ['LEGENDA: M=Manhã F=Folga'],
      ]),
      'JULHO',
    );
    const days30 = Array.from({ length: 30 }, (_, i) => i + 1);
    XLSX.utils.book_append_sheet(
      wb,
      aoa([['TÉCNICO', ...days30], ['davi.amostra', ...days30.map(() => 'N')]]),
      'JUNHO 2026',
    );
  };

  it('detecta abas, meses (nome da aba) e técnicos por combinação nome/login', () => {
    const wb = roundTrip(buildN1);
    const an = analyzeWorkbook(wb, 'equipe-n1.xlsx');

    expect(an.sheets.map((s) => s.layout)).toEqual(['matrix', 'matrix']);
    expect(an.options.map((o) => o.monthLabel).sort()).toEqual(['06/2026', '07/' + new Date().getFullYear()].sort());

    const julho = an.sheets[0];
    expect(julho.months[0]).toMatchObject({ month: 7, source: 'sheetName' });
    expect(julho.technicians).toHaveLength(3);
    expect(julho.technicians[0]).toMatchObject({ name: 'Ana Exemplo', login: 'ana.exemplo' });
    expect(julho.technicians[1]).toMatchObject({ name: 'Bruno Fictício', login: 'bruno.ficticio' });
    expect(julho.technicians[2]).toMatchObject({ name: 'Carla Teste' });
    expect(julho.technicians[2].login).toBeUndefined();

    const legenda = julho.ignoredRows.find((r) => r.reason.includes('legenda'));
    expect(legenda).toBeDefined();
  });

  it('constrói a grade só com o mês escolhido e normaliza turnos', () => {
    const wb = roundTrip(buildN1);
    const an = analyzeWorkbook(wb, 'equipe-n1.xlsx');
    const julhoKey = an.options.find((o) => o.sheetName === 'JULHO')!.key;
    const { state, recognizedShifts, customShifts } = buildSchedule(wb, an, julhoKey);

    expect(state.monthKey.month).toBe(7);
    expect(state.technicians).toHaveLength(3);
    const ana = state.technicians[0];
    expect(state.cells[ana.id][1]?.shift).toBe('manha');
    expect(state.cells[ana.id][7]?.shift).toBe('folga');
    expect(recognizedShifts).toBe(31 * 3);
    expect(customShifts).toBe(0);
  });

  it('lê .xls (BIFF8) com o mesmo resultado', () => {
    const wb = roundTrip(buildN1, 'biff8');
    const an = analyzeWorkbook(wb, 'equipe-n1.xls');
    expect(an.options.length).toBe(2);
    expect(an.sheets[0].technicians).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/* Matriz com colunas LOGIN|NOME — estilo "Escala-SOC-Controle-Julho"  */
/* ------------------------------------------------------------------ */
describe('layout matriz com LOGIN|NOME separados (estilo SOC-Controle)', () => {
  const buildSOC = (wb: XLSX.WorkBook) => {
    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    const letters = ['Q', 'Q', 'S', 'S', 'D', 'S', 'T']; // 01/07/2026 = quarta
    XLSX.utils.book_append_sheet(
      wb,
      aoa([
        ['ESCALA SOC - CONTROLE - JULHO/2026'],
        [],
        ['LOGIN', 'NOME', ...days],
        [null, null, ...days.map((d) => letters[(d - 1) % 7])],
        ['edu.simulado', 'Eduardo Simulado', ...days.map(() => '08:00-17:00')],
        ['gil.exemplo', null, ...days.map((d) => (d % 2 ? '19:00-07:00' : 'F'))],
        [null, 'Helena Ilustrativa', ...days.map(() => 'T')],
      ]),
      'Controle',
    );
  };

  it('detecta mês pelo título, pareia login+nome e pula a linha de dias da semana', () => {
    const wb = roundTrip(buildSOC);
    const an = analyzeWorkbook(wb, 'soc.xlsx');
    const sh = an.sheets[0];

    expect(sh.layout).toBe('matrix');
    expect(sh.months[0]).toMatchObject({ month: 7, year: 2026, source: 'title' });
    expect(sh.technicians).toHaveLength(3);
    expect(sh.technicians[0]).toMatchObject({ login: 'edu.simulado', name: 'Eduardo Simulado' });
    expect(sh.technicians[1]).toMatchObject({ login: 'gil.exemplo' });
    expect(sh.technicians[2]).toMatchObject({ name: 'Helena Ilustrativa' });
    // A linha de iniciais (Q/S/T/D) não vira técnico nem lixo:
    expect(sh.ignoredRows.filter((r) => /Q \| Q/.test(r.preview))).toHaveLength(0);
  });

  it('interpreta faixas de horário ao construir a grade', () => {
    const wb = roundTrip(buildSOC);
    const an = analyzeWorkbook(wb, 'soc.xlsx');
    const { state } = buildSchedule(wb, an, an.options[0].key);
    const edu = state.technicians[0];
    const gil = state.technicians[1];
    expect(state.cells[edu.id][10]?.shift).toBe('comercial');
    expect(state.cells[gil.id][1]?.shift).toBe('plantao');
    expect(state.cells[gil.id][2]?.shift).toBe('folga');
  });
});

/* ------------------------------------------------------------------ */
/* Formato LONGO com 2 meses — estilo "Relatorio-PlantaoCOSI"          */
/* ------------------------------------------------------------------ */
describe('layout longo (estilo Relatório de Plantão)', () => {
  const buildRel = (wb: XLSX.WorkBook) => {
    const rows: unknown[][] = [['DATA', 'TÉCNICO', 'TURNO']];
    for (const m of [6, 7]) {
      for (let d = 1; d <= 4; d++) {
        rows.push([`0${d}/0${m}/2026`, 'iva.mock (Ivana Mock)', d % 2 ? 'Plantão 12x36' : 'Folga']);
        rows.push([`0${d}/0${m}/2026`, 'Karen Protótipo', 'Comercial']);
      }
    }
    rows.push(['??/07/2026', 'zé', 'M']); // data inválida → ignorada
    XLSX.utils.book_append_sheet(wb, aoa(rows), 'Plantões');
  };

  it('detecta os dois meses pelas datas e gera uma opção por mês', () => {
    const wb = roundTrip(buildRel);
    const an = analyzeWorkbook(wb, 'relatorio.xlsx');
    const sh = an.sheets[0];

    expect(sh.layout).toBe('long');
    expect(sh.months.map((m) => m.month)).toEqual([6, 7]);
    expect(an.options.map((o) => o.monthLabel)).toEqual(['06/2026', '07/2026']);
    expect(an.options.every((o) => o.techCount === 2)).toBe(true);
    expect(sh.ignoredRows.some((r) => r.reason.includes('data inválida'))).toBe(true);
  });

  it('carrega somente os registros do mês escolhido', () => {
    const wb = roundTrip(buildRel);
    const an = analyzeWorkbook(wb, 'relatorio.xlsx');
    const jul = an.options.find((o) => o.monthLabel === '07/2026')!;
    const { state } = buildSchedule(wb, an, jul.key);

    expect(state.monthKey).toEqual({ year: 2026, month: 7 });
    expect(state.technicians).toHaveLength(2);
    const iva = state.technicians.find((t) => t.login === 'iva.mock')!;
    expect(iva.name).toBe('Ivana Mock');
    expect(state.cells[iva.id][1]?.shift).toBe('plantao');
    expect(state.cells[iva.id][2]?.shift).toBe('folga');
    expect(state.cells[iva.id][5]).toBeUndefined(); // só dias 1–4 existem no relatório
    // Nada de junho vazou:
    expect(Object.keys(state.cells[iva.id])).toEqual(['1', '2', '3', '4']);
  });
});

/* ------------------------------------------------------------------ */
/* Arquivo sem escala                                                  */
/* ------------------------------------------------------------------ */
describe('arquivo sem escala reconhecível', () => {
  it('reporta erro amigável em vez de opções', () => {
    const wb = roundTrip((w) =>
      XLSX.utils.book_append_sheet(w, aoa([['apenas', 'texto'], ['sem', 'cabeçalho']]), 'Aba'),
    );
    const an = analyzeWorkbook(wb, 'vazio.xlsx');
    expect(an.options).toHaveLength(0);
    expect(an.errors[0]).toMatch(/Nenhuma aba/);
    expect(an.sheets[0].errors[0]).toMatch(/Layout não reconhecido/);
  });
});
