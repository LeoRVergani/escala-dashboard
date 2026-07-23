import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShiftRail, DestinationSeal } from '../src/components/OperationalMotifs';
import { ALL_SCHEDULE_TOKENS } from '../src/lib/scheduleTokens';

describe('OperationalMotifs', () => {
  it('renderiza ShiftRail proporcional usando cores dos tokens de escala', () => {
    const mdColor = ALL_SCHEDULE_TOKENS.find((token) => token.code === 'Md')?.colorHex;
    render(<ShiftRail counts={{ Md: 2, M: 1 }} />);

    const rail = screen.getByRole('img', { name: /Md: 2/ });
    const firstSegment = rail.querySelector('.shift-rail__segment');
    expect(firstSegment).toHaveStyle({ backgroundColor: mdColor });
  });

  it('usa placeholder oculto quando não há contagens reais', () => {
    const { container } = render(<ShiftRail counts={{}} />);

    expect(container.querySelector('.shift-rail')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.shift-rail__segment')).toHaveLength(5);
  });

  it('renderiza DestinationSeal com destino e período opcional', () => {
    render(<DestinationSeal area="COSI" team="SOC" period="Julho 2026" />);

    expect(screen.getByText('COSI / SOC')).toBeInTheDocument();
    expect(screen.getByText('Julho 2026')).toBeInTheDocument();
  });
});
