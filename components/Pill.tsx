interface PillProps {
  children: any
  variant?: 'default' | 'primary' | 'secondary'
  size?: 'sm' | 'md'
  className?: string
  onRemove?: () => void
  removable?: boolean
}

export default function Pill({ 
  children, 
  variant = 'default', 
  size = 'md', 
  className = '', 
  onRemove,
  removable = false 
}: PillProps) {
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
  
  const combinedClasses = `${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`.trim()

  return (
    <span className={combinedClasses}>
      {children}
      {(removable || onRemove) && (
        <button
          type="button"
          onClick={onRemove}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] leading-none ml-1"
          aria-label={`Remove ${children}`}
        >
          ×
        </button>
      )}
    </span>
  )
}
