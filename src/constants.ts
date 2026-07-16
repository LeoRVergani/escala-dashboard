import type { ShiftDef, ShiftId } from './types';

export const SHIFTS: ShiftDef[] = [
  { id: 'madrugada', label: 'Madrugada', code: 'MAD' },
  { id: 'manha', label: 'Manhã', code: 'M' },
  { id: 'tarde', label: 'Tarde', code: 'T' },
  { id: 'noite', label: 'Noite', code: 'N' },
  { id: 'folga', label: 'Folga', code: 'F' },
  { id: 'ferias', label: 'Férias', code: 'FE' },
  { id: 'plantao', label: 'Plantão', code: 'P' },
  { id: 'comercial', label: 'Horário comercial', code: 'HC' },
  { id: 'extra', label: 'Hora extra', code: 'HE' },
  { id: 'afastamento', label: 'Afastamento', code: 'AF' },
];

export const SHIFT_BY_ID: Record<ShiftId, ShiftDef> = Object.fromEntries(
  SHIFTS.map((s) => [s.id, s]),
) as Record<ShiftId, ShiftDef>;

SHIFT_BY_ID.custom = { id: 'custom', label: 'Personalizado', code: '*' };

export const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export const MONTHS_PT_TITLE = MONTHS_PT.map(
  (m) => m.charAt(0).toUpperCase() + m.slice(1),
);

export const WEEKDAY_ABBREVIATIONS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export const DRAFT_STORAGE_KEY = 'escala-dashboard:rascunho:v1';

export interface N1CodeDef {
  code: string;
  label: string;
  description: string;
}

export const N1_PRIMARY_CODES: N1CodeDef[] = [
  { code: '1', label: 'Dia 1', description: 'Trabalha — sequência normal' },
  { code: '2', label: 'Dia 2', description: 'Trabalha — sequência normal' },
  { code: '3', label: 'Dia 3', description: 'Trabalha — sequência normal' },
  { code: '4', label: 'Dia 4', description: 'Trabalha — sequência normal' },
  { code: '5', label: 'Dia 5', description: 'Trabalha — sequência normal' },
  { code: '6', label: 'Dia 6', description: 'Trabalha — sequência normal' },
  { code: 'M', label: 'Todos os NOCs', description: 'Monitoramento de todos os NOCs' },
  { code: 'M1', label: 'Monitoramento M1', description: 'Muralha, SME e Wi-Fis' },
  { code: 'M2', label: 'Monitoramento M2', description: 'CORP, SEC, ICI, links e Wi-Fi Curitiba' },
  { code: 'M3', label: 'Monitoramento M3', description: 'SMS, servidores externos e Projeto SIM' },
  { code: 'M4', label: 'Monitoramento M4', description: 'CORP, SEC, SMS e servidores externos' },
  { code: 'F', label: 'Folga', description: 'Folga, DSR, banco de horas ou aniversário' },
  { code: 'X', label: 'Férias', description: 'Férias' },
  { code: 'AUS', label: 'Ausência', description: 'Atestado, declaração ou falta' },
];

export const N1_EMAIL_GUARANTEE_CODES: N1CodeDef[] = [
  { code: 'E', label: 'E-mail', description: 'Executa a atividade de e-mail' },
  { code: 'G', label: 'Garantia', description: 'Executa a atividade de garantia' },
  { code: 'T', label: 'Todos', description: 'Executa e-mail e garantia' },
  { code: 'F', label: 'Folga', description: 'Folga, DSR, banco de horas ou aniversário' },
  { code: 'X', label: 'Férias', description: 'Férias' },
  { code: 'AUS', label: 'Ausência', description: 'Atestado, declaração ou falta' },
];

export const N1_SHIFT_LABELS = {
  madrugada: { label: 'Madrugada', hours: '01:00–07:00' },
  manha: { label: 'Manhã', hours: '07:00–13:00' },
  tarde: { label: 'Tarde', hours: '13:00–19:00' },
  noite: { label: 'Noite', hours: '19:00–01:00' },
} as const;
