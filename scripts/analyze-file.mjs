/**
 * Executa exatamente o parser da aplicação em um .xls/.xlsx real ou fixture.
 * Uso: npm run analyze -- caminho/arquivo.xls
 */
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createServer } from 'vite';

const file = process.argv[2];
if (!file) {
  console.error('Uso: npm run analyze -- <arquivo.xls|xlsx>');
  process.exit(1);
}

const vite = await createServer({ server: { middlewareMode: true }, logLevel: 'error' });
try {
  const { readWorkbook, analyzeWorkbook, buildSchedule } = await vite.ssrLoadModule('/src/lib/parser.ts');
  const { SHIFT_BY_ID } = await vite.ssrLoadModule('/src/constants.ts');
  const { onCallCycleAccounting } = await vite.ssrLoadModule('/src/lib/onCall.ts');
  const { cycle25To26 } = await vite.ssrLoadModule('/src/lib/dates.ts');
  const { groupTechniciansByOperationalShift } = await vite.ssrLoadModule('/src/lib/scheduleGrouping.ts');
  const wb = readWorkbook(new Uint8Array(readFileSync(resolve(file))));
  const analysis = analyzeWorkbook(wb, basename(file));

  console.log(`\n===== ${analysis.fileName} =====`);
  console.log(`Abas encontradas (${analysis.sheets.length}): ${analysis.sheets.map((sheet) => sheet.sheetName).join(', ') || '(nenhuma)'}`);

  for (const sheet of analysis.sheets) {
    const periods = sheet.months.map((month) => `${String(month.month).padStart(2, '0')}/${month.year ?? '?'}`).join(', ') || 'nenhum';
    console.log(`\n— ${sheet.sheetName} · layout ${sheet.layout} · períodos ${periods} · ${sheet.technicians.length} técnico(s)`);
    if (sheet.blocks?.length) {
      for (const block of sheet.blocks) {
        console.log(`  bloco ${block.primary ? 'principal' : 'auxiliar'}: ${block.title} · ${block.techCount} técnico(s)`);
      }
    }
    console.log(`  linhas/valores ignorados: ${sheet.ignoredRows.length}`);
    for (const ignored of sheet.ignoredRows.slice(0, 5)) {
      console.log(`    linha ${ignored.row}: ${ignored.reason}${ignored.preview ? ` — “${ignored.preview}”` : ''}`);
    }
    if (sheet.ignoredRows.length > 5) console.log(`    … +${sheet.ignoredRows.length - 5}`);
    for (const warning of sheet.warnings) console.log(`  aviso: ${warning}`);
    for (const error of sheet.errors) console.log(`  ERRO: ${error}`);
  }

  console.log('\nOpções e importações simuladas:');
  for (const option of analysis.options) {
    const result = buildSchedule(wb, analysis, option.key);
    const counts = {};
    for (const technician of result.state.technicians) {
      for (const value of Object.values(result.state.cells[technician.id] ?? {})) {
        if (!value) continue;
        counts[value.shift] = (counts[value.shift] ?? 0) + 1;
      }
    }
    const period = option.periodStart && option.periodEnd ? `${option.periodStart} a ${option.periodEnd}` : option.monthLabel;
    console.log(`\n  [${option.key}]`);
    console.log(`    ${option.sheetName} · ${option.label ?? option.monthLabel} · ${period}`);
    console.log(`    técnicos: ${result.state.technicians.length} · encontrados: ${option.recordCount ?? '—'} · importados: ${result.importedRecords ?? 0} · vazios: ${result.emptyCells}`);
    if (result.state.dates?.length) {
      console.log(`    período exibido: ${result.state.dates[0]} a ${result.state.dates[result.state.dates.length - 1]} · ${result.state.dates.length} dia(s)`);
    }
    if (result.state.viewType === 'oncall') {
      const records = result.state.onCallRecords ?? [];
      const totalMinutes = records.reduce((sum, record) => sum + record.durationMinutes, 0);
      console.log(`    plantões: ${records.length} · duração total: ${(totalMinutes / 60).toLocaleString('pt-BR')}h`);
      for (const record of records.slice(0, 3)) {
        console.log(`    registro: ${record.technician} · ${record.start} → ${record.end} · ${record.durationMinutes / 60}h`);
      }
      if (records.length > 3) {
        const last = records[records.length - 1];
        console.log(`    último: ${last.technician} · ${last.start} → ${last.end} · ${last.durationMinutes / 60}h`);
      }
      const cycle = cycle25To26(result.state.monthKey);
      const rows = onCallCycleAccounting(records, result.state.monthKey, result.state.technicians);
      const shifts = rows.reduce((sum, row) => sum + row.shifts, 0);
      const full = rows.reduce((sum, row) => sum + row.minutes, 0);
      const visible = rows.reduce((sum, row) => sum + row.calendarMinutes, 0);
      console.log(`    ciclo operacional: ${cycle.start} a ${cycle.end} (${cycle.startDates.length} datas de início + dia 26 para saída)`);
      console.log(`    contabilidade do ciclo: ${shifts} início(s) · ${(full / 60).toLocaleString('pt-BR')}h completas · ${(visible / 60).toLocaleString('pt-BR')}h na tela 25–26`);
    } else if (result.state.serviceDeskN1) {
      const filled = (rows) => rows.reduce((sum, row) => sum + Object.values(row.cells).filter(Boolean).length, 0);
      const shiftCounts = result.state.serviceDeskN1.principalRows.reduce((acc, row) => {
        acc[row.shift] = (acc[row.shift] ?? 0) + 1;
        return acc;
      }, {});
      console.log(`    modo Service Desk N1: ${result.state.serviceDeskN1.principalRows.length} linha(s) principais · ${filled(result.state.serviceDeskN1.principalRows)} registros principais`);
      console.log(`    e-mail/garantia: ${result.state.serviceDeskN1.emailGuaranteeRows.length} linha(s) · ${filled(result.state.serviceDeskN1.emailGuaranteeRows)} registros`);
      console.log(`    grupos: madrugada ${shiftCounts.madrugada ?? 0} · manhã ${shiftCounts.manha ?? 0} · tarde ${shiftCounts.tarde ?? 0} · noite ${shiftCounts.noite ?? 0}`);
      const pauses = result.state.serviceDeskN1.principalRows
        .filter((row) => row.pauseTime)
        .slice(0, 4)
        .map((row) => `${row.displayName}: ${row.pauseTime}`)
        .join(' · ');
      if (pauses) console.log(`    pausas (amostra): ${pauses}`);
      const principalLegend = result.state.serviceDeskN1.principalLegend ?? [];
      const emailLegend = result.state.serviceDeskN1.emailGuaranteeLegend ?? [];
      console.log(`    legenda principal (${principalLegend.length}): ${principalLegend.map((item) => `${item.code}=${item.description}`).join(' | ') || 'não encontrada'}`);
      console.log(`    legenda e-mail/garantia (${emailLegend.length}): ${emailLegend.map((item) => `${item.code}=${item.description}`).join(' | ') || 'não encontrada'}`);
    } else {
      if (result.state.visualGrouping === 'operational-shift') {
        const groups = groupTechniciansByOperationalShift(result.state);
        console.log(`    agrupamento visual: ${groups.map((group) => `${group.label} ${group.technicians.length}`).join(' · ')}`);
        for (const group of groups) {
          console.log(`      ${group.label}: ${group.technicians.map((technician) => technician.name ?? technician.login ?? technician.id).join(', ')}`);
        }
      }
      for (const [id, amount] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${SHIFT_BY_ID[id]?.label ?? id}: ${amount}`);
      }
    }
  }

  if (analysis.errors.length) {
    console.log('\nErros gerais:');
    analysis.errors.forEach((error) => console.log(`  - ${error}`));
  }
  console.log('');
} finally {
  await vite.close();
}
