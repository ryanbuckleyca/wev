'use client';

import { useEffect, useRef, useState } from 'react';
import { TOAST_THEMES, type ToastVariant } from '@/lib/toast-themes';

interface BannerMessageProps {
  type: Exclude<ToastVariant, 'loading'>;
  message: string;
  className?: string;
  duration?: number;
  onDismiss?: () => void;
  onExpire?: () => void;
}

export default function BannerMessage({
  type,
  message,
  className = '',
  duration,
  onDismiss,
  onExpire,
}: BannerMessageProps) {
  const theme = TOAST_THEMES[type];
  const [paused, setPaused] = useState(false);
  const [remaining, setRemaining] = useState(duration ?? 0);
  const remainingRef = useRef(duration ?? 0);
  const segmentStartRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExpireRef = useRef(onExpire);
  
  useEffect(() => { 
    onExpireRef.current = onExpire; 
  }, [onExpire]);

  useEffect(() => {
    if (!duration || !onExpireRef.current) return;
    remainingRef.current = duration;
    segmentStartRef.current = Date.now();
    timerRef.current = setTimeout(() => onExpireRef.current?.(), remainingRef.current);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [duration]);

  const handleMouseEnter = () => {
    if (!duration) return;
    if (timerRef.current) { 
      clearTimeout(timerRef.current); 
      timerRef.current = null; 
    }
    remainingRef.current = Math.max(remainingRef.current - (Date.now() - segmentStartRef.current), 0);
    setRemaining(remainingRef.current);
    setPaused(true);
  };

  const handleMouseLeave = () => {
    if (!duration || !onExpireRef.current) return;
    segmentStartRef.current = Date.now();
    timerRef.current = setTimeout(() => onExpireRef.current?.(), remainingRef.current);
    setPaused(false);
  };

  return (
    <div
      className={`${theme.className} relative overflow-hidden ${className}`.trim()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
      aria-live="assertive"
      style={theme.style}
    >
      <span className="font-bold shrink-0" aria-hidden="true">
        {theme.icon}
      </span>

      <span className="flex-1">{message}</span>

      {onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (timerRef.current) clearTimeout(timerRef.current);
            onDismiss();
          }}
          aria-label="Dismiss notification"
          className="shrink-0 ml-2 opacity-50 hover:opacity-100 transition-opacity"
          style={{ pointerEvents: 'auto' }}
        >
          ✕
        </button>
      )}

      {duration && (
        <div
          className="toast-progress-bar"
          style={{
            backgroundColor: theme.progressColor,
            animationDuration: `${remaining}ms`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
