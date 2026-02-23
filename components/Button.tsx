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
}

export default function Button({ 
  children, 
  onClick, 
  type = 'button', 
  disabled = false, 
  loading = false,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = ''
}: ButtonProps) {
  const baseClasses = 'font-medium rounded transition-colors disabled:cursor-not-allowed'
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm', 
    lg: 'px-6 py-3 text-base'
  }
  
  const variantClasses = {
    primary: 'bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50',
    secondary: 'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg)]',
    outline: 'border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)]'
  }
  
  const widthClass = fullWidth ? 'w-full' : ''
  
  const combinedClasses = `${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${widthClass} ${className}`.trim()

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={combinedClasses}
    >
      {loading ? 'Loading...' : children}
    </button>
  )
}
