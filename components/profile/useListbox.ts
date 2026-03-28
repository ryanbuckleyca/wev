import { useState } from 'react';

/**
 * WAI-ARIA listbox keyboard pattern (APG §listbox).
 * Single tab stop, arrow keys move active descendant, Space/Enter activates.
 * Pass `horizontal` for pill strips (ArrowLeft/Right instead of Up/Down).
 */
export function useListbox(count: number, idPrefix: string, horizontal = false) {
  const [active, setActive] = useState(0);
  const cur = count > 0 ? Math.min(active, count - 1) : 0;

  const nextKey = horizontal ? 'ArrowRight' : 'ArrowDown';
  const prevKey = horizontal ? 'ArrowLeft' : 'ArrowUp';

  function handleKeyDown(
    e: React.KeyboardEvent,
    onSelect: (i: number) => void,
    onDelete?: (i: number) => void,
  ) {
    if (!count) return;
    let next = cur;

    if (e.key === nextKey) next = Math.min(cur + 1, count - 1);
    else if (e.key === prevKey) next = Math.max(cur - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = count - 1;
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onSelect(cur);
      return;
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && onDelete) {
      e.preventDefault();
      onDelete(cur);
      return;
    } else return;

    e.preventDefault();
    setActive(next);
    document.getElementById(`${idPrefix}-${next}`)?.scrollIntoView({ block: 'nearest' });
  }

  return {
    activeIndex: cur,
    activeDescendant: count > 0 ? `${idPrefix}-${cur}` : undefined,
    setActive,
    handleKeyDown,
  };
}
