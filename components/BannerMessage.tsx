'use client';

import { useAutoDismiss } from '@/lib/hooks/useAutoDismiss';
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
  const { remaining, isPaused, pause, resume } = useAutoDismiss({
    duration,
    onExpire,
  });

  return (
    <div
      className={`${theme.className} relative overflow-hidden ${className}`.trim()}
      onMouseEnter={pause}
      onMouseLeave={resume}
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
            animationPlayState: isPaused ? 'paused' : 'running',
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
