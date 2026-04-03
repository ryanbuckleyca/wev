import { type CSSProperties } from 'react';
import { type Renderable } from 'react-hot-toast';
import StatusIcon from '@/components/StatusIcon';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastTheme {
  variant: ToastVariant;
  icon: Renderable;
  className: string;
  style: CSSProperties;
  progressColor: string;
}

/**
 * Helper to create a unified toast theme from a semantic color base.
 * Ensures consistent border-width, background patterns, and color mappings.
 */
const createTheme = (
  variant: ToastVariant,
  colorBase: string,
  iconType: 'success' | 'error' | 'warning' | 'info',
  classSuffix: string,
): ToastTheme => {
  const solidVar = `var(--${colorBase}-solid)`;
  const tintVar = `var(--${colorBase}-tint)`;

  return {
    variant,
    icon: <StatusIcon type={iconType} className={`text-[${solidVar}]`} />,
    className: `design-toast design-toast-${classSuffix}`,
    style: {
      background: tintVar,
      border: `0.5px solid ${solidVar}`,
      color: solidVar,
    },
    progressColor: solidVar,
  };
};

export const TOAST_THEMES: Record<ToastVariant, ToastTheme> = {
  success: createTheme('success', 'success', 'success', 'success'),
  error: createTheme('error', 'destructive', 'error', 'alert'),
  warning: createTheme('warning', 'warn', 'warning', 'warning'),
  info: createTheme('info', 'info', 'info', 'info'),
};
