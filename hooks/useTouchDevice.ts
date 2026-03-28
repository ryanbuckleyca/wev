import { useState, useEffect } from 'react';

export function useTouchDevice() {
  const [isTouch, setIsTouch] = useState(() => window.matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const handler = () => setIsTouch(mediaQuery.matches);

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return isTouch;
}
