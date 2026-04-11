'use client';

import { TOAST_THEMES, type ToastVariant } from '@/lib/toast-themes';

interface BannerMessageProps {
  type: ToastVariant;
  message: string;
  className?: string;
}

export default function BannerMessage({ type, message, className = '' }: BannerMessageProps) {
  const theme = TOAST_THEMES[type];

  return (
    <div
      className={`${theme.className} relative overflow-hidden !shadow-none !max-w-none ${className}`.trim()}
      role="alert"
      aria-live="assertive"
      style={theme.style}
    >
      <span className="font-bold shrink-0" aria-hidden="true">
        {theme.icon}
      </span>

      <span className="flex-1">{message}</span>
    </div>
  );
}
