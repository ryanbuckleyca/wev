import toast from 'react-hot-toast';
import { TOAST_THEMES, type ToastVariant } from './toast-themes';

interface ToastOptions {
  duration?: number;
}

function makeToast(variant: ToastVariant, message: string, options?: ToastOptions) {
  const theme = TOAST_THEMES[variant];
  const toastOptions = {
    ...options,
    icon: theme.icon,
    className: theme.className,
    style: theme.style,
  };

  switch (variant) {
    case 'success':
      return toast.success(message, toastOptions);
    case 'error':
      return toast.error(message, toastOptions);
    case 'loading':
      return toast.loading(message, toastOptions);
    default:
      return toast(message, toastOptions);
  }
}

const notify = {
  success: (message: string, options?: ToastOptions) => makeToast('success', message, options),
  error: (message: string, options?: ToastOptions) => makeToast('error', message, options),
  warning: (message: string, options?: ToastOptions) => makeToast('warning', message, options),
  info: (message: string, options?: ToastOptions) => makeToast('info', message, options),
  loading: (message: string, options?: ToastOptions) => makeToast('loading', message, options),
};

export default notify;
