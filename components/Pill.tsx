interface PillProps {
  children: any
  variant?: 'default' | 'primary' | 'secondary' | 'matched' | 'unmatched'
  size?: 'sm' | 'md'
  className?: string
}

export default function Pill({ children, variant = 'default', size = 'md', className = '' }: PillProps) {
  const baseClasses = 'inline-block font-medium rounded-full transition-colors'
  
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm'
  }
  
  const variantClasses = {
    default: 'bg-[var(--primary-tint)] text-[var(--primary-text)]',
    primary: 'bg-[var(--primary)] text-white',
    secondary: 'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)]',
    matched: 'bg-[var(--primary)] text-white',  // Same teal as donut active part
    unmatched: 'bg-[var(--primary-tint)] text-[var(--primary-text)]'  // Lighter teal for unmatched values
  }
  
  const combinedClasses = `${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`.trim()

  return <span className={combinedClasses}>{children}</span>
}
