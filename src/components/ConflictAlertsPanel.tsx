import { forwardRef } from 'react';
import type { Conflict } from '../types';

interface Props {
  conflicts: Conflict[];
  onNavigate?: (conflict: Conflict) => void;
}

export const ConflictAlertsPanel = forwardRef<HTMLElement, Props>(function ConflictAlertsPanel(
  { conflicts, onNavigate },
  ref,
) {
  return <section ref={ref} className="conflict-panel" aria-label="Alertas de conflito" tabIndex={-1}>
    <h3>Alertas de conflito (não bloqueiam a edição)</h3>
    {conflicts.length === 0 ? (
      <p className="conflict-empty">Nenhum conflito detectado.</p>
    ) : (
      <ul>
        {conflicts.map((conflict, index) => <li key={`${conflict.kind}:${conflict.techId}:${conflict.day ?? 'all'}:${index}`}>
          <button onClick={() => onNavigate?.(conflict)}>{conflict.message}</button>
        </li>)}
      </ul>
    )}
  </section>;
});
