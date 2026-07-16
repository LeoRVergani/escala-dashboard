import { daysInMonth } from '../lib/normalize';
import type { CellValue, ScheduleState, ShiftId } from '../types';

/**
 * DADOS FICTÍCIOS — apenas para experimentar o painel.
 * Nomes e logins são inventados; nenhum dado real de equipe.
 * Cobre vários regimes: 12x36, 6x1 em turnos, seg–sex comercial,
 * plantão de fim de semana e escala personalizada.
 */
export function makeDemoSchedule(): ScheduleState {
  const now = new Date();
  const monthKey = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const total = daysInMonth(monthKey.year, monthKey.month);
  const firstWeekday = new Date(monthKey.year, monthKey.month - 1, 1).getDay();

  const techs = [
    { id: 'demo1', login: 'ana.ferreira', name: 'Ana Ferreira (fictício)' },
    { id: 'demo2', login: 'bruno.lima', name: 'Bruno Lima (fictício)' },
    { id: 'demo3', login: 'carla.souza', name: 'Carla Souza (fictício)' },
    { id: 'demo4', login: 'diego.alves', name: 'Diego Alves (fictício)' },
    { id: 'demo5', name: 'Elisa Prado (fictício)' },
    { id: 'demo6', login: 'fabio.rocha' },
  ];

  const cells: ScheduleState['cells'] = {};
  const put = (id: string, day: number, shift: ShiftId, text?: string) => {
    (cells[id] ??= {})[day] = { shift, ...(text ? { text } : {}) } as CellValue;
  };

  for (let d = 1; d <= total; d++) {
    const weekday = (firstWeekday + d - 1) % 7; // 0=domingo
    const weekend = weekday === 0 || weekday === 6;

    // Ana: 12x36 diurno (trabalha dias ímpares)
    put('demo1', d, d % 2 === 1 ? 'plantao' : 'folga');
    // Bruno: 12x36 noturno (dias pares)
    put('demo2', d, d % 2 === 0 ? 'noite' : 'folga');
    // Carla: 6x1 — manhã, folga a cada 7º dia
    put('demo3', d, d % 7 === 0 ? 'folga' : 'manha');
    // Diego: seg–sex tarde, fim de semana folga
    put('demo4', d, weekend ? 'folga' : 'tarde');
    // Elisa: horário comercial seg–sex, com férias na 3ª semana
    if (d >= 15 && d <= 21) put('demo5', d, 'ferias');
    else put('demo5', d, weekend ? 'folga' : 'comercial');
    // Fábio: madrugada em dias úteis + personalizado aos sábados
    if (weekday === 6) put('demo6', d, 'custom', 'Sobreaviso');
    else put('demo6', d, weekday === 0 ? 'folga' : 'madrugada');
  }

  // Um conflito proposital para demonstrar os alertas.
  put('demo2', 10, 'noite');
  put('demo2', 11, 'manha');

  return {
    monthKey,
    technicians: techs,
    cells,
    sourceLabel: 'Demonstração (dados fictícios)',
    isDemo: true,
  };
}
