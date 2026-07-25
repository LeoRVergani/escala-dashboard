import { AppDialog } from './ui/AppDialog';

interface StartScheduleDialogProps {
  teamName?: string;
  period?: string;
  onImport: () => void;
  onCreate: () => void;
  onClose: () => void;
}

export function StartScheduleDialog({ teamName, period, onImport, onCreate, onClose }: StartScheduleDialogProps) {
  return (
    <AppDialog
      open
      onClose={onClose}
      title="Como você deseja começar?"
      description={<span className="page-eyebrow">Nova preparação</span>}
      panelClassName="app-dialog start-schedule-dialog"
      labelledById="start-schedule-title"
    >
      <p>{teamName ?? 'Equipe não selecionada'}{period ? ` · ${period}` : ''}</p>
      <div className="start-schedule-dialog__options">
        <button type="button" className="start-option" onClick={onImport}><strong>Importar planilha XLS/XLSX</strong><span>Usar o parser existente para revisar um arquivo.</span></button>
        <button type="button" className="start-option" onClick={onCreate}><strong>Criar no Dashboard</strong><span>Escolher um modelo real e preparar um novo período.</span></button>
      </div>
    </AppDialog>
  );
}
