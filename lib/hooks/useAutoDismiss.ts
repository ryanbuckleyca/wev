'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseAutoDismissProps {
  duration?: number;
  onExpire?: () => void;
}

export function useAutoDismiss({ duration, onExpire }: UseAutoDismissProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [remaining, setRemaining] = useState(duration ?? 0);
  
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segmentStartRef = useRef<number>(0);
  const onExpireRef = useRef(onExpire);

  // Keep onExpire callback stable in the timeout
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    if (!duration) return;
    
    clearTimer();
    const elapsed = Date.now() - segmentStartRef.current;
    const newRemaining = Math.max(remaining - elapsed, 0);
    
    setRemaining(newRemaining);
    setIsPaused(true);
  }, [duration, remaining, clearTimer]);

  const resume = useCallback(() => {
    if (!duration || !onExpireRef.current) return;
    
    segmentStartRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      onExpireRef.current?.();
    }, remaining);
    
    setIsPaused(false);
  }, [duration, remaining]);

  // Initial start
  useEffect(() => {
    if (!duration || !onExpireRef.current) return;

    setRemaining(duration);
    segmentStartRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      onExpireRef.current?.();
    }, duration);

    return clearTimer;
  }, [duration, clearTimer]);

  return {
    remaining,
    isPaused,
    pause,
    resume,
  };
}
