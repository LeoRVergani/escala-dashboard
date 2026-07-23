import { N1_EMAIL_GUARANTEE_CODES, N1_PRIMARY_CODES, SHIFT_BY_ID } from '../constants';
import type { ScheduleTemplateDefinition, ScheduleTemplateKind } from '../types';
import { OPERATIONAL_SHIFT_IDS } from './assignments';

export const SCHEDULE_TEMPLATES: ScheduleTemplateDefinition[] = [
  {
    kind: 'plantao-cosi',
    label: 'Plantão COSI',
    shortLabel: 'COSI',
    description: 'Modelo para registrar plantões COSI em formato de sobreaviso por período operacional.',
    periodStrategy: 'cycle-25-26',
    viewType: 'oncall',
    serviceDeskN1: false,
    allowedShiftCodes: [SHIFT_BY_ID.plantao.id],
  },
  {
    kind: 'soc-noc-6x1',
    label: 'Escala 6x1 (SOC ou NOC)',
    shortLabel: '6x1',
    description: 'Modelo para escala 6x1 usado por SOC ou NOC, organizado por turnos operacionais.',
    periodStrategy: 'cycle-25-26',
    viewType: 'schedule',
    visualGrouping: 'operational-shift',
    serviceDeskN1: false,
    allowedShiftCodes: [
      ...OPERATIONAL_SHIFT_IDS,
      SHIFT_BY_ID.folga.id,
      SHIFT_BY_ID.ferias.id,
      SHIFT_BY_ID.afastamento.id,
      SHIFT_BY_ID.extra.id,
    ],
  },
  {
    kind: 'service-desk-n1-6x1',
    label: 'Service Desk N1 — Escala 6x1',
    shortLabel: 'Service Desk N1',
    description: 'Modelo para escala 6x1 do Service Desk N1 em mês civil com códigos próprios de operação.',
    periodStrategy: 'calendar-month',
    viewType: 'schedule',
    serviceDeskN1: true,
    allowedShiftCodes: [
      ...N1_PRIMARY_CODES.map((item) => item.code),
      ...N1_EMAIL_GUARANTEE_CODES.map((item) => item.code),
    ],
  },
];

export function getScheduleTemplate(kind: ScheduleTemplateKind): ScheduleTemplateDefinition {
  const template = SCHEDULE_TEMPLATES.find((item) => item.kind === kind);
  if (!template) {
    throw new Error(`Template de escala não encontrado: ${kind}`);
  }
  return template;
}
