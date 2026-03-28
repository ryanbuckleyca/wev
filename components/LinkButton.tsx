import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface LinkButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
  prefetch?: boolean;
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
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: variantMap[variant], size: sizeMap[size] }),
        fullWidth && 'w-full',
        className,
      )}
      prefetch={prefetch}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
