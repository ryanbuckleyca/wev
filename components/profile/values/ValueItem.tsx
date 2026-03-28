import { Checkbox } from '@/components/ui/Checkbox'
import type { WorkValue } from '@/lib/values'

interface ValueItemProps {
  id: string
  value: WorkValue
  isActive: boolean
  isSelected: boolean
  onToggle: () => void
  locale: 'en' | 'fr'
}

export default function ValueItem({
  id,
  value,
  isActive,
  isSelected,
  onToggle,
  locale,
}: ValueItemProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={isSelected}
      onClick={onToggle}
      className={`flex cursor-pointer items-start gap-4 pl-8 pr-4 py-3.5 transition-colors ${
        isActive
          ? 'group-focus-within:bg-blue-50/60 dark:group-focus-within:bg-blue-900/20 hover:group-focus-within:bg-blue-100/50 dark:hover:group-focus-within:bg-blue-900/30'
          : 'hover:bg-gray-50/80 dark:hover:bg-zinc-800/50'
      }`}
    >
      <Checkbox checked={isSelected} readOnly tabIndex={-1} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-gray-800 dark:text-zinc-100">{value.label[locale]}</p>
        <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-gray-500 dark:text-zinc-400 line-clamp-2">
          {value.summary[locale]}
        </p>
      </div>
    </div>
  )
}
