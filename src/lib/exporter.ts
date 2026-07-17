import * as XLSX from 'xlsx';
import {
  MONTHS_PT_TITLE,
  N1_EMAIL_GUARANTEE_CODES,
  N1_PRIMARY_CODES,
  N1_SHIFT_LABELS,
  SHIFTS,
  SHIFT_BY_ID,
} from '../constants';
import { cycle25To26, formatBrDate, scheduleDates } from './dates';
import { onCallCycleAccounting, overlapsOperationalCycle } from './onCall';
import type { ScheduleState } from '../types';

export function scheduleToWorkbook(state: ScheduleState): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  if (state.origin === 'demo-template') {
    const warning = XLSX.utils.aoa_to_sheet([
      ['Aviso sobre dados fictícios'],
      [],
      ['Este arquivo contém dados fictícios gerados no Test Drive do dashboard, incluindo colaboradores, matrículas e horários inventados. Não representa pessoas ou escalas reais.'],
    ]);
    warning['!cols'] = [{ wch: 120 }];
    XLSX.utils.book_append_sheet(wb, warning, 'Aviso');
  }
  if (state.viewType === 'oncall') {
    const records = state.onCallRecords ?? [];
    const rows = records.map((record) => [
      record.technician,
      formatBrDate(record.start.slice(0, 10)),
      record.start.slice(11, 16),
      formatBrDate(record.end.slice(0, 10)),
      record.end.slice(11, 16),
      record.durationMinutes / 1440,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([['Plantonista Segurança', 'Data Início', 'Horário Início', 'Data Fim', 'Horário Fim', 'Duração'], ...rows]);
    ws['!cols'] = [{ wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    for (let r = 1; r <= rows.length; r++) if (ws[`F${r + 1}`]) ws[`F${r + 1}`].z = '[h]:mm';
    XLSX.utils.book_append_sheet(wb, ws, 'Plantões');

    const accounting = onCallCycleAccounting(records, state.monthKey, state.technicians);
    const accountingRows = accounting.map((row) => [
      row.technician,
      row.shifts,
      row.minutes / 1440,
      row.calendarMinutes / 1440,
      row.weekendStarts,
      row.weekendMinutes / 1440,
    ]);
    const cycle = cycle25To26(state.monthKey);
    const monthLabel = `${formatBrDate(cycle.start)}–${formatBrDate(cycle.end)}`;
    const summary = XLSX.utils.aoa_to_sheet([
      [`CONTABILIDADE DOS PLANTÕES — ${monthLabel}`],
      [],
      ['Plantonista', 'Plantões iniciados', 'Horas dos plantões', 'Horas na tela 25–26', 'Inícios no fim de semana', 'Horas no fim de semana'],
      ...accountingRows,
      [],
      ['Registros que tocam o ciclo', records.filter((record) => overlapsOperationalCycle(record, state.monthKey)).length],
    ]);
    summary['!cols'] = [{ wch: 34 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 24 }];
    for (let r = 3; r < 3 + accountingRows.length; r++) {
      if (summary[`C${r + 1}`]) summary[`C${r + 1}`].z = '[h]:mm';
      if (summary[`D${r + 1}`]) summary[`D${r + 1}`].z = '[h]:mm';
      if (summary[`F${r + 1}`]) summary[`F${r + 1}`].z = '[h]:mm';
    }
    XLSX.utils.book_append_sheet(wb, summary, 'Contabilidade');

    const names = XLSX.utils.aoa_to_sheet([
      ['Plantonistas disponíveis', 'Cor'],
      ...state.technicians.filter((technician) => technician.name?.trim()).map((technician) => [technician.name, technician.color ?? 'automática']),
    ]);
    names['!cols'] = [{ wch: 38 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, names, 'Plantonistas');
    return wb;
  }

  if (state.serviceDeskN1) {
    const dates = scheduleDates(state);
    const makeSheet = (title: string, rows: typeof state.serviceDeskN1.principalRows) => {
      const header = ['Turno', 'Técnico', 'Nome completo', 'Matrícula', 'Pausa', ...dates.map(formatBrDate)];
      const body = rows.map((row) => [
        N1_SHIFT_LABELS[row.shift].label,
        row.displayName,
        row.fullName,
        row.employeeCode ?? '',
        row.pauseTime ?? '',
        ...dates.map((_date, index) => row.cells[index + 1]?.text ?? ''),
      ]);
      const ws = XLSX.utils.aoa_to_sheet([[title], [], header, ...body]);
      ws['!cols'] = [
        { wch: 13 },
        { wch: 22 },
        { wch: 38 },
        { wch: 12 },
        { wch: 10 },
        ...dates.map(() => ({ wch: 11 })),
      ];
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.min(dates.length + 4, 12) } }];
      return ws;
    };

    XLSX.utils.book_append_sheet(
      wb,
      makeSheet('ESCALA PRINCIPAL — SERVICE DESK N1', state.serviceDeskN1.principalRows),
      'Escala principal',
    );
    if (state.serviceDeskN1.emailGuaranteeRows.length) {
      XLSX.utils.book_append_sheet(
        wb,
        makeSheet('ESCALA DE E-MAIL E GARANTIA — SERVICE DESK N1', state.serviceDeskN1.emailGuaranteeRows),
        'Email e Garantia',
      );
    }
    const principalLegend = state.serviceDeskN1.principalLegend?.length
      ? state.serviceDeskN1.principalLegend.map((item) => [item.code, item.description])
      : N1_PRIMARY_CODES.map((item) => [item.code, item.description]);
    const emailLegend = state.serviceDeskN1.emailGuaranteeLegend?.length
      ? state.serviceDeskN1.emailGuaranteeLegend.map((item) => [item.code, item.description])
      : N1_EMAIL_GUARANTEE_CODES.map((item) => [item.code, item.description]);
    const legendRows = [
      ['Escala principal'],
      ['Código', 'Texto original da planilha'],
      ...principalLegend,
      [],
      ['E-mail e garantia'],
      ['Código', 'Texto original da planilha'],
      ...emailLegend,
      [],
      ['Turnos'],
      ['Turno', 'Horário'],
      ...Object.values(N1_SHIFT_LABELS).map((item) => [item.label, item.hours]),
    ];
    const legend = XLSX.utils.aoa_to_sheet(legendRows);
    legend['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 62 }];
    XLSX.utils.book_append_sheet(wb, legend, 'Legenda N1');
    return wb;
  }

  const dates = scheduleDates(state);
  const header = ['Técnico', 'Login', ...dates.map(formatBrDate)];
  const rows = state.technicians.map((technician) => {
    const line: (string | number)[] = [technician.name ?? '', technician.login ?? ''];
    dates.forEach((_date, index) => {
      const value = state.cells[technician.id]?.[index + 1];
      line.push(value ? (value.shift === 'custom' ? (value.text ?? '') : (value.text ?? SHIFT_BY_ID[value.shift].code)) : '');
    });
    return line;
  });
  const title = dates.length ? `ESCALA – ${formatBrDate(dates[0])} A ${formatBrDate(dates[dates.length - 1])}` : `ESCALA – ${MONTHS_PT_TITLE[state.monthKey.month - 1].toUpperCase()}/${state.monthKey.year}`;
  const ws = XLSX.utils.aoa_to_sheet([[title], [], header, ...rows]);
  ws['!cols'] = [{ wch: 28 }, { wch: 14 }, ...dates.map(() => ({ wch: 11 }))];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.min(dates.length + 1, 10) } }];
  const legend = XLSX.utils.aoa_to_sheet([['Código', 'Significado'], ...SHIFTS.map((s) => [s.code, s.label]), ['(texto original)', 'Valor preservado da planilha importada']]);
  legend['!cols'] = [{ wch: 18 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Escala');
  XLSX.utils.book_append_sheet(wb, legend, 'Legenda');
  return wb;
}

export function exportScheduleFile(state: ScheduleState): void {
  const wb = scheduleToWorkbook(state);
  const dates = scheduleDates(state);
  const suffix = dates.length ? `${dates[0]}_${dates[dates.length - 1]}` : `${state.monthKey.year}-${String(state.monthKey.month).padStart(2, '0')}`;
  const prefix = state.viewType === 'oncall'
    ? 'plantoes'
    : state.serviceDeskN1
      ? 'escala-service-desk-n1'
      : 'escala';
  XLSX.writeFile(wb, `${prefix}-${suffix}.xlsx`);
}
