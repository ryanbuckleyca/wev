import { Button as ShadcnButton } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ButtonProps {
  children: any
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  className?: string
  style?: React.CSSProperties
}

const variantMap = {
  primary: 'default',
  secondary: 'secondary',
  outline: 'outline',
} as const

const sizeMap = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
} as const

export default function Button({
  children,
  onClick,
  type = 'button',
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  style,
}: ButtonProps) {
  return (
    <ShadcnButton
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      variant={variantMap[variant]}
      size={sizeMap[size]}
      className={cn(fullWidth && 'w-full', className)}
      style={style}
    >
      {children}
    </ShadcnButton>
  )
}
