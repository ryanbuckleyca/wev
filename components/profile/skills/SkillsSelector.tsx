'use client'

import { useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')

  const isLibraryMode = allItems.length > 0

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (!isLibraryMode) onSearch(value)
  }

  const handleClearQuery = () => {
    setQuery(''); onSearch('')
  }

  const handleMobileClose = () => {
    setQuery(''); onSearch(''); setMobileOpen(false)
  }

  const sortableItems = selectedSkills.map((skill) => ({
    id: skill.uri,
    label: skill.preferredLabel[locale],
    sublabel: skill.description?.[locale] || undefined,
  }))

  const selectedSection = sortableItems.length > 0 && (
    <SortableSelectedList
      variant="skills"
      items={sortableItems}
      rankCutoff={skillCutoff}
      onReorder={onReorder}
      onRemove={onRemove}
    />
  )

  return (
    <div className="flex flex-col gap-3">
      <button
        ref={browseTriggerRef}
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={mobileOpen}
        aria-label={t('skillsModalTriggerLabel')}
        className="flex w-full items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-left transition-all hover:border-gray-200 dark:bg-zinc-900/50 dark:border-zinc-800 dark:hover:border-zinc-700"
      >
        <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        <span className="min-w-0 flex-1 text-[13px] font-medium text-gray-400" aria-hidden>
          {t('skillsPlaceholder')}
        </span>
      </button>
      {selectedSection}
      <SkillsModal
        isOpen={mobileOpen}
        onClose={handleMobileClose}
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

