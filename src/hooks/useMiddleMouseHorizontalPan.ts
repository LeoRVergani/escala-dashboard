import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

const INTERACTIVE_SELECTOR = 'input, textarea, select, button, a, [role="button"], [role="menu"], [role="dialog"], [contenteditable="true"]';

export function isInteractivePanTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR));
}

export function useMiddleMouseHorizontalPan(ref: RefObject<HTMLElement>) {
  const origin = useRef<{ pointerId: number; clientX: number; scrollLeft: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const finish = useCallback((event?: ReactPointerEvent<HTMLElement>) => {
    const active = origin.current;
    if (!active) return;
    origin.current = null;
    setIsPanning(false);
    if (event?.currentTarget.hasPointerCapture?.(active.pointerId)) {
      event.currentTarget.releasePointerCapture?.(active.pointerId);
    }
  }, []);

  return {
    isPanning,
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 1 || isInteractivePanTarget(event.target) || !ref.current) return;
      event.preventDefault();
      origin.current = { pointerId: event.pointerId, clientX: event.clientX, scrollLeft: ref.current.scrollLeft };
      setIsPanning(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const active = origin.current;
      if (!active || active.pointerId !== event.pointerId || !ref.current) return;
      event.preventDefault();
      ref.current.scrollLeft = active.scrollLeft - (event.clientX - active.clientX);
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onAuxClick: (event: ReactMouseEvent<HTMLElement>) => {
      if (event.button === 1 && !isInteractivePanTarget(event.target)) event.preventDefault();
    },
  };
}
