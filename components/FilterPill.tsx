interface FilterPillProps {
  label: string
  onRemove?: () => void
  className?: string
}

export default function FilterPill({ label, onRemove, className = '' }: FilterPillProps) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-wev-border bg-wev-accent-tint px-2.5 py-1 text-xs font-medium text-wev-accent ${className}`}>
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-wev-text-tertiary hover:text-wev-accent leading-none"
          aria-label={`Remove ${label} filter`}
        >
          ×
        </button>
      )}
    </span>
  )
}
