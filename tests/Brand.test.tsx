import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Brand } from '../src/components/Brand';

describe('Brand', () => {
  it('renderiza a marca real do Escala ICI', () => {
    render(<Brand />);

    expect(screen.getByRole('img', { name: 'Escala ICI' })).toHaveAttribute('src', '/brand/escala-ici-mark.webp');
    expect(screen.getByText('Escala')).toBeInTheDocument();
    expect(screen.getByText('ICI')).toBeInTheDocument();
  });

  it('mantém a imagem e oculta o texto quando compacta', () => {
    const { container } = render(<Brand compact />);

    expect(screen.getByRole('img', { name: 'Escala ICI' })).toBeInTheDocument();
    expect(container.querySelector('.brand-lockup')).toHaveClass('brand-lockup--compact');
  });
});
