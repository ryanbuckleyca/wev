'use client';

import { useState } from 'react';
import toast, { ToastBar, Toaster, type Toast } from 'react-hot-toast';

function getToastProgressColor(toastItem: Toast): string {
  const className = typeof toastItem.className === 'string' ? toastItem.className : '';

  if (toastItem.type === 'success' || className.includes('design-toast-success')) {
    return 'var(--success-solid)';
  }
  if (toastItem.type === 'error' || className.includes('design-toast-alert')) {
    return 'var(--destructive)';
  }
  if (className.includes('design-toast-warning')) {
    return 'var(--warn-solid)';
  }
  if (className.includes('design-toast-info')) {
    return 'var(--info-solid)';
  }

  return 'var(--border)';
}

export default function ToasterProvider() {
  const [hoveredToastId, setHoveredToastId] = useState<string | null>(null);

  return (
    <Toaster
      position="top-center"
      containerStyle={{ top: 'max(8px, env(safe-area-inset-top))' }}
      toastOptions={{
        duration: 4000,
        className: 'design-toast',
        style: {
          background: 'var(--card)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgb(0 0 0 / 0.1)',
          padding: 0,
          fontSize: '0.875rem',
          fontWeight: 500,
          minWidth: '280px',
          maxWidth: '480px',
        },
        success: {
          className: 'design-toast design-toast-success',
          style: {
            background: 'var(--success-tint)',
            border: '1px solid var(--success-solid)',
            color: 'var(--foreground)',
          },
          iconTheme: {
            primary: 'var(--success-text)',
            secondary: 'var(--success-tint)',
          },
        },
        error: {
          className: 'design-toast design-toast-alert',
          style: {
            background: 'var(--destructive-tint)',
            border: '1px solid var(--destructive)',
            color: 'var(--foreground)',
          },
          iconTheme: {
            primary: 'var(--destructive-foreground)',
            secondary: 'var(--destructive-tint)',
          },
        },
      }}
    >
      {(t) => (
        <ToastBar toast={t}>
          {({ icon, message }) => (
            <div
              className="relative w-full overflow-hidden rounded-[11px]"
              onMouseEnter={() => setHoveredToastId(t.id)}
              onMouseLeave={() =>
                setHoveredToastId((current) => (current === t.id ? null : current))
              }
            >
              <div className="flex w-full items-center px-6 py-4">
                {icon}
                {message}
                {t.type !== 'loading' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.dismiss(t.id);
                    }}
                    className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
                    aria-label="Dismiss notification"
                  >
                    ×
                  </button>
                )}
              </div>

              {typeof t.duration === 'number' && Number.isFinite(t.duration) && t.type !== 'loading' && (
                <span
                  className="toast-progress-bar"
                  style={{
                    backgroundColor: getToastProgressColor(t),
                    animationDuration: `${t.duration}ms`,
                    animationPlayState: hoveredToastId === t.id ? 'paused' : 'running',
                  }}
                  aria-hidden="true"
                />
              )}
            </div>
          )}
        </ToastBar>
      )}
    </Toaster>
  );
}
