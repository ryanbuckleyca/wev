import { useRef, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import SkillSearchInput from './SkillSearchInput'
import SkillsList from './SkillsList'
import SelectedSkillsPills from './SelectedSkillsPills'
import { useSkillsFiltering } from './useSkillsFiltering'
import type { EscoSkill } from '../SkillsSelector'
import SelectionBrowseModal from '../SelectionBrowseModal'

const SKILLS_LISTBOX_ID = 'profile-skills-listbox'

interface MobileSkillsModalProps {
  isOpen: boolean
  onClose: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
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
  returnFocusRef,
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
  const listboxRef = useRef<HTMLDivElement>(null)

  const filteredSkills = useSkillsFiltering(query, allItems, skills, locale, isLibraryMode)
  const selectedUris = new Set(selected.map((s) => s.uri))
  const listboxInDom = Boolean(query && filteredSkills.length > 0)

  const kbdHintId = `${SKILLS_LISTBOX_ID}-kbd-hint`
  const selectedHintId = `${SKILLS_LISTBOX_ID}-selected-hint`

  return (
    <SelectionBrowseModal
      isOpen={isOpen}
      onClose={onClose}
      searchInputRef={inputRef}
      returnFocusRef={returnFocusRef}
      dialogAriaLabel={t('skillsBrowseDialogLabel')}
      backAriaLabel={t('skillsBack')}
      doneLabel={t('skillsDone')}
      selectedCount={selected.length}
      headerCenter={
        <>
          <span id={kbdHintId} className="sr-only">
            {t('skillsListboxKbdHint')}
          </span>
          <SkillSearchInput
            query={query}
            onQueryChange={onQueryChange}
            isSearching={isSearching}
            inputRef={inputRef}
            onClear={onClearQuery}
            placeholder={t('skillsPlaceholderShort')}
            listboxId={listboxInDom ? SKILLS_LISTBOX_ID : undefined}
            ariaDescribedBy={kbdHintId}
          />
        </>
      }
      selectedPills={
        selected.length > 0 ? (
          <>
            <span id={selectedHintId} className="sr-only">
              {t('skillsSelectedRegionHint')}
            </span>
            <SelectedSkillsPills
              skills={selected}
              onRemove={onRemove}
              locale={locale}
              useHorizontalScroll={!!query}
              fadeBackground="var(--card)"
              resultsListRef={listboxRef}
              regionHintId={selectedHintId}
            />
          </>
        ) : undefined
      }
    >
      <div className="px-2">
        <SkillsList
          ref={listboxRef}
          listboxId={SKILLS_LISTBOX_ID}
          ariaDescribedBy={kbdHintId}
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
