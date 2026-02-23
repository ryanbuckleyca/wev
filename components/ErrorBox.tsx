interface ErrorBoxProps {
  children: any
  className?: string
}

export default function ErrorBox({ children, className = '' }: ErrorBoxProps) {
  return (
    <div className={`mb-6 p-3 rounded bg-[var(--alert-tint)] text-[var(--alert-text)] text-sm ${className}`.trim()}>
      {children}
    </div>
  )
}
