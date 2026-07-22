import { useMemo, useState } from 'react';
import { MONTHS_PT_TITLE } from '../constants';
import type { SheetLayout, WorkbookAnalysis } from '../types';

interface Props {
  analysis: WorkbookAnalysis;
  onConfirm: (optionKey: string) => void;
  onCancel: () => void;
}

const layoutLabel: Record<SheetLayout, string> = {
  matrix: 'grade', long: 'relatório', n1: 'Equipe N1', 'soc-daily': 'SOC por data',
  'soc-escalistas': 'SOC por colaborador', 'soc-combined': 'SOC cruzado',
  oncall: 'plantões com horário', unknown: 'não reconhecido',
};

function br(value?: string): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function ImportWizard({ analysis, onConfirm, onCancel }: Props) {
  const initial = analysis.options.find((option) => option.primary)?.key ?? (analysis.options.length === 1 ? analysis.options[0].key : null);
  const [selected, setSelected] = useState<string | null>(initial);
  const selectedOption = analysis.options.find((option) => option.key === selected) ?? null;
  const selectedSheet = selectedOption ? analysis.sheets.find((sheet) => sheet.sheetName === selectedOption.sheetName) : null;
  const technicians = selectedOption?.technicians ?? selectedSheet?.technicians ?? [];

  const totals = useMemo(() => ({
    periods: new Set(analysis.options.map((option) => `${option.periodStart ?? option.monthLabel}:${option.periodEnd ?? ''}`)).size,
    ignored: analysis.sheets.reduce((sum, sheet) => sum + sheet.ignoredRows.length, 0),
    errors: analysis.errors.length + analysis.sheets.reduce((sum, sheet) => sum + sheet.errors.length, 0),
  }), [analysis]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Prévia da importação">
      <div className="modal">
        <div className="modal-head"><h2>Prévia da importação</h2><span className="file-name">{analysis.fileName}</span></div>
        <div className="modal-body">
          <div className="summary">
            <div className="stat"><b>{analysis.sheets.length}</b><span>abas encontradas</span></div>
            <div className="stat"><b>{totals.periods}</b><span>períodos encontrados</span></div>
            <div className="stat"><b>{selectedOption?.techCount ?? '—'}</b><span>técnicos na seleção</span></div>
            <div className="stat"><b>{selectedOption?.recordCount ?? '—'}</b><span>registros encontrados</span></div>
            <div className="stat"><b>{selectedOption ? `${br(selectedOption.periodStart)} a ${br(selectedOption.periodEnd)}` : '—'}</b><span>período</span></div>
          </div>

          {analysis.options.length ? (
            <fieldset className="month-picker" style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend>Escolha o período ou bloco que deseja importar</legend>
              <div className="month-options">
                {analysis.options.map((option) => (
                  <button key={option.key} type="button" className="month-option" aria-pressed={selected === option.key} onClick={() => setSelected(option.key)}>
                    <b>{option.label ?? option.monthLabel}</b>
                    <span>aba “{option.sheetName}” · {option.monthLabel} · {option.techCount} técnico{option.techCount === 1 ? '' : 's'} · {layoutLabel[option.layout]}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : <p className="error-text">Nenhum período importável foi reconhecido.</p>}

          {selectedOption && (
            <details className="block" open>
              <summary>Técnicos reconhecidos nesta seleção ({technicians.length})</summary>
              <div className="inner"><div className="tech-preview">
                {technicians.map((technician, index) => <span key={`${technician.row}-${index}`} className="pill">{technician.name ?? <em className="muted">sem nome</em>} <span className="pill-login">{technician.login ? `(${technician.login})` : '(sem login)'}</span></span>)}
              </div></div>
            </details>
          )}

          <details className="block">
            <summary>Abas, meses e blocos detectados</summary>
            <div className="inner"><ul>{analysis.sheets.map((sheet) => (
              <li key={sheet.sheetName}><b>{sheet.sheetName}</b> <span className="muted">· {layoutLabel[sheet.layout]}</span>
                {sheet.months.length > 0 && <ul>{sheet.months.map((month, index) => <li key={index} className="muted">{MONTHS_PT_TITLE[month.month - 1]}{month.year ? ` de ${month.year}` : ''} — {month.label}</li>)}</ul>}
                {sheet.blocks && sheet.blocks.length > 1 && <ul>{sheet.blocks.map((block) => <li key={block.id} className="muted">{block.primary ? 'Principal' : 'Auxiliar'}: {block.title} · {block.techCount} técnicos</li>)}</ul>}
              </li>
            ))}</ul></div>
          </details>

          <details className="block" open={totals.ignored > 0}>
            <summary>Valores e linhas ignorados ({totals.ignored})</summary>
            <div className="inner">{totals.ignored === 0 ? <p className="muted">Nenhum valor foi ignorado.</p> : <ul>{analysis.sheets.flatMap((sheet) => sheet.ignoredRows.map((row, index) => <li key={`${sheet.sheetName}-${index}`}><b>{sheet.sheetName}</b>, linha {row.row}: {row.reason}{row.preview && <span className="muted"> — “{row.preview}”</span>}</li>))}</ul>}</div>
          </details>

          <details className="block" open={totals.errors > 0}>
            <summary>Erros e avisos</summary>
            <div className="inner"><ul>
              {analysis.errors.map((error, index) => <li key={`g${index}`} className="error-text">{error}</li>)}
              {analysis.sheets.flatMap((sheet) => [...sheet.errors.map((error, index) => <li key={`${sheet.sheetName}-e${index}`} className="error-text"><b>{sheet.sheetName}</b>: {error}</li>), ...sheet.warnings.map((warning, index) => <li key={`${sheet.sheetName}-w${index}`} className="warn-text"><b>{sheet.sheetName}</b>: {warning}</li>)])}
            </ul></div>
          </details>
        </div>
        <div className="modal-foot"><button className="btn" onClick={onCancel}>Cancelar</button><button className="btn btn-primary" disabled={!selected} onClick={() => selected && onConfirm(selected)}>Importar seleção</button></div>
      </div>
    </div>
  );
}
