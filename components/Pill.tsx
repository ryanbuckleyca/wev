'use client'

import type { MouseEvent, Ref } from 'react'
import { cn } from '@/lib/utils'

interface PillProps {
  children: React.ReactNode
  variant?: 'default' | 'primary' | 'secondary' | 'disabled'
  size?: 'sm' | 'md'
  className?: string
  onRemove?: () => void
  removable?: boolean
  removeAriaLabel?: string
  /** Override remove button tabIndex (e.g. roving focus in a composite region). */
  removeTabIndex?: number
  removeRef?: Ref<HTMLButtonElement | null>
  title?: string
}

export default function Pill({
  children,
  variant = 'default',
  size = 'md',
  className = '',
  onRemove,
  removable = false,
  removeAriaLabel,
  removeTabIndex,
  removeRef,
  title,
}: PillProps) {
  const handleRemove = (e: MouseEvent) => {
    e.stopPropagation()
    onRemove?.()
  }

  const isRemovable = removable || !!onRemove

  const variantClasses = {
    primary: 'bg-[var(--primary)] text-white',
    secondary: 'bg-[var(--primary-tint)] text-[var(--primary-text)]',
    default: 'bg-card text-foreground border border-border',
    disabled: 'bg-card text-wev-text-tertiary border border-border opacity-60',
  }

  const removableClasses = 'border border-border bg-wev-brand-accent-tint text-wev-brand-accent'

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full transition-colors',
        size === 'sm'
          ? isRemovable
            ? 'pl-3 pr-1 py-0.5 text-xs'
            : 'px-2 py-0.5 text-xs'
          : isRemovable
            ? 'pl-3 pr-1 py-1 text-sm'
            : 'px-3 py-1 text-sm',
        removable ? removableClasses : variantClasses[variant],
        className,
      )}
      title={title}
    >
      {children}
      {isRemovable && (
        <button
          ref={removeRef}
          type="button"
          onClick={handleRemove}
          tabIndex={removeTabIndex}
          className={cn(
            'rounded px-1.5 transition-colors',
            removable
              ? 'text-wev-text-tertiary hover:text-wev-brand-accent hover:bg-wev-brand-accent/10'
              : 'text-[var(--text-tertiary)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/5',
          )}
          aria-label={removeAriaLabel}
        >
          ×
        </button>
      )}
    </span>
  )
}
