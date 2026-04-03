'use client';

import { useState } from 'react';
import toast, { ToastBar, Toaster, type Toast } from 'react-hot-toast';
import { TOAST_THEMES, type ToastVariant } from '@/lib/toast-themes';

function ToastItem({ t }: { t: Toast }) {
  const [isHovered, setIsHovered] = useState(false);

  // Determine variant from toast type or fallback to class-based lookup
  // (Necessary because warning/info both use the 'blank' toast type)
  const isBlank = (t.type as string) === 'blank';
  const variant = (t.type === 'loading' ? 'loading' : t.type) as ToastVariant;
  const theme = 
    (!isBlank && TOAST_THEMES[variant]) || 
    Object.values(TOAST_THEMES).find((v) => v.className === t.className) || 
    TOAST_THEMES.info;

  return (
    <ToastBar toast={t}>
      {({ icon, message }) => (
        <div
          className="relative w-full overflow-hidden rounded-[12px]"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="flex w-full items-center px-6 py-4">
            {icon || theme.icon}
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
                backgroundColor: theme.progressColor,
                animationDuration: `${t.duration}ms`,
                animationPlayState: isHovered ? 'paused' : 'running',
              }}
              aria-hidden="true"
            />
          )}
        </div>
      )}
    </ToastBar>
  );
}

export default function ToasterProvider() {
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
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgb(0 0 0 / 0.1)',
          padding: 0,
          fontSize: '0.875rem',
          fontWeight: 500,
          minWidth: '280px',
          maxWidth: '480px',
        },
        success: {
          style: TOAST_THEMES.success.style,
        },
        error: {
          style: TOAST_THEMES.error.style,
        },
      }}
    >
      {(t) => <ToastItem t={t} />}
    </Toaster>
  );
}
