import toast from 'react-hot-toast';
import BannerMessage from '@/components/BannerMessage';

interface ToastOptions {
  duration?: number;
}

const DEFAULT_DURATION = 5000;

function makeToast(
  type: 'success' | 'error' | 'warning' | 'info',
  message: string,
  options?: ToastOptions,
) {
  const duration = options?.duration ?? DEFAULT_DURATION;
  const id = `${type}-${Date.now()}`;

  toast.custom(
    () => (
      <BannerMessage
        type={type}
        message={message}
        duration={duration}
        onDismiss={() => toast.remove(id)}
        onExpire={() => toast.remove(id)}
      />
    ),
    // We own the timer — tell react-hot-toast to never auto-dismiss
    { duration: Infinity, id },
  );

  return id;
}

const notify = {
  success: (message: string, options?: ToastOptions) => makeToast('success', message, options),
  error:   (message: string, options?: ToastOptions) => makeToast('error',   message, options),
  warning: (message: string, options?: ToastOptions) => makeToast('warning', message, options),
  info:    (message: string, options?: ToastOptions) => makeToast('info',    message, options),
};

export default notify;
