import toast from 'react-hot-toast';

interface ToastOptions {
  duration?: number;
}

const notify = {
  success: (message: string, options?: ToastOptions) => toast.success(message, options),
  error: (message: string, options?: ToastOptions) => toast.error(message, options),
  warning: (message: string, options?: ToastOptions) =>
    toast(message, { ...options, icon: '⚠️' }),
  info: (message: string, options?: ToastOptions) => toast(message, { ...options, icon: 'ℹ️' }),
};

export default notify;
