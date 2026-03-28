'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import BrowseTrigger from '../BrowseTrigger'
import SkillsModal from './SkillsModal'
import SortableSelectedList from '../SortableSelectedList'

export interface EscoSkill {
  uri: string
  preferredLabel: { en: string; fr: string }
  description?: { en: string | null; fr: string | null }
  skillType: 'skill' | 'knowledge' | null
  reuseLevel: 'transversal' | 'cross-sector' | 'sector-specific' | 'occupation-specific' | null
  matchedAlias?: string | null
  aliases?: string[]
}

interface SkillsSelectorProps {
  skills: EscoSkill[]
  allItems?: EscoSkill[]
  selectedSkills: EscoSkill[]
  skillCutoff: number
  onToggle: (skill: EscoSkill) => void
  onReorder: (from: number, to: number) => void
  onRemove: (uri: string) => void
  onSearch: (query: string) => void
  locale: 'en' | 'fr'
  isSearching?: boolean
}

export default function SkillsSelector({
  skills, allItems = [],
  selectedSkills, skillCutoff,
  onToggle, onReorder, onRemove,
  onSearch, locale, isSearching = false,
}: SkillsSelectorProps) {
  const t = useTranslations('profile')
  const browseTriggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const isLibraryMode = allItems.length > 0

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (!isLibraryMode) onSearch(value)
  }

  const handleClearQuery = () => {
    setQuery(''); onSearch('')
  }

  const handleClose = () => {
    setQuery(''); onSearch(''); setOpen(false)
  }

  const sortableItems = selectedSkills.map((skill) => ({
    id: skill.uri,
    label: skill.preferredLabel[locale],
    sublabel: skill.description?.[locale] || undefined,
  }))

  return (
    <div className="flex flex-col gap-3">
      <BrowseTrigger
        ref={browseTriggerRef}
        onClick={() => setOpen(true)}
        isOpen={open}
        ariaLabel={t('skillsModalTriggerLabel')}
        placeholder={t('skillsPlaceholder')}
      />
      {sortableItems.length > 0 && (
        <SortableSelectedList
          variant="skills"
          items={sortableItems}
          rankCutoff={skillCutoff}
          onReorder={onReorder}
          onRemove={onRemove}
        />
      )}
      <SkillsModal
        isOpen={open}
        onClose={handleClose}
        returnFocusRef={browseTriggerRef}
        query={query}
        onQueryChange={handleQueryChange}
        onClearQuery={handleClearQuery}
        selected={selectedSkills}
        onRemove={onRemove}
        onToggle={onToggle}
        skills={skills} allItems={allItems} isSearching={isSearching}
        locale={locale} isLibraryMode={isLibraryMode}
      />
    </div>
  )
}
