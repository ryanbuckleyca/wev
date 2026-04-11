import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonLinkTone = 'accent' | 'muted' | 'primary';
type ButtonLinkSize = 'xs' | 'sm' | 'md';

interface ButtonLinkProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  tone?: ButtonLinkTone;
  size?: ButtonLinkSize;
}

export default function ButtonLink({
  children,
  tone = 'accent',
  size = 'sm',
  className = '',
  type = 'button',
  ...props
}: ButtonLinkProps) {
  const baseClasses =
    'inline-flex items-center rounded transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';

  const toneClasses: Record<ButtonLinkTone, string> = {
    accent: 'text-wev-brand-accent hover:text-wev-primary-text hover:underline',
    muted: 'text-muted-foreground hover:text-wev-brand-accent hover:underline',
    primary: 'text-[var(--primary)] hover:underline',
  };

  const sizeClasses: Record<ButtonLinkSize, string> = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
  };

  const combinedClasses =
    `${baseClasses} ${toneClasses[tone]} ${sizeClasses[size]} ${className}`.trim();

  return (
    <button type={type} className={combinedClasses} {...props}>
      {children}
    </button>
  );
}
