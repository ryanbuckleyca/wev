'use client';

import toast, { ToastBar, Toaster } from 'react-hot-toast';

export default function ToasterProvider() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 4000,
        className: 'design-toast',
        style: {
          background: 'var(--card)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgb(0 0 0 / 0.1)',
          padding: '1rem 1.5rem',
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
            <>
              {icon}
              {message}
              {t.type !== 'loading' && (
                <button
                  type="button"
                  onClick={() => toast.dismiss(t.id)}
                  className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
                  aria-label="Dismiss notification"
                >
                  ×
                </button>
              )}
            </>
          )}
        </ToastBar>
      )}
    </Toaster>
  );
}
