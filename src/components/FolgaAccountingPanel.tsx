import type { ScheduleState } from '../types';
import { folgaAccounting } from '../lib/folgaAccounting';
import { technicianIdStyle } from '../lib/technicianStyle';

interface Props {
  state: ScheduleState;
}

export function FolgaAccountingPanel({ state }: Props) {
  const rows = folgaAccounting(state);
  const sumSunday = rows.reduce((sum, row) => sum + row.sunday, 0);
  const sumSaturday = rows.reduce((sum, row) => sum + row.saturday, 0);
  const sumWeek = rows.reduce((sum, row) => sum + row.week, 0);
  const sumTotal = rows.reduce((sum, row) => sum + row.total, 0);
  const maxTotal = Math.max(...rows.map((row) => row.total));
  const minTotal = Math.min(...rows.map((row) => row.total));
  const maxSunday = Math.max(...rows.map((row) => row.sunday));
  const minSunday = Math.min(...rows.map((row) => row.sunday));
  const maxSaturday = Math.max(...rows.map((row) => row.saturday));
  const minSaturday = Math.min(...rows.map((row) => row.saturday));

  return (
    <section className="oncall-accounting">
      <div className="oncall-section-title">
        <div>
          <strong>Contabilidade das folgas</strong>
          <span>A contagem usa os estados diários da aba Escalistas e é atualizada conforme o rascunho da escala.</span>
        </div>
      </div>
      <div className="oncall-accounting-scroll">
        <table>
          <thead><tr><th>Colaborador</th><th>Domingo</th><th>Sábado</th><th>Semana</th><th>Total de folgas</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.technicianId}>
                <td><span className="accounting-dot" style={technicianIdStyle(row.technicianId, state.technicians)} />{row.technicianName}</td>
                <td>{row.sunday}</td><td>{row.saturday}</td><td>{row.week}</td><td>{row.total}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="oncall-empty-note">Ainda não há colaboradores ou folgas neste período.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr><th>Total</th><th>{sumSunday}</th><th>{sumSaturday}</th><th>{sumWeek}</th><th>{sumTotal}</th></tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows.length > 1 && (
        <p className="oncall-empty-note">
          Maior total: {maxTotal} · Menor total: {minTotal} · Diferença: {maxTotal - minTotal} folgas
          {' · '}Diferença de domingos: {maxSunday - minSunday} · Diferença de sábados: {maxSaturday - minSaturday}
        </p>
      )}
    </section>
  );
}
