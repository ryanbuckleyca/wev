interface CardLayoutProps {
  children: any
  className?: string
}

export default function CardLayout({ children, className = '' }: CardLayoutProps) {
  return (
    <div 
      className={`bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 ${className}`.trim()}
    >
      {children}
    </div>
  )
}
