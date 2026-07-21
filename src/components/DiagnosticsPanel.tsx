import { useState } from 'react';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface DiagnosticItem {
  id: string;
  severity: DiagnosticSeverity;
  message: string;
  detail?: string;
}

interface DiagnosticsPanelProps {
  items: DiagnosticItem[];
  emptyMessage?: string;
}

const SEVERITY_LABEL: Record<DiagnosticSeverity, string> = {
  error: 'Erro',
  warning: 'Atenção',
  info: 'Info',
};

/**
 * Área compacta de diagnósticos (FASE 14E, seção "Mensagens e diagnósticos"): agrupa
 * erro/aviso/informação num único lugar, sem escondar a mensagem real por trás de texto
 * genérico. Cada item pode expandir um detalhe técnico (código/stack resumido) sem
 * obrigar o usuário a lidar com ele por padrão.
 */
export function DiagnosticsPanel({ items, emptyMessage = 'Nenhum diagnóstico pendente.' }: DiagnosticsPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (items.length === 0) {
    return <p className="diagnostics-empty" role="status">{emptyMessage}</p>;
  }

  const counts = items.reduce(
    (acc, item) => ({ ...acc, [item.severity]: acc[item.severity] + 1 }),
    { error: 0, warning: 0, info: 0 } as Record<DiagnosticSeverity, number>,
  );

  return (
    <section className="diagnostics-panel" aria-label="Diagnósticos">
      <div className="diagnostics-summary">
        {counts.error > 0 && <span className="diagnostics-count diagnostics-count-error">{counts.error} erro(s)</span>}
        {counts.warning > 0 && <span className="diagnostics-count diagnostics-count-warning">{counts.warning} aviso(s)</span>}
        {counts.info > 0 && <span className="diagnostics-count diagnostics-count-info">{counts.info} info</span>}
      </div>
      <ul className="diagnostics-list">
        {items.map((item) => (
          <li key={item.id} className={`diagnostics-item diagnostics-item-${item.severity}`}>
            <div className="diagnostics-item-head">
              <span className="diagnostics-item-severity">{SEVERITY_LABEL[item.severity]}</span>
              <span className="diagnostics-item-message">{item.message}</span>
              {item.detail && (
                <button
                  type="button"
                  className="diagnostics-item-toggle"
                  aria-expanded={expanded.has(item.id)}
                  onClick={() => setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                    return next;
                  })}
                >
                  Detalhes técnicos
                </button>
              )}
            </div>
            {item.detail && expanded.has(item.id) && (
              <pre className="diagnostics-item-detail">{item.detail}</pre>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
