import { useTranslations } from 'next-intl'
import HorizontalScrollWithFades from '@/components/ui/HorizontalScrollWithFades'
import Pill from '@/components/Pill'
import type { WorkValue } from '@/lib/values'

interface SelectedValuesPillsProps {
  values: WorkValue[]
  selectedIds: string[]
  onRemove: (id: string) => void
  locale: 'en' | 'fr'
  useHorizontalScroll?: boolean
  fadeBackground?: string
}

export default function SelectedValuesPills({
  values,
  selectedIds,
  onRemove,
  locale,
  useHorizontalScroll = false,
  fadeBackground = 'var(--card)',
}: SelectedValuesPillsProps) {
  const t = useTranslations('ariaLabels.pill')
  const selectedValues = selectedIds.map(id => values.find(v => v.id === id)).filter(Boolean) as WorkValue[]
  
  if (selectedValues.length === 0) return null

  const pillElements = selectedValues.map((v) => (
    <Pill
      key={v.id}
      size="sm"
      onRemove={() => onRemove(v.id)}
      removeAriaLabel={t('remove', { label: v.label[locale] })}
      className="md:py-1 shrink-0"
    >
      {v.label[locale]}
    </Pill>
  ))

  if (useHorizontalScroll) {
    return (
      <HorizontalScrollWithFades 
        containerClassName="shrink-0 border-b border-gray-100 dark:border-zinc-800"
        className="pb-2 items-center"
        fadeBackground={fadeBackground}
      >
        {pillElements}
      </HorizontalScrollWithFades>
    )
  }

  return (
    <div className="flex flex-wrap gap-2 pb-3 pt-1">
      {pillElements}
    </div>
  )
}
