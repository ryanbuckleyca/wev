'use client'

import { useTranslations } from 'next-intl'

interface PillProps {
  children: any
  variant?: 'default' | 'primary' | 'secondary' | 'disabled'
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
  title
}: PillProps) {
  const t = useTranslations('ariaLabels.pill')
  
  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRemove?.()
  }
  
  const baseClasses = 'inline-flex items-center font-medium rounded-full transition-colors'
  
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm'
  }
  
  const variantClasses = {
    primary: 'bg-[var(--primary)] text-white',  // Dark teal
    secondary: 'bg-[var(--primary-tint)] text-[var(--primary-text)]',  // Light teal
    default: 'bg-card text-foreground border border-border',  // Tertiary (light gray with border)
    disabled: 'bg-card text-wev-text-tertiary border border-border opacity-60'  // Disabled state
  }

  // If the pill is removable, prefer the lavender accent styling used by the legacy FilterPill
  const removableClasses = 'border border-border bg-wev-brand-accent-tint text-wev-brand-accent'

  const combinedClasses = `${baseClasses} ${sizeClasses[size]} ${removable ? removableClasses : variantClasses[variant]} ${className}`.trim()

  return (
    <span 
      className={combinedClasses}
      title={title}
    >
      {children}
      {(removable || onRemove) && (
        <button
          type="button"
          onClick={handleRemove}
          className={removable ? 'text-wev-text-tertiary hover:text-wev-brand-accent leading-none ml-1' : 'text-[var(--text-tertiary)] hover:text-[var(--foreground)] leading-none ml-1'}
          aria-label={t('remove', { label: String(children) })}
        >
          ×
        </button>
      )}
    </span>
  )
}
