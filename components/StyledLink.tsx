import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

interface StyledLinkProps {
  href: ComponentProps<typeof Link>['href'];
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'text';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
  prefetch?: ComponentProps<typeof Link>['prefetch'];
  onClick?: () => void;
}

export default function StyledLink({
  href,
  children,
  variant = 'text',
  size = 'md',
  fullWidth = false,
  className = '',
  prefetch = true,
  onClick,
}: StyledLinkProps) {
  const baseClasses = 'font-medium rounded transition-colors';

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  const variantClasses = {
    primary: 'bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50',
    secondary:
      'border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white disabled:opacity-50',
    outline:
      'border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--background)]',
    text: 'text-[var(--primary)] hover:underline visited:text-[var(--brand-accent)]',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  const combinedClasses =
    `${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${widthClass} ${className}`.trim();

  return (
    <Link href={href} className={combinedClasses} prefetch={prefetch} onClick={onClick}>
      {children}
    </Link>
  );
}
