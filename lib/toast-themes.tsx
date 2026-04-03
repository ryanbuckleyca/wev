import { type CSSProperties } from 'react';
import { type Renderable } from 'react-hot-toast';
import StatusIcon from '@/components/StatusIcon';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastTheme {
  variant: ToastVariant;
  icon: Renderable;
  className: string;
  style: CSSProperties;
  progressColor: string;
}

export const TOAST_THEMES: Record<ToastVariant, ToastTheme> = {
  success: {
    variant: 'success',
    icon: <StatusIcon type="success" className="text-[var(--success-solid)]" />,
    className: 'design-toast design-toast-success',
    style: {
      background: 'var(--success-tint)',
      border: '1px solid var(--success-solid)',
      color: 'var(--success-solid)',
    },
    progressColor: 'var(--success-solid)',
  },
  error: {
    variant: 'error',
    icon: <StatusIcon type="error" className="text-[var(--destructive)]" />,
    className: 'design-toast design-toast-alert',
    style: {
      background: 'var(--destructive-tint)',
      border: '1px solid var(--destructive)',
      color: 'var(--destructive)',
    },
    progressColor: 'var(--destructive)',
  },
  warning: {
    variant: 'warning',
    icon: <StatusIcon type="warning" className="text-[var(--warn-solid)]" />,
    className: 'design-toast design-toast-warning',
    style: {
      background: 'var(--warn-tint)',
      border: '1px solid var(--warn-solid)',
      color: 'var(--warn-solid)',
    },
    progressColor: 'var(--warn-solid)',
  },
  info: {
    variant: 'info',
    icon: <StatusIcon type="info" className="text-[var(--info-solid)]" />,
    className: 'design-toast design-toast-info',
    style: {
      background: 'var(--info-tint)',
      border: '1px solid var(--info-solid)',
      color: 'var(--info-solid)',
    },
    progressColor: 'var(--info-solid)',
  },
  loading: {
    variant: 'loading',
    icon: <StatusIcon type="loading" className="text-[var(--info-solid)]" />,
    className: 'design-toast design-toast-info',
    style: {
      background: 'var(--info-tint)',
      border: '1px solid var(--info-solid)',
      color: 'var(--info-solid)',
    },
    progressColor: 'var(--info-solid)',
  },
};
