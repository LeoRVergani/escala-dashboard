/**
 * Gera planilhas FICTÍCIAS e sanitizadas que reproduzem os três layouts reais.
 * Nenhum nome, login, matrícula ou valor pessoal dos arquivos originais é usado.
 */
import XLSX from 'xlsx';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'tests', 'fixtures');
mkdirSync(outDir, { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
const dateOnly = (year, month, day) => new Date(year, month - 1, day, 12, 0, 0);
const addDays = (date, amount) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
};
const br = (date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
const weekday = (date) => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][date.getDay()];
const weekdayLong = (date) => ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][date.getDay()];

function makeN1Month(year, month) {
  const days = new Date(year, month, 0).getDate();
  const width = Math.max(5 + days, 48);
  const rows = Array.from({ length: 76 }, () => Array(width).fill(''));
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(dateOnly(year, month, 1)).toUpperCase();

  const fillHeader = (titleRow, headerRow, weekdayRow, title) => {
    rows[titleRow][1] = title;
    rows[headerRow][1] = 'Dia da semana';
    rows[headerRow][4] = 'Pausa';
    for (let d = 1; d <= days; d++) {
      const date = dateOnly(year, month, d);
      rows[headerRow][4 + d] = date;
      rows[weekdayRow][4 + d] = weekday(date).toUpperCase();
    }
  };

  const fillPerson = (row, person, pattern, onlyFirstDay = false) => {
    rows[row][1] = person[0];
    rows[row][2] = person[1];
    rows[row][3] = person[2];
    rows[row][4] = person[3];
    for (let d = 1; d <= days; d++) {
      rows[row][4 + d] = onlyFirstDay ? (d === 1 ? pattern[0] : '') : pattern[(d - 1) % pattern.length];
    }
  };

  fillHeader(1, 2, 3, `ESCALA ${monthName}/${year}`);
  const principalPattern = ['1', '2', '3', '4', '5', '6', 'F', 'M', 'M1', 'M2', 'M3', 'M4', 'X', 'AUS'];

  fillPerson(5, ['1', '9001', 'ALICE EXEMPLO', new Date(Date.UTC(1899, 11, 31, 5, 0))], principalPattern);
  fillPerson(6, ['2', '9002', 'BRUNO FICTICIO', '5:40'], principalPattern.slice(2).concat(principalPattern.slice(0, 2)));
  rows[7][42] = 'Ginástica Laboral';
  rows[7][43] = 'Terça, Quarta e Quinta';

  fillPerson(8, ['1', '9003', 'CARLA TESTE', '8:35'], principalPattern.slice(4).concat(principalPattern.slice(0, 4)));
  rows[9][43] = 'Madrugada (1h às 7h)';

  fillPerson(10, ['1', '9005', 'ERICA UM DIA', '17:40'], ['1'], true);
  rows[11][44] = 'Noite (19h à 1h)';

  fillPerson(12, ['1', '9004', 'DANIEL AMOSTRA', '23:30'], principalPattern.slice(6).concat(principalPattern.slice(0, 6)));

  rows[14][1] = 'Total escalado';
  rows[15][1] = 'Total em folga';
  rows[16][1] = 'Total em férias';
  rows[17][1] = 'Total em monitoramento';

  rows[19][1] = 'Legenda';
  rows[19][12] = 'Ginástica Laboral';
  rows[19][25] = 'Madrugada (1h às 7h)';
  rows[19][33] = 'Noite (19h à 1h)';
  const principalLegend = [
    ['X', 'Férias'],
    ['Nº', 'Trabalha (dias normais de trabalho)'],
    ['AUS', 'Ausência (Atestados, declaração, falta)'],
    ['F', 'Folga (Cockpit, DSR, BH, aniversário)'],
    ['M', 'Monitoramento (Todos os NOCS)'],
    ['M1', 'Monitoramento NOC Muralha, SME e WEBS'],
    ['M2', 'Monitoramento NOC CORP, SEC, ICI, Incidente de Link de Internet (Operadora) e Wi-fi Curitiba'],
    ['M3', 'Monitoramento NOC SME e Servidores Externos e Projeto SIM'],
    ['M4', 'Monitoramento NOC CORP, SEC, SME e Servidores Externos'],
  ];
  principalLegend.forEach(([code, description], index) => {
    rows[20 + index][1] = code;
    rows[20 + index][2] = description;
  });

  fillHeader(32, 33, 34, `ESCALA EMAIL E GARANTIA - ${monthName}/${year}`);
  const activityPattern = ['E', 'G', 'T', 'E', 'G', 'F'];
  fillPerson(36, ['1', '9001', 'ALICE EXEMPLO', 5 / 24], activityPattern);
  rows[37][42] = 'Caixa decorativa fora do bloco';
  fillPerson(38, ['1', '9003', 'CARLA TESTE', '8:35'], activityPattern.slice(1).concat(activityPattern.slice(0, 1)));

  rows[41][1] = 'Legenda';
  rows[41][12] = 'Outra caixa decorativa';
  const activityLegend = [
    ['X', 'Férias'],
    ['Nº', 'Trabalha (dias normais de trabalho)'],
    ['AUS', 'Ausência (Atestados, declaração, falta)'],
    ['F', 'Folga (Cockpit, DSR, BH, aniversário)'],
    ['G', 'Executa a atividade de garantia'],
    ['E', 'Executa a atividade de E-mail'],
    ['T', 'Todos (E-mail e Garantia)'],
  ];
  activityLegend.forEach(([code, description], index) => {
    rows[42 + index][1] = code;
    rows[42 + index][2] = description;
  });

  return XLSX.utils.aoa_to_sheet(rows);
}

// 1) N1: abas mensais com ano no sufixo + aba auxiliar.
{
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, makeN1Month(2025, 1), 'Janeiro_25');
  XLSX.utils.book_append_sheet(wb, makeN1Month(2025, 2), 'Fevereiro_25');
  XLSX.utils.book_append_sheet(wb, makeN1Month(2026, 1), 'Janeiro_26');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Controle Feriados — fixture fictícia'],
    ['Data', 'Descrição'],
    ['01/01/2026', 'Confraternização fictícia'],
  ]), 'Controle Feriados');
  XLSX.writeFile(wb, join(outDir, 'equipe-n1-ficticio.xls'), { bookType: 'biff8' });
}

const socLogins = Array.from({ length: 9 }, (_, index) => `soc${pad(index + 1)}`);
const socStart = dateOnly(2026, 6, 26);
const socDates = Array.from({ length: 30 }, (_, index) => addDays(socStart, index));

// 2) SOC: duas abas com os mesmos layouts reais.
{
  const wb = XLSX.utils.book_new();

  const daily = [
    ['Dia', '', 'Turno - Presencial', '', '', '', ''],
    ['', '', 'Madrugada', 'Manhã', 'Tarde', 'Noite', ''],
  ];
  socDates.forEach((date, index) => {
    const special = index === 0
      ? 'ferias - soc09'
      : index === 14
        ? 'DU - soc01 \\ DU - soc04'
        : '';
    daily.push([
      `${br(date)} ${weekdayLong(date)}`,
      '',
      index % 2 === 0 ? 'soc01/soc02' : 'soc02',
      index % 2 === 0 ? 'soc03/soc04/soc05' : 'soc03/soc05',
      index % 2 === 0 ? 'soc06/soc07' : 'soc06',
      index % 2 === 0 ? 'soc08/soc09' : 'soc08',
      special,
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(daily), 'Escala');

  const escalistas = Array.from({ length: 26 }, () => Array(3 + socDates.length).fill(''));
  escalistas[0][0] = 'SOC - Escala 6x1 — fixture fictícia';
  escalistas[2][1] = 'Turno';
  escalistas[2][2] = 'DIA/MÊS';
  escalistas[3][2] = 'Dia Semana';
  escalistas[4][2] = 'COLABORADOR';
  socDates.forEach((date, index) => {
    escalistas[2][3 + index] = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
    escalistas[3][3 + index] = weekday(date);
  });
  const rows = [
    ['Madrugada', 'soc01'], ['', 'soc02'],
    ['Manhã', 'soc03'], ['', 'soc04'], ['', 'soc05'],
    ['Tarde', 'soc06'], ['', 'soc07'],
    ['Noite', 'soc08'], ['', 'soc09'],
  ];
  const specialCodes = ['1', 'DF', 'DU', 'X', 'BH', 'AN', 'HE', '#'];
  rows.forEach(([shift, login], index) => {
    const row = 5 + index;
    escalistas[row][1] = shift;
    escalistas[row][2] = login;
    socDates.forEach((_, dateIndex) => {
      escalistas[row][3 + dateIndex] = index === 0 && dateIndex < specialCodes.length
        ? specialCodes[dateIndex]
        : String(((dateIndex + index) % 6) + 1);
    });
  });
  escalistas[15][1] = 'Legenda';
  [['X', 'Férias'], ['DF', 'DSR- Final de Semana'], ['DU', 'DSR- Dia útil'], ['BH', 'Compensação BH'], ['Folga', 'Folga- Feriado'], ['AN', 'Folga aniversário'], ['HE', 'Hora extra'], ['#', 'Afastamento']]
    .forEach(([code, text], index) => {
      escalistas[16 + index][0] = code;
      escalistas[16 + index][1] = text;
    });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(escalistas), 'Escalistas');
  XLSX.writeFile(wb, join(outDir, 'soc-controle-julho-ficticio.xlsx'));
}

// 3) Plantão COSI: 31 registros e resumo nas colunas J/K/L, que deve ser ignorado.
{
  const wb = XLSX.utils.book_new();
  const rows = Array.from({ length: 33 }, () => Array(12).fill(''));
  rows[0][0] = 'Relatório: Plantões — fixture fictícia';
  rows[0][9] = 'Contabilidade dos Plantões no mês';
  rows[1][0] = 'Plantonista Segurança';
  rows[1][1] = 'Data Inicio';
  rows[1][2] = 'Data Fim';
  rows[1][9] = 'Plantonistas';
  rows[1][10] = 'N° Plantões';
  rows[1][11] = 'N° Horas';
  const people = ['Alice Plantonista', 'Bruno Plantonista', 'Carla Plantonista'];
  let start = new Date(2026, 5, 25, 19, 0, 0);
  for (let index = 0; index < 31; index++) {
    const durationHours = index === 0 ? 12 : index % 8 === 0 ? 24 : index % 5 === 0 ? 5 : 12;
    const end = new Date(start.getTime() + durationHours * 3_600_000);
    const row = 2 + index;
    rows[row][0] = people[index % people.length];
    rows[row][1] = `${weekdayLong(start)}, ${br(start)} - ${pad(start.getHours())}:${pad(start.getMinutes())}`;
    rows[row][2] = `${weekdayLong(end)}, ${br(end)} - ${pad(end.getHours())}:${pad(end.getMinutes())}`;
    if (index < 3) {
      rows[row][9] = people[index];
      rows[row][10] = index === 0 ? 11 : 10;
      rows[row][11] = index === 0 ? '140:00' : '120:00';
    }
    start = new Date(end.getTime() + 12 * 3_600_000);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'PlantaoCOSI');
  XLSX.writeFile(wb, join(outDir, 'relatorio-plantao-ficticio.xlsx'));
}

console.log(`Fixtures sanitizadas geradas em ${outDir}`);
