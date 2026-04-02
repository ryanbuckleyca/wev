import toast from 'react-hot-toast';

interface ToastOptions {
  duration?: number;
}

const WARNING_TOAST_STYLE = {
  background: 'var(--warn-tint)',
  border: '1px solid var(--warn-solid)',
  color: 'var(--foreground)',
};

const INFO_TOAST_STYLE = {
  background: 'var(--info-tint)',
  border: '1px solid var(--info-solid)',
  color: 'var(--foreground)',
};

const notify = {
  success: (message: string, options?: ToastOptions) => toast.success(message, options),
  error: (message: string, options?: ToastOptions) => toast.error(message, options),
  warning: (message: string, options?: ToastOptions) =>
    toast(message, {
      ...options,
      icon: '⚠️',
      className: 'design-toast design-toast-warning',
      style: WARNING_TOAST_STYLE,
    }),
  info: (message: string, options?: ToastOptions) =>
    toast(message, {
      ...options,
      icon: 'ℹ️',
      className: 'design-toast design-toast-info',
      style: INFO_TOAST_STYLE,
    }),
};

export default notify;
