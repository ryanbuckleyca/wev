'use client';

import { useRef } from 'react';
import StatusIcon from './StatusIcon';

interface BannerMessageProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  className?: string;
  duration?: number;
  onDismiss?: () => void;
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
}: BannerMessageProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  return (
    <div
      className={`design-toast ${TYPE_CLASSES[type]} relative overflow-hidden ${className}`.trim()}
      onMouseEnter={() => {
        if (barRef.current) barRef.current.style.animationPlayState = 'paused';
      }}
      onMouseLeave={() => {
        if (barRef.current) barRef.current.style.animationPlayState = 'running';
      }}
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
            onDismissRef.current?.();
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
          ref={barRef}
          className={`toast-progress-bar ${PROGRESS_COLORS[type]}`}
          style={{ animationDuration: `${duration}ms` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
