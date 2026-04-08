import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface LinkButtonProps {
  href: ComponentProps<typeof Link>['href'];
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
  prefetch?: ComponentProps<typeof Link>['prefetch'];
  onClick?: () => void;
}

const variantMap = {
  primary: 'default',
  secondary: 'secondary',
  outline: 'outline',
} as const;

const sizeMap = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
} as const;

export default function LinkButton({
  href,
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  prefetch = true,
  onClick,
}: LinkButtonProps) {
  const classes = cn(
    buttonVariants({ variant: variantMap[variant], size: sizeMap[size] }),
    fullWidth && 'w-full',
    className,
  );

  return (
    <Link href={href} className={classes} prefetch={prefetch} onClick={onClick}>
      {children}
    </Link>
  );
}
