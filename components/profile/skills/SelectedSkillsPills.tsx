import SortableSelectedList from '../SortableSelectedList'
import type { EscoSkill } from '../SkillsSelector'

interface SelectedSkillsPillsProps {
  skills: EscoSkill[]
  skillCutoff: number
  onReorder: (from: number, to: number) => void
  onRemove: (uri: string) => void
  locale: 'en' | 'fr'
}

export default function SelectedSkillsPills({
  skills, skillCutoff, onReorder, onRemove, locale,
}: SelectedSkillsPillsProps) {
  if (skills.length === 0) return null

  const items = skills.map(s => ({
    id: s.uri,
    label: s.preferredLabel[locale],
    sublabel: s.description?.[locale] ?? undefined,
  }))

  return (
    <SortableSelectedList
      items={items}
      rankCutoff={skillCutoff}
      onReorder={onReorder}
      onRemove={onRemove}
    />
  )
}
