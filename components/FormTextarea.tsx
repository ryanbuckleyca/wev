import FormLabel from '@/components/FormLabel'
import ErrorMessage from '@/components/ErrorMessage'
import { cn } from '@/lib/utils'

interface FormTextareaProps {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  fullWidth?: boolean
  htmlFor?: string
  rows?: number
  charLimit?: number
  showCount?: boolean
  countLabel?: (current: number, max: number) => string
  error?: string
  className?: string
}

export default function FormTextarea({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  fullWidth = true,
  htmlFor,
  rows = 4,
  charLimit,
  showCount = true,
  countLabel,
  error,
  className = '',
}: FormTextareaProps) {
  const count = value.length
  const isOverLimit = typeof charLimit === 'number' && count > charLimit
  const showCounter = typeof charLimit === 'number' && showCount
  const countText = showCounter
    ? countLabel?.(count, charLimit) ?? `${count}/${charLimit} characters`
    : null

  return (
    <div className="space-y-0">
      {label && (
        <FormLabel htmlFor={htmlFor} required={required}>
          {label}
        </FormLabel>
      )}
      <textarea
        id={htmlFor}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        required={required}
        disabled={disabled}
        aria-invalid={isOverLimit}
        className={cn(
          'px-4 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors',
          fullWidth ? 'w-full' : 'w-auto',
          className
        )}
      />
      {showCounter && (
        <p className={cn('text-xs', isOverLimit ? 'text-destructive-foreground' : 'text-muted-foreground')}>
          {countText}
        </p>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  )
}
