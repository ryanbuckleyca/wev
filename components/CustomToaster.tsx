'use client';

import { Toaster } from 'react-hot-toast';

export default function CustomToaster() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 4000,
        className: '',
        style: {},
      }}
    >
      {(t) => {
        const isSuccess = t.type === 'success';
        const isError = t.type === 'error';
        const isWarning = t.type === 'custom';
        
        let className = 'design-toast';
        let icon = 'ℹ';
        
        if (isSuccess) {
          className += ' design-toast-success';
          icon = '✓';
        } else if (isError) {
          className += ' design-toast-alert';
          icon = '✕';
        } else if (isWarning) {
          className += ' design-toast-warning';
          icon = '⚠';
        } else {
          className += ' design-toast-info';
          icon = 'ℹ';
        }
        
        return (
          <div className={className}>
            <div className="design-toast-icon">{icon}</div>
            <div>{t.message as React.ReactNode}</div>
          </div>
        );
      }}
    </Toaster>
  );
}
