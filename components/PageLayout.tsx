interface PageLayoutProps {
  children: any
  variant?: 'centered' | 'sidebar'
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export default function PageLayout({ 
  children, 
  variant = 'sidebar',
  maxWidth = 'lg',
  className = ''
}: PageLayoutProps) {
  const baseClasses = 'min-h-screen bg-[var(--background)]'
  
  const variantClasses = {
    centered: 'flex items-center justify-center px-4 pt-24',
    sidebar: 'pt-24'
  }
  
  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-2xl', 
    lg: 'max-w-4xl',
    xl: 'max-w-6xl'
  }

  const containerClasses = `${widthClasses[maxWidth]} mx-auto px-4 sm:px-6 lg:px-8 py-6`

  if (variant === 'centered') {
    return (
      <div className={`${baseClasses} ${variantClasses[variant]} ${className}`.trim()}>
        <div className="w-full max-w-sm">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`.trim()}>
      <div className={containerClasses}>
        {children}
      </div>
    </div>
  )
}
