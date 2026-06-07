import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { adjustCutoffOnRemove, adjustCutoffOnReorder } from '@/lib/ranked-list';

/**
 * Manages a single ordered list where items 0..cutoff-1 are "ranked" (prioritised)
 * and items cutoff..end are unranked.
 *
 * @param getId - extracts a stable string ID from an item (used for identity checks)
 */
export function useRankedList<T>(getId: (item: T) => string) {
  const [items, setItems] = useState<T[]>([]);
  const [cutoff, setCutoff] = useState(0);

  // Refs so handlers always read the latest committed state without stale closures.
  // (React 19 can split nested setState calls into separate renders.)
  const itemsRef = useRef(items);
  const cutoffRef = useRef(cutoff);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    cutoffRef.current = cutoff;
  }, [cutoff]);

  const toggle = useCallback(
    (item: T) => {
      const id = getId(item);
      const idx = itemsRef.current.findIndex((i) => getId(i) === id);
      if (idx !== -1) {
        setItems((prev) => prev.filter((i) => getId(i) !== id));
        setCutoff((c) => adjustCutoffOnRemove(idx, c));
      } else {
        const currentCutoff = cutoffRef.current;
        setItems((prev) => [...prev.slice(0, currentCutoff), item, ...prev.slice(currentCutoff)]);
      }
    },
    [getId],
  );

  const reorder = useCallback((from: number, to: number, explicitCutoff?: number) => {
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setCutoff((c) => adjustCutoffOnReorder(from, to, c, explicitCutoff));
  }, []);

  const remove = useCallback(
    (id: string) => {
      const idx = itemsRef.current.findIndex((i) => getId(i) === id);
      setItems((prev) => prev.filter((i) => getId(i) !== id));
      if (idx !== -1) setCutoff((c) => adjustCutoffOnRemove(idx, c));
    },
    [getId],
  );

  return useMemo(
    () => ({ items, cutoff, setItems, setCutoff, toggle, reorder, remove }),
    [items, cutoff, toggle, reorder, remove],
  );
}
