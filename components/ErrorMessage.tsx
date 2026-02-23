interface ErrorMessageProps {
  children: any
  className?: string
}

export default function ErrorMessage({ children, className = '' }: ErrorMessageProps) {
  return (
    <p className={`text-[var(--alert-text)] text-sm mt-2 ${className}`.trim()}>
      {children}
    </p>
  )
}
