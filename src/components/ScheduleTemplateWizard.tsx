import { useMemo, useState } from 'react';
import { MONTHS_PT_TITLE } from '../constants';
import { cycle25To26 } from '../lib/dates';
import { createDemoScheduleFromCatalog, createEmptyScheduleFromCatalog, withManualTechnicians } from '../lib/scheduleFactories';
import { SCHEDULE_TEMPLATES, getScheduleTemplate } from '../lib/scheduleCatalog';
import { monthDates } from '../lib/onCall';
import type { ScheduleState, ScheduleTemplateKind } from '../types';

interface Props {
  mode: 'empty' | 'demo';
  onConfirm: (state: ScheduleState) => void;
  onCancel: () => void;
}

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function br(value?: string): string {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function referenceIso(monthValue: string): string {
  return `${monthValue}-01`;
}

function monthKey(monthValue: string) {
  return { year: Number(monthValue.slice(0, 4)), month: Number(monthValue.slice(5, 7)) };
}

function datesForTemplate(kind: ScheduleTemplateKind, monthValue: string): string[] {
  const template = getScheduleTemplate(kind);
  const key = monthKey(monthValue);
  return template.periodStrategy === 'cycle-25-26'
    ? cycle25To26(key).dates
    : monthDates(key);
}

function periodNote(kind: ScheduleTemplateKind): string {
  return getScheduleTemplate(kind).periodStrategy === 'cycle-25-26'
    ? 'Este tipo usa ciclo operacional 25->26.'
    : 'Este tipo usa mês civil.';
}

function manualNames(value: string): string[] {
  return value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
}

export function ScheduleTemplateWizard({ mode, onConfirm, onCancel }: Props) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<ScheduleTemplateKind>(SCHEDULE_TEMPLATES[0].kind);
  const [monthValue, setMonthValue] = useState(currentMonthValue);
  const [technicianText, setTechnicianText] = useState('');
  const steps = mode === 'empty' ? ['tipo', 'periodo', 'colaboradores', 'resumo'] : ['tipo', 'periodo', 'resumo'];
  const selectedTemplate = getScheduleTemplate(kind);
  const dates = useMemo(() => datesForTemplate(kind, monthValue), [kind, monthValue]);
  const names = useMemo(() => manualNames(technicianText), [technicianText]);
  const canGoBack = step > 0;
  const canGoNext = step < steps.length - 1;
  const title = mode === 'demo' ? 'Test Drive — dados fictícios locais' : 'Criar escala vazia';

  const confirm = () => {
    const state = mode === 'demo'
      ? createDemoScheduleFromCatalog(kind, referenceIso(monthValue))
      : withManualTechnicians(createEmptyScheduleFromCatalog(kind, referenceIso(monthValue)), names);
    onConfirm(state);
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <div className="modal-head">
          <h2>{title}</h2>
          <span className="file-name">Etapa {step + 1} de {steps.length}</span>
        </div>
        <div className="modal-body">
          {steps[step] === 'tipo' && (
            <fieldset className="month-picker" style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend>Escolha o tipo de escala</legend>
              <div className="month-options">
                {SCHEDULE_TEMPLATES.map((template) => (
                  <button
                    key={template.kind}
                    type="button"
                    className="month-option"
                    aria-pressed={kind === template.kind}
                    onClick={() => setKind(template.kind)}
                  >
                    <b>{template.label}</b>
                    <span>{template.description}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {steps[step] === 'periodo' && (
            <fieldset className="month-picker" style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend>Escolha o período</legend>
              <input type="month" value={monthValue} onChange={(event) => setMonthValue(event.target.value)} />
              <p className="muted">{periodNote(kind)}</p>
            </fieldset>
          )}

          {steps[step] === 'colaboradores' && (
            <fieldset className="month-picker" style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend>Colaboradores opcionais</legend>
              <textarea
                rows={6}
                value={technicianText}
                onChange={(event) => setTechnicianText(event.target.value)}
                placeholder="Um nome por linha"
              />
              <p className="muted">Opcional. A lista também pode ser preenchida depois no editor.</p>
            </fieldset>
          )}

          {steps[step] === 'resumo' && (
            <>
              <div className="summary">
                <div className="stat"><b>{selectedTemplate.label}</b><span>tipo de escala</span></div>
                <div className="stat"><b>{MONTHS_PT_TITLE[monthKey(monthValue).month - 1]} de {monthKey(monthValue).year}</b><span>referência</span></div>
                <div className="stat"><b>{br(dates[0])} a {br(dates[dates.length - 1])}</b><span>período</span></div>
                {mode === 'empty' && <div className="stat"><b>{names.length}</b><span>colaboradores informados</span></div>}
              </div>
              {mode === 'demo' && <p className="warn-text">Test Drive — dados fictícios locais</p>}
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>Cancelar</button>
          {canGoBack && <button className="btn" onClick={() => setStep((current) => current - 1)}>Voltar</button>}
          {canGoNext
            ? <button className="btn btn-primary" onClick={() => setStep((current) => current + 1)}>Avançar</button>
            : <button className="btn btn-primary" onClick={confirm}>Confirmar</button>}
        </div>
      </div>
    </div>
  );
}
