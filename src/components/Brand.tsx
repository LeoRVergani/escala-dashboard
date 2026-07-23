interface BrandProps {
  compact?: boolean;
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className={`brand-lockup${compact ? ' brand-lockup--compact' : ''}`} aria-label="Escala ICI">
      <span className="brand-lockup__mark">
        <img src="/brand/escala-ici-mark.webp" alt="Escala ICI" />
      </span>
      <span className="brand-lockup__text" aria-hidden={compact ? 'true' : undefined}>
        <span>Escala</span>
        <span className="brand-lockup__seal">ICI</span>
      </span>
    </div>
  );
}
