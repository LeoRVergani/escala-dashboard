import { N1_EMAIL_GUARANTEE_CODES, N1_PRIMARY_CODES } from '../constants';
import type {
  CellValue,
  MonthKey,
  ScheduleState,
  ScheduleTemplateKind,
  ServiceDeskN1Row,
  ServiceDeskN1Shift,
  ShiftId,
  Technician,
} from '../types';
import { cycle25To26 } from './dates';
import { autoFillOperationalCycle, monthDates } from './onCall';
import { getScheduleTemplate } from './scheduleCatalog';
import { n1CellValue, syncN1Aggregate } from './serviceDeskN1';

const SOC_FORBIDDEN_N1_CODES = new Set(['M1', 'M2', 'M3', 'M4']);
const N1_WORK_CODES = ['M', 'M1', 'M2', 'M3', 'M4'] as const;
const N1_EMAIL_CODES = ['E', 'G', 'T'] as const;

function monthKeyFromReference(referenceIso: string): MonthKey {
  const isoMonth = referenceIso.match(/^(\d{4})-(\d{2})/);
  if (isoMonth) return { year: Number(isoMonth[1]), month: Number(isoMonth[2]) };

  const parsed = new Date(referenceIso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Data de referência inválida: ${referenceIso}`);
  }
  return { year: parsed.getFullYear(), month: parsed.getMonth() + 1 };
}

function datesForTemplate(kind: ScheduleTemplateKind, monthKey: MonthKey): string[] {
  const template = getScheduleTemplate(kind);
  return template.periodStrategy === 'cycle-25-26'
    ? cycle25To26(monthKey).dates
    : monthDates(monthKey);
}

function baseState(kind: ScheduleTemplateKind, referenceIso: string): ScheduleState {
  const template = getScheduleTemplate(kind);
  const monthKey = monthKeyFromReference(referenceIso);
  return {
    monthKey,
    dates: datesForTemplate(kind, monthKey),
    viewType: template.viewType,
    visualGrouping: template.visualGrouping,
    technicians: [],
    cells: {},
    sourceLabel: template.label,
  };
}

export function createEmptyScheduleFromCatalog(kind: ScheduleTemplateKind, referenceIso: string): ScheduleState {
  const template = getScheduleTemplate(kind);
  const state: ScheduleState = {
    ...baseState(kind, referenceIso),
    origin: 'empty-template',
    sourceLabel: `${template.label} (escala vazia)`,
  };

  if (kind === 'plantao-cosi') {
    return { ...state, onCallRecords: [] };
  }

  if (kind === 'service-desk-n1-6x1') {
    return {
      ...state,
      serviceDeskN1: {
        principalRows: [],
        emailGuaranteeRows: [],
        principalLegend: [],
        emailGuaranteeLegend: [],
      },
    };
  }

  return state;
}

export function withManualTechnicians(state: ScheduleState, names: string[]): ScheduleState {
  const technicians: Technician[] = names
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, index) => ({ id: `manual-${index + 1}`, name }));

  return { ...state, technicians };
}

function createCosiDemo(referenceIso: string): ScheduleState {
  const template = getScheduleTemplate('plantao-cosi');
  const state = baseState('plantao-cosi', referenceIso);
  const technicians: Technician[] = [
    { id: 'demo-cosi-1', name: 'Plantonista Fictício 01' },
    { id: 'demo-cosi-2', name: 'Plantonista Fictício 02' },
    { id: 'demo-cosi-3', name: 'Plantonista Fictício 03' },
  ];
  let sequence = 0;
  return {
    ...state,
    origin: 'demo-template',
    isDemo: true,
    sourceLabel: `Test Drive — ${template.label} (dados fictícios)`,
    technicians,
    onCallRecords: autoFillOperationalCycle(
      [],
      technicians,
      state.monthKey,
      () => `demo-cosi-oncall-${++sequence}`,
    ),
  };
}

function socCell(shift: ShiftId, text?: string): CellValue {
  return text ? { shift, text } : { shift };
}

function createSocDemo(referenceIso: string): ScheduleState {
  const template = getScheduleTemplate('soc-noc-6x1');
  const state = baseState('soc-noc-6x1', referenceIso);
  const shifts: ShiftId[] = [
    'madrugada',
    'madrugada',
    'manha',
    'manha',
    'manha',
    'tarde',
    'tarde',
    'noite',
    'noite',
  ];
  const technicians = shifts.map((_shift, index): Technician => ({
    id: `demo-soc-${index + 1}`,
    name: `Analista SOC/NOC Fictício ${String(index + 1).padStart(2, '0')}`,
    color: undefined,
  }));
  const cells: ScheduleState['cells'] = {};

  technicians.forEach((technician, techIndex) => {
    const shift = shifts[techIndex];
    const row: Record<number, CellValue | undefined> = {};
    state.dates?.forEach((_date, dateIndex) => {
      const day = dateIndex + 1;
      const isWeeklyRest = day % 7 === techIndex % 7;
      row[day] = isWeeklyRest ? socCell('folga') : socCell(shift);
    });
    cells[technician.id] = row;
  });

  for (let day = 8; day <= 13; day += 1) cells['demo-soc-3'][day] = socCell('ferias');
  for (let day = 15; day <= 17; day += 1) cells['demo-soc-8'][day] = socCell('afastamento');
  cells['demo-soc-6'][20] = socCell('extra', 'HE fictícia');

  for (const row of Object.values(cells)) {
    for (const value of Object.values(row)) {
      if (value?.text && SOC_FORBIDDEN_N1_CODES.has(value.text)) {
        throw new Error(`Código N1 inválido em demo SOC: ${value.text}`);
      }
    }
  }

  return {
    ...state,
    origin: 'demo-template',
    isDemo: true,
    sourceLabel: `Test Drive — ${template.label} (dados fictícios)`,
    technicians,
    cells,
  };
}

function n1Distribution(): ServiceDeskN1Shift[] {
  return [
    ...Array<ServiceDeskN1Shift>(2).fill('madrugada'),
    ...Array<ServiceDeskN1Shift>(9).fill('manha'),
    ...Array<ServiceDeskN1Shift>(8).fill('tarde'),
    ...Array<ServiceDeskN1Shift>(2).fill('noite'),
  ];
}

function createN1PrincipalRow(shift: ServiceDeskN1Shift, index: number, dates: string[]): ServiceDeskN1Row {
  const id = `demo-n1-principal-${index}`;
  const cells: Record<number, CellValue | undefined> = {};
  dates.forEach((_date, dateIndex) => {
    const day = dateIndex + 1;
    const weeklyRest = day % 7 === (index - 1) % 7;
    const vacation = index === 4 && day >= 10 && day <= 15;
    const absence = index === 17 && day >= 20 && day <= 22;
    const code = vacation
      ? 'X'
      : absence
        ? 'AUS'
        : weeklyRest
          ? 'F'
          : N1_WORK_CODES[(day + index) % N1_WORK_CODES.length];
    cells[day] = n1CellValue(code);
  });

  const padded = String(index).padStart(2, '0');
  return {
    id,
    technicianId: id,
    personKey: id,
    fullName: `Técnico Fictício ${padded}`,
    displayName: `Téc. Fictício ${padded}`,
    employeeCode: `N1-${String(index).padStart(4, '0')}-FICT`,
    shift,
    cells,
  };
}

function createN1EmailRow(source: ServiceDeskN1Row, index: number, dates: string[]): ServiceDeskN1Row {
  const cells: Record<number, CellValue | undefined> = {};
  dates.forEach((_date, dateIndex) => {
    const day = dateIndex + 1;
    const weeklyRest = day % 7 === index % 7;
    const vacation = index === 2 && day >= 12 && day <= 16;
    const absence = index === 4 && day >= 23 && day <= 24;
    const worksEmail = (day + index) % 3 !== 0;
    const code = vacation
      ? 'X'
      : absence
        ? 'AUS'
        : weeklyRest || !worksEmail
          ? 'F'
          : N1_EMAIL_CODES[(day + index) % N1_EMAIL_CODES.length];
    cells[day] = n1CellValue(code);
  });

  return {
    ...source,
    id: `demo-n1-email-${index}`,
    cells,
  };
}

function createN1Demo(referenceIso: string): ScheduleState {
  const template = getScheduleTemplate('service-desk-n1-6x1');
  const state = baseState('service-desk-n1-6x1', referenceIso);
  const dates = state.dates ?? [];
  const principalRows = n1Distribution().map((shift, index) => createN1PrincipalRow(shift, index + 1, dates));
  const emailGuaranteeRows = principalRows
    .slice(2, 6)
    .map((row, index) => createN1EmailRow(row, index + 1, dates));

  return syncN1Aggregate({
    ...state,
    origin: 'demo-template',
    isDemo: true,
    sourceLabel: `Test Drive — ${template.label} (dados fictícios)`,
    serviceDeskN1: {
      principalRows,
      emailGuaranteeRows,
      principalLegend: N1_PRIMARY_CODES.map(({ code, description }) => ({ code, description })),
      emailGuaranteeLegend: N1_EMAIL_GUARANTEE_CODES.map(({ code, description }) => ({ code, description })),
    },
  });
}

export function createDemoScheduleFromCatalog(kind: ScheduleTemplateKind, referenceIso: string): ScheduleState {
  if (kind === 'plantao-cosi') return createCosiDemo(referenceIso);
  if (kind === 'soc-noc-6x1') return createSocDemo(referenceIso);
  return createN1Demo(referenceIso);
}
