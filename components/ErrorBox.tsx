interface ErrorBoxProps {
  children: React.ReactNode
  className?: string
}

export default function ErrorBox({ children, className = '' }: ErrorBoxProps) {
  return (
    <div className={`mb-6 p-3 rounded bg-[var(--destructive-tint)] text-[var(--destructive-foreground)] text-sm ${className}`.trim()}>
      {children}
    </div>
  )
}
