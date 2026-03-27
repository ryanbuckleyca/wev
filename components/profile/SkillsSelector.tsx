'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTouchDevice } from '@/hooks/useTouchDevice'
import SkillSearchInput from './skills/SkillSearchInput'
import SelectedSkillsPills from './skills/SelectedSkillsPills'
import SkillsList from './skills/SkillsList'
import MobileSkillsModal from './skills/MobileSkillsModal'
import { useSkillsFiltering } from './skills/useSkillsFiltering'

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
  const isTouch = useTouchDevice()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')

  const desktopInputRef = useRef<HTMLInputElement>(null)

  const isLibraryMode = allItems.length > 0
  const allSelectedUris = useMemo(() => new Set(selectedSkills.map(s => s.uri)), [selectedSkills])

  const rawFiltered = useSkillsFiltering(query, allItems, skills, locale, isLibraryMode)
  const filteredSkills = useMemo(() => {
    if (query) return rawFiltered
    return []
  }, [rawFiltered, query])

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    if (!isLibraryMode) onSearch(value)
  }, [onSearch, isLibraryMode])

  const handleClearQuery = useCallback(() => {
    setQuery(''); onSearch(''); desktopInputRef.current?.focus()
  }, [onSearch])

  const handleMobileClose = useCallback(() => {
    setQuery(''); onSearch(''); setMobileOpen(false)
  }, [onSearch])


  const selectedSection = (
    <SelectedSkillsPills
      skills={selectedSkills}
      skillCutoff={skillCutoff}
      onReorder={onReorder}
      onRemove={onRemove}
      locale={locale}
    />
  )

  if (isTouch) {
    return (
      <div className="flex flex-col gap-3">
        {selectedSection}
        <button type="button" onClick={() => setMobileOpen(true)}
          className="flex w-full items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-left transition-all hover:border-gray-200 dark:bg-zinc-900/50 dark:border-zinc-800 dark:hover:border-zinc-700"
        >
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="min-w-0 flex-1 text-[13px] font-medium text-gray-400">{t('skillsPlaceholder')}</span>
        </button>
        <MobileSkillsModal
          isOpen={mobileOpen} onClose={handleMobileClose}
          query={query} onQueryChange={handleQueryChange} onClearQuery={handleClearQuery}
          selected={selectedSkills}
          onToggle={(skill) => onToggle(skill)}
          skills={skills} allItems={allItems} isSearching={isSearching}
          locale={locale} isLibraryMode={isLibraryMode}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {selectedSection}
      <SkillSearchInput query={query} onQueryChange={handleQueryChange} isSearching={isSearching} inputRef={desktopInputRef} onClear={handleClearQuery} />

      <div className="rounded-xl border border-gray-100 dark:border-zinc-800 overflow-hidden">
        <SkillsList
          skills={filteredSkills} selectedUris={allSelectedUris}
          onToggle={(skill) => onToggle(skill)}
          locale={locale} isSearching={isSearching} hasQuery={!!query}
        />
      </div>
    </div>
  )
}
