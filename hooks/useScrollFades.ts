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
  const fadesRef = useRef(fades);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = computeFades(el);
    // Only update state when the value actually changes — prevents MutationObserver
    // from triggering a re-render that mutates the DOM that re-fires the observer.
    if (next.left !== fadesRef.current.left || next.right !== fadesRef.current.right) {
      fadesRef.current = next;
      setFades(next);
    }
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
      update();
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
