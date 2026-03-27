import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import SkillSearchInput from './SkillSearchInput'
import SkillsList from './SkillsList'
import SelectedSkillsPills from './SelectedSkillsPills'
import { useSkillsFiltering } from './useSkillsFiltering'
import type { EscoSkill } from '../SkillsSelector'
import SelectionBrowseModal from '../SelectionBrowseModal'

interface MobileSkillsModalProps {
  isOpen: boolean
  onClose: () => void
  query: string
  onQueryChange: (value: string) => void
  onClearQuery: () => void
  selected: EscoSkill[]
  onRemove: (uri: string) => void
  onToggle: (skill: EscoSkill) => void
  skills: EscoSkill[]
  allItems: EscoSkill[]
  isSearching: boolean
  locale: 'en' | 'fr'
  isLibraryMode: boolean
}

export default function MobileSkillsModal({
  isOpen,
  onClose,
  query,
  onQueryChange,
  onClearQuery,
  selected,
  onRemove,
  onToggle,
  skills,
  allItems,
  isSearching,
  locale,
  isLibraryMode,
}: MobileSkillsModalProps) {
  const t = useTranslations('profile')
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredSkills = useSkillsFiltering(query, allItems, skills, locale, isLibraryMode)
  const selectedUris = new Set(selected.map((s) => s.uri))

  return (
    <SelectionBrowseModal
      isOpen={isOpen}
      onClose={onClose}
      searchInputRef={inputRef}
      backAriaLabel={t('skillsBack')}
      doneLabel={t('skillsDone')}
      selectedCount={selected.length}
      headerCenter={
        <SkillSearchInput
          query={query}
          onQueryChange={onQueryChange}
          isSearching={isSearching}
          inputRef={inputRef}
          onClear={onClearQuery}
          placeholder={t('skillsPlaceholderShort')}
        />
      }
      selectedPills={
        selected.length > 0 ? (
          <div className="px-3 pt-2 shrink-0">
            <SelectedSkillsPills
              skills={selected}
              onRemove={onRemove}
              locale={locale}
              useHorizontalScroll={!!query}
              fadeBackground="var(--card)"
            />
          </div>
        ) : undefined
      }
    >
      <div className="px-2">
        <SkillsList
          skills={filteredSkills}
          selectedUris={selectedUris}
          onToggle={onToggle}
          locale={locale}
          isSearching={isSearching}
          hasQuery={!!query}
        />
      </div>
    </SelectionBrowseModal>
  )
}
