'use client';

import { useEffect, useRef, useState } from 'react';
import StatusIcon from './StatusIcon';

interface BannerMessageProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  className?: string;
  duration?: number;
  onDismiss?: () => void;
  onExpire?: () => void;
}

const TYPE_CLASSES: Record<BannerMessageProps['type'], string> = {
  success: 'design-toast-success',
  error: 'design-toast-alert',
  warning: 'design-toast-warning',
  info: 'design-toast-info',
};

const TEXT_COLORS: Record<BannerMessageProps['type'], string> = {
  success: 'text-[var(--success-text)]',
  error: 'text-[var(--destructive-foreground)]',
  warning: 'text-[var(--warn-text)]',
  info: 'text-[var(--info-text)]',
};

const PROGRESS_COLORS: Record<BannerMessageProps['type'], string> = {
  success: 'bg-[var(--success-solid)]',
  error: 'bg-[var(--destructive)]',
  warning: 'bg-[var(--warn-solid)]',
  info: 'bg-[var(--info-solid)]',
};

export default function BannerMessage({
  type,
  message,
  className = '',
  duration,
  onDismiss,
  onExpire,
}: BannerMessageProps) {
  const [paused, setPaused] = useState(false);
  const [remaining, setRemaining] = useState(duration ?? 0);
  const remainingRef = useRef(duration ?? 0);
  const segmentStartRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [barKey, setBarKey] = useState(0);

  useEffect(() => {
    if (!duration || !onExpire) return;
    remainingRef.current = duration;
    segmentStartRef.current = Date.now();
    timerRef.current = setTimeout(onExpire, remainingRef.current);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [duration, onExpire]);

  const handleMouseEnter = () => {
    if (!duration) return;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    remainingRef.current = Math.max(remainingRef.current - (Date.now() - segmentStartRef.current), 0);
    setRemaining(remainingRef.current);
    setPaused(true);
  };

  const handleMouseLeave = () => {
    if (!duration || !onExpire) return;
    segmentStartRef.current = Date.now();
    timerRef.current = setTimeout(onExpire, remainingRef.current);
    setBarKey((k) => k + 1);
    setPaused(false);
  };

  return (
    <div
      className={`design-toast ${TYPE_CLASSES[type]} relative overflow-hidden ${className}`.trim()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
      aria-live="assertive"
    >
      <span className={`font-bold shrink-0 ${TEXT_COLORS[type]}`} aria-hidden="true">
        <StatusIcon type={type} />
      </span>

      <span className={`flex-1 ${TEXT_COLORS[type]}`}>{message}</span>

      {onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (timerRef.current) clearTimeout(timerRef.current);
            onDismiss();
          }}
          aria-label="Dismiss notification"
          className={`shrink-0 ml-2 opacity-50 hover:opacity-100 transition-opacity ${TEXT_COLORS[type]}`}
          style={{ pointerEvents: 'auto' }}
        >
          ✕
        </button>
      )}

      {duration && (
        <div
          key={barKey}
          className={`toast-progress-bar ${PROGRESS_COLORS[type]}`}
          style={{
            animationDuration: `${remaining}ms`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
