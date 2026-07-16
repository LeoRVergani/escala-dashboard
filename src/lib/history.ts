import { useCallback, useRef, useState } from 'react';

const LIMIT = 100;

/** Histórico simples de snapshots imutáveis com desfazer/refazer. */
export function useHistory<T>(initial: T) {
  const [present, setPresent] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, bump] = useState(0);

  const set = useCallback((updater: T | ((prev: T) => T)) => {
    setPresent((prev) => {
      const next =
        typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
      if (next === prev) return prev;
      past.current.push(prev);
      if (past.current.length > LIMIT) past.current.shift();
      future.current = [];
      return next;
    });
    bump((n) => n + 1);
  }, []);

  /** Substitui o presente sem registrar no histórico (ex.: carregar arquivo). */
  const reset = useCallback((value: T) => {
    past.current = [];
    future.current = [];
    setPresent(value);
    bump((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    setPresent((prev) => {
      const last = past.current.pop();
      if (last === undefined) return prev;
      future.current.push(prev);
      return last;
    });
    bump((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    setPresent((prev) => {
      const next = future.current.pop();
      if (next === undefined) return prev;
      past.current.push(prev);
      return next;
    });
    bump((n) => n + 1);
  }, []);

  return {
    state: present,
    set,
    reset,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
