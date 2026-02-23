import Link from 'next/link'

interface LinkButtonProps {
  href: string
  children: any
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  className?: string
  prefetch?: boolean
  onClick?: () => void
}

export default function LinkButton({ 
  href, 
  children, 
  variant = 'outline',
  size = 'md',
  fullWidth = false,
  className = '',
  prefetch = true, // Enable prefetch by default for better UX
  onClick
}: LinkButtonProps) {
  const baseClasses = 'inline-block font-medium rounded transition-colors'
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm', 
    lg: 'px-6 py-3 text-base'
  }
  
  const variantClasses = {
    primary: 'bg-[var(--primary)] text-white hover:opacity-90',
    secondary: 'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg)]',
    outline: 'border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)]'
  }
  
  const widthClass = fullWidth ? 'w-full' : ''
  
  const combinedClasses = `${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${widthClass} ${className}`.trim()

  return (
    <Link 
      href={href} 
      className={combinedClasses}
      prefetch={prefetch}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}
