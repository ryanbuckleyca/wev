import { useState, useRef, useCallback } from 'react'
import { Command } from 'cmdk'
import { Search, X } from 'lucide-react'
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
  selected: EscoSkill[]
  onSelect: (skill: EscoSkill) => void
  onRemove: (uri: string) => void
  onSearch: (query: string) => void
  locale: 'en' | 'fr'
  isSearching?: boolean
  allItems?: EscoSkill[]
}

export default function SkillsSelector({
  skills,
  selected,
  onSelect,
  onRemove,
  onSearch,
  locale,
  isSearching = false,
  allItems = [],
}: SkillsSelectorProps) {
  const t = useTranslations('profile')
  const isTouch = useTouchDevice()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const desktopInputRef = useRef<HTMLInputElement>(null)
  
  const isLibraryMode = allItems && allItems.length > 0
  const selectedUris = new Set(selected.map((s) => s.uri))
  const filteredSkills = useSkillsFiltering(query, allItems, skills, locale, isLibraryMode)

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      if (!isLibraryMode) {
        onSearch(value)
      }
    },
    [onSearch, isLibraryMode]
  )

  const handleClearQuery = useCallback(() => {
    setQuery('')
    onSearch('')
    desktopInputRef.current?.focus()
  }, [onSearch])

  const handleToggle = useCallback((skill: EscoSkill) => {
    if (selectedUris.has(skill.uri)) {
      onRemove(skill.uri)
    } else {
      onSelect(skill)
    }
  }, [selectedUris, onSelect, onRemove])

  const handleMobileClose = useCallback(() => {
    setQuery('')
    onSearch('')
    setMobileOpen(false)
  }, [onSearch])

  return (
    <Command shouldFilter={false} className="bg-transparent h-auto overflow-visible">
      {!isTouch ? (
        // Desktop View
        <div className="flex flex-col gap-3">
          <SkillSearchInput
            query={query}
            onQueryChange={handleQueryChange}
            isSearching={isSearching}
            inputRef={desktopInputRef}
            onClear={handleClearQuery}
          />

          {selected.length > 0 && (
            <SelectedSkillsPills
              skills={selected}
              onRemove={onRemove}
              locale={locale}
              useHorizontalScroll={!!query}
            />
          )}

          <div className="-mx-2 px-2">
            <SkillsList
              skills={filteredSkills}
              selectedUris={selectedUris}
              onToggle={handleToggle}
              locale={locale}
              isSearching={isSearching}
              hasQuery={!!query}
            />
          </div>
        </div>
      ) : (
        // Mobile View
        <div>
          {/* Mobile Trigger */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-left transition-all hover:border-gray-200 dark:bg-zinc-900/50 dark:border-zinc-800 dark:hover:border-zinc-700 mb-3"
          >
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="min-w-0 flex-1 text-[13px] font-medium text-gray-400">
              {t('skillsPlaceholder')}
            </span>
          </button>

          {/* Selected Skills (Mobile) */}
          {selected.length > 0 && (
            <div className="space-y-2">
              {selected.map((skill) => (
                <div key={skill.uri} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-900 dark:text-zinc-100">
                      {skill.preferredLabel[locale]}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(skill.uri)}
                    className="mt-0.5 text-gray-400 hover:bg-gray-100 rounded-full p-1 dark:hover:bg-zinc-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Mobile Modal */}
          <MobileSkillsModal
            isOpen={mobileOpen}
            onClose={handleMobileClose}
            query={query}
            onQueryChange={handleQueryChange}
            onClearQuery={handleClearQuery}
            selected={selected}
            onRemove={onRemove}
            onToggle={handleToggle}
            skills={skills}
            allItems={allItems}
            isSearching={isSearching}
            locale={locale}
            isLibraryMode={isLibraryMode}
          />
        </div>
      )}
    </Command>
  )
}
