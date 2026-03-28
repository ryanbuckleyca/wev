import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';

function computeFades(el: HTMLDivElement) {
  const { scrollLeft, scrollWidth, clientWidth } = el;
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  /** Match ~4px end slack when overflow is large; shrink when overflow is small so fades still appear */
  const edgeThreshold = maxScroll <= 0 ? 0 : Math.min(4, Math.floor(maxScroll / 2));
  return {
    left: scrollLeft > edgeThreshold,
    right: maxScroll > 0 && scrollLeft < maxScroll - edgeThreshold,
  };
}

export function useScrollFades() {
  const ref = useRef<HTMLDivElement>(null);
  const [fades, setFades] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setFades(computeFades(el));
  }, []);

  useLayoutEffect(() => {
    update();
  }, [update]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    update();

    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    const ro = new ResizeObserver(update);
    ro.observe(el);

    /** scrollWidth can change when children mount without clientWidth changing — ResizeObserver misses that */
    const mo = new MutationObserver(() => {
      /** Sync read catches layout immediately; rAF catches the next paint if the browser reflows late */
      update();
      requestAnimationFrame(update);
    });
    mo.observe(el, { childList: true, subtree: true });

    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro.disconnect();
      mo.disconnect();
    };
  }, [update]);

  return { ref, fades, update };
}
