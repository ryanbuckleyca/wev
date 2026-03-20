import * as React from 'react'
import StatusIcon from '@/components/StatusIcon'

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'warning' | 'info' | 'error' | 'success'
}

export default function Alert({
  className = '',
  variant = 'info',
  children,
  ...props
}: AlertProps) {
  // Use the same CSS classes as BannerMessage/ToastMessage from style guide
  const getBaseClasses = () => {
    const base = 'design-toast'
    const typeClasses = {
      success: 'design-toast-success',
      error: 'design-toast-alert',
      warning: 'design-toast-warning',
      info: 'design-toast-info'
    }
    return `${base} ${typeClasses[variant]} ${className}`.trim()
  }

  const getIconColor = () => {
    const colors = {
      success: 'text-[var(--success-text)]',
      error: 'text-[var(--destructive-foreground)]',
      warning: 'text-[var(--warn-text)]',
      info: 'text-[var(--info-text)]'
    }
    return colors[variant]
  }

  return (
    <div className={getBaseClasses()} {...props}>
      <span className={`font-bold ${getIconColor()}`}>
        <StatusIcon type={variant} />
      </span>
      <span>{children}</span>
    </div>
  )
}
