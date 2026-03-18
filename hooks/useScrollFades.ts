import { useRef, useState, useEffect, useCallback } from "react";

export function useScrollFades() {
  const ref = useRef<HTMLDivElement>(null);
  const [fades, setFades] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setFades({
      left: scrollLeft > 4,
      right: scrollLeft < scrollWidth - clientWidth - 4,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    
    update();
    
    // Listen for scroll and resize events
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    
    // Listen for content changes using MutationObserver
    const observer = new MutationObserver(() => {
      // Use setTimeout to ensure DOM changes are complete
      setTimeout(update, 0);
    });
    
    observer.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [update]);

  return { ref, fades };
}
