interface MessageProps {
  children: any
  variant?: 'success' | 'error' | 'info'
  className?: string
}

export default function Message({ children, variant = 'info', className = '' }: MessageProps) {
  const baseClasses = 'mt-4 text-sm text-center'
  
  const variantClasses = {
    success: 'text-[var(--success-text)]',
    error: 'text-[var(--destructive-foreground)]',
    info: 'text-[var(--muted-foreground)]'
  }
  
  const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${className}`.trim()

  return <p className={combinedClasses}>{children}</p>
}
