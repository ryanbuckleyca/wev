import toast from 'react-hot-toast';
import BannerMessage from '@/components/BannerMessage';

interface ToastOptions {
  duration?: number;
}

const notify = {
  success: (message: string, options?: ToastOptions) => {
    return toast.custom(
      (t) => (
        <div
          style={{
            opacity: t.visible ? 1 : 0,
            transform: `translateY(${t.visible ? 0 : -20}px)`,
            transition: 'all 0.2s',
            cursor: 'pointer',
          }}
          onClick={() => toast.dismiss(t.id)}
        >
          <BannerMessage type="success" message={message} />
        </div>
      ),
      {
        duration: options?.duration || 4000,
      },
    );
  },

  error: (message: string, options?: ToastOptions) => {
    return toast.custom(
      (t) => (
        <div
          style={{
            opacity: t.visible ? 1 : 0,
            transform: `translateY(${t.visible ? 0 : -20}px)`,
            transition: 'all 0.2s',
            cursor: 'pointer',
          }}
          onClick={() => toast.dismiss(t.id)}
        >
          <BannerMessage type="error" message={message} />
        </div>
      ),
      {
        duration: options?.duration || 4000,
      },
    );
  },

  warning: (message: string, options?: ToastOptions) => {
    return toast.custom(
      (t) => (
        <div
          style={{
            opacity: t.visible ? 1 : 0,
            transform: `translateY(${t.visible ? 0 : -20}px)`,
            transition: 'all 0.2s',
            cursor: 'pointer',
          }}
          onClick={() => toast.dismiss(t.id)}
        >
          <BannerMessage type="warning" message={message} />
        </div>
      ),
      {
        duration: options?.duration || 4000,
      },
    );
  },

  info: (message: string, options?: ToastOptions) => {
    return toast.custom(
      (t) => (
        <div
          style={{
            opacity: t.visible ? 1 : 0,
            transform: `translateY(${t.visible ? 0 : -20}px)`,
            transition: 'all 0.2s',
            cursor: 'pointer',
          }}
          onClick={() => toast.dismiss(t.id)}
        >
          <BannerMessage type="info" message={message} />
        </div>
      ),
      {
        duration: options?.duration || 4000,
      },
    );
  },
};

export default notify;
