import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnCallEditor } from '../src/components/OnCallEditor';
import { createOnCallRecord } from '../src/lib/onCall';

const baseProps = () => ({
  records: [createOnCallRecord('Bruno Bueno', '2026-07-03', 'p1')],
  technicians: [{ id: 't1', name: 'Bruno Bueno' }, { id: 't2', name: 'Caroline Ribeiro de Freitas' }],
  monthKey: { year: 2026, month: 7 },
  onChange: vi.fn(),
  onAddRecord: vi.fn(),
  onDeleteRecord: vi.fn(),
  onMoveRecord: vi.fn(),
  onAddTechnicians: vi.fn(),
  onRenameTechnician: vi.fn(),
  onSetTechnicianColor: vi.fn(),
  onRemoveTechnician: vi.fn(),
  onSetMonth: vi.fn(),
  onAutoFill: vi.fn(),
  onClearMonth: vi.fn(),
});

describe('visual do Plantão COSI', () => {
  it('mostra um único cartão com entrada, saída e duração completas', () => {
    const { container } = render(<OnCallEditor {...baseProps()} />);
    const card = container.querySelector('.oncall-record-single');
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('Bruno Bueno');
    expect(card).toHaveTextContent('Entrada 03/07/2026 19:00');
    expect(card).toHaveTextContent('Saída 04/07/2026 19:00');
    expect(card).toHaveTextContent('24h');
    expect(container.querySelectorAll('.oncall-day.weekend').length).toBeGreaterThan(0);
  });

  it('permite alternar entre card único, entrada/saída e segmentos por dia', () => {
    render(<OnCallEditor {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Entrada e saída' }));
    expect(screen.getByText('Entrada · 19:00')).toBeInTheDocument();
    expect(screen.getByText('Saída · 19:00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dividido por dia' }));
    expect(screen.getByText('19:00–24:00')).toBeInTheDocument();
    expect(screen.getByText('00:00–19:00')).toBeInTheDocument();
  });

  it('aceita arrastar um plantonista para um dia do mês', () => {
    const props = baseProps();
    const { container } = render(<OnCallEditor {...props} />);
    const roster = container.querySelector('.oncall-roster-item') as HTMLElement;
    const day = [...container.querySelectorAll('.oncall-day')].find((item) => item.textContent?.startsWith('02')) as HTMLElement;
    const data = new Map<string, string>();
    const dataTransfer = { setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) ?? '' };
    fireEvent.dragStart(roster, { dataTransfer });
    fireEvent.dragOver(day, { dataTransfer });
    fireEvent.drop(day, { dataTransfer });
    expect(props.onAddRecord).toHaveBeenCalledWith(expect.objectContaining({ technician: 'Bruno Bueno', start: '2026-07-02T19:00' }));
  });

  it('permite escolher manualmente a cor do colaborador', () => {
    const props = baseProps();
    render(<OnCallEditor {...props} />);
    fireEvent.change(screen.getByLabelText('Cor de Bruno Bueno'), { target: { value: '#123456' } });
    expect(props.onSetTechnicianColor).toHaveBeenCalledWith('t1', '#123456');
  });

  it('exibe a contabilidade operacional e o rateio do calendário separadamente', () => {
    render(<OnCallEditor {...baseProps()} />);
    expect(screen.getByText('Contabilidade dos plantões')).toBeInTheDocument();
    expect(screen.getByText('Horas dos plantões iniciados')).toBeInTheDocument();
    expect(screen.getByText('Horas dentro da tela 25–26')).toBeInTheDocument();
    expect(screen.getAllByText('24h').length).toBeGreaterThan(0);
  });

  it('sinaliza um horário acima de 24h sem alterar as datas importadas', () => {
    const props = baseProps();
    props.records = [{
      id: 'p-incomum',
      technician: 'Jean Carlo Machado Ribeiro',
      start: '2026-06-25T00:00',
      end: '2026-06-26T07:00',
      durationMinutes: 31 * 60,
    }];
    props.technicians = [{ id: 't-jean', name: 'Jean Carlo Machado Ribeiro' }];
    props.monthKey = { year: 2026, month: 6 };
    render(<OnCallEditor {...props} />);
    expect(screen.getByText('Horários para conferir')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Jean Ribeiro.*31h/ })).toHaveLength(2);
  });
});
