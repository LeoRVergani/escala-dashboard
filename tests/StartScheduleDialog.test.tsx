import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StartScheduleDialog } from '../src/components/StartScheduleDialog';

describe('StartScheduleDialog', () => {
  it('encaminha para importar ou criar sem simular sucesso', async () => {
    const user = userEvent.setup(); const onImport = vi.fn(); const onCreate = vi.fn();
    render(<StartScheduleDialog teamName="SOC — Escala 6x1" onImport={onImport} onCreate={onCreate} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Como você deseja começar?');
    await user.click(screen.getByRole('button', { name: /Importar planilha/ }));
    await user.click(screen.getByRole('button', { name: /Criar no Dashboard/ }));
    expect(onImport).toHaveBeenCalledTimes(1); expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
