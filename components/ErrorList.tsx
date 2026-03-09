interface ErrorListProps {
  errors: string[]
  className?: string
}

export default function ErrorList({ errors, className = '' }: ErrorListProps) {
  if (errors.length === 0) return null

  return (
    <div className={`mb-4 p-3 rounded bg-[var(--destructive-tint)] text-[var(--destructive-foreground)] text-sm ${className}`.trim()}>
      <ul className="list-disc list-inside">
        {errors.map((error, i) => (
          <li key={i}>{error}</li>
        ))}
      </ul>
    </div>
  )
}
