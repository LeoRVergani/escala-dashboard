interface StartScheduleDialogProps {
  teamName?: string;
  period?: string;
  onImport: () => void;
  onCreate: () => void;
  onClose: () => void;
}

export function StartScheduleDialog({ teamName, period, onImport, onCreate, onClose }: StartScheduleDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="start-schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="start-schedule-title">
        <button type="button" className="icon-btn start-schedule-dialog__close" aria-label="Fechar" onClick={onClose}>×</button>
        <span className="page-eyebrow">Nova preparação</span>
        <h2 id="start-schedule-title">Como você deseja começar?</h2>
        <p>{teamName ?? 'Equipe não selecionada'}{period ? ` · ${period}` : ''}</p>
        <div className="start-schedule-dialog__options">
          <button type="button" className="start-option" onClick={onImport}><strong>Importar planilha XLS/XLSX</strong><span>Usar o parser existente para revisar um arquivo.</span></button>
          <button type="button" className="start-option" onClick={onCreate}><strong>Criar no Dashboard</strong><span>Escolher um modelo real e preparar um novo período.</span></button>
        </div>
      </section>
    </div>
  );
}
