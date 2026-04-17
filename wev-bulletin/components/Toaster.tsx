'use client';

import { useState } from 'react';
import toast, { ToastBar, Toaster, type Toast } from 'react-hot-toast';
import { TOAST_THEMES, type ToastVariant } from '@/lib/toast-themes';

function ToastItem({ t: toastData }: { t: Toast }) {
  const [isHovered, setIsHovered] = useState(false);

  // Extract variant from ID prefix or library type
  const idPrefix = toastData.id.split(':')[0] as ToastVariant;
  const libType = toastData.type as ToastVariant;

  const theme =
    TOAST_THEMES[idPrefix] ||
    ((libType as string) !== 'blank' && TOAST_THEMES[libType]) ||
    TOAST_THEMES.info;

  return (
    <ToastBar toast={toastData}>
      {({ icon, message }) => (
        <div
          className={`${theme.className} relative w-full overflow-hidden !m-0 !p-0`}
          style={theme.style}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="flex w-full items-center px-6 py-4">
            {icon || theme.icon}
            {message}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toast.dismiss(toastData.id);
              }}
              className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>

          {typeof toastData.duration === 'number' && Number.isFinite(toastData.duration) && (
            <span
              className="toast-progress-bar"
              style={{
                backgroundColor: theme.progressColor,
                animationDuration: `${toastData.duration}ms`,
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
      containerStyle={{
        top: 'max(8px, env(safe-area-inset-top))',
        pointerEvents: 'none',
      }}
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
          pointerEvents: 'auto',
        },
        success: {
          style: {
            ...TOAST_THEMES.success.style,
            pointerEvents: 'auto',
          },
        },
        error: {
          style: {
            ...TOAST_THEMES.error.style,
            pointerEvents: 'auto',
          },
        },
      }}
    >
      {(t) => <ToastItem t={t} />}
    </Toaster>
  );
}
