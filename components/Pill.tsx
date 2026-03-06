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
}

export default function Pill({ 
  children, 
  variant = 'default', 
  size = 'md', 
  className = '', 
  onRemove,
  removable = false,
  title,
}: PillProps) {
  const t = useTranslations('ariaLabels.pill')
  
  const baseClasses = 'inline-flex items-center font-medium rounded-full transition-colors'
  
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm'
  }
  
  const variantClasses = {
    primary: 'bg-[var(--primary)] text-white',  // Dark teal
    secondary: 'bg-[var(--primary-tint)] text-[var(--primary-text)]',  // Light teal
    default: 'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)]'  // Tertiary (light gray with border)
  }

  // If the pill is removable, prefer the lavender accent styling used by the legacy FilterPill
  const removableClasses = 'border border-wev-border bg-wev-accent-tint text-wev-accent'

  const combinedClasses = `${baseClasses} ${sizeClasses[size]} ${removable ? removableClasses : variantClasses[variant]} ${className}`.trim()

  const pillContent = (
    <span className={combinedClasses} data-tooltip={title}>
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
