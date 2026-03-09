interface CardLayoutProps {
  children: any
  className?: string
}

export default function CardLayout({ children, className = '' }: CardLayoutProps) {
  return (
    <div 
      className={`bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 ${className}`.trim()}
    >
      {children}
    </div>
  )
}
