import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlowSteps } from '../src/components/FlowSteps';

describe('FlowSteps', () => {
  it('renderiza três marcos com atual e concluídos acessíveis', () => {
    render(<FlowSteps current={2} labels={['Importar ou criar', 'Revisar', 'Publicar']} />);

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Importar ou criar')).toBeInTheDocument();
    expect(screen.getByText('Revisar').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('✓')).toBeInTheDocument();
  });
});
