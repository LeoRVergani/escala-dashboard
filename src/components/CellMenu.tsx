import { useEffect, useRef, useState } from 'react';
import { SHIFTS } from '../constants';
import type { ShiftId } from '../types';

interface CustomOption {
  code: string;
  label: string;
  description?: string;
}

interface Props {
  x: number;
  y: number;
  selectionCount: number;
  initialCustom?: string;
  onPick: (shift: ShiftId, text?: string) => void;
  onClear: () => void;
  onClose: () => void;
  customOptions?: CustomOption[];
}

export function CellMenu({ x, y, selectionCount, initialCustom, onPick, onClear, onClose, customOptions }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [custom, setCustom] = useState(initialCustom ?? '');
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const applyCustom = () => {
    const t = custom.trim();
    if (t) onPick('custom', t);
  };

  return (
    <div className="popover" role="menu" aria-label="Turno da célula" ref={ref} style={pos}>
      {selectionCount > 1 && (
        <div className="menu-note">Aplicar a {selectionCount} células selecionadas</div>
      )}
      <div className="menu-grid">
        {(customOptions ?? SHIFTS).map((s) => (
          <button
            key={'id' in s ? s.id : s.code}
            role="menuitem"
            className="menu-item"
            style={'id' in s ? {
              ['--chip-bg' as string]: `var(--sh-${s.id}-bg)`,
              ['--chip-fg' as string]: `var(--sh-${s.id}-fg)`,
            } : undefined}
            title={'description' in s ? s.description : undefined}
            onClick={() => ('id' in s ? onPick(s.id) : onPick('custom', s.code))}
          >
            {'code' in s && !('id' in s) ? `${s.code} · ${s.label}` : s.label}
          </button>
        ))}
      </div>
      <div className="menu-custom">
        <input
          aria-label="Turno personalizado"
          placeholder="Personalizado (ex.: Sobreaviso)"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applyCustom()}
          autoFocus={Boolean(initialCustom)}
        />
        <button className="btn" onClick={applyCustom} disabled={!custom.trim()}>
          OK
        </button>
      </div>
      <div className="menu-footer">
        <button className="btn btn-ghost" onClick={onClear}>
          Limpar
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}
