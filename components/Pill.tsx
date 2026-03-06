'use client'

import { useTranslations } from 'next-intl'
import Tooltip from './Tooltip'

export interface PillProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'default'
  size?: 'sm' | 'md'
  className?: string
  onRemove?: () => void
  removable?: boolean
  title?: string
  icon?: React.ReactNode
}

export default function Pill({ 
  children, 
  variant = 'default', 
  size = 'md', 
  className = '', 
  onRemove,
  removable = false,
  title,
  icon,
}: PillProps) {
  const t = useTranslations('ariaLabels.pill')
  
  const baseClasses = 'inline-flex items-center font-medium rounded-full transition-colors'
  
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm'
  }
  
  const variantClasses = {
    primary: 'bg-white dark:bg-wev-surface text-wev-text-primary dark:text-wev-text-primary border-solid border-[1px] border-wev-border',  // Active: same as job cards
    secondary: 'bg-wev-surface text-wev-text-tertiary border-solid border-[1px] border-wev-border',  // Inactive: same as job cards
    default: 'bg-wev-surface text-wev-text-primary border-solid border-[1px] border-wev-border'  // Default: same as job cards
  }

  // If the pill is removable, use neutral styling for better visual flow
  const removableClasses = 'border-solid border-[1px] border-wev-border bg-wev-surface text-wev-text-secondary'

  const combinedClasses = `${baseClasses} ${sizeClasses[size]} ${removable ? removableClasses : variantClasses[variant]} ${className}`.trim()

  const pillContent = (
    <span className={combinedClasses} data-tooltip={title}>
      {icon && <span className="mr-1">{icon}</span>}
      {children}
      {(removable || onRemove) && (
        <button
          type="button"
          onClick={onRemove}
          className={removable ? 'text-wev-text-tertiary hover:text-wev-accent leading-none ml-1' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] leading-none ml-1'}
          aria-label={t('remove', { label: String(children) })}
        >
          ×
        </button>
      )}
    </span>
  )

  return title ? <Tooltip content={title}>{pillContent}</Tooltip> : pillContent
}
