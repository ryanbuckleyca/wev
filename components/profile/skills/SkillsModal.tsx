import { useRef, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import SearchInput from '../SearchInput'
import SkillsList from './SkillsList'
import SelectedSkillsPills from './SelectedSkillsPills'
import type { EscoSkill } from './SkillsSelector'
import SelectionBrowseModal from '../SelectionBrowseModal'

const SKILLS_LISTBOX_ID = 'profile-skills-listbox'

function filterSkills(
  query: string,
  allItems: EscoSkill[],
  skills: EscoSkill[],
  locale: 'en' | 'fr',
  isLibraryMode: boolean,
): (EscoSkill & { label: string; internalMatchedAlias?: string | null })[] {
  if (!query) return []
  const lowerQuery = query.toLowerCase()

  if (isLibraryMode) {
    return allItems
      .map((skill) => {
        const label = skill.preferredLabel[locale] || ''
        const lowerLabel = label.toLowerCase()

        let score = -1
        let foundAlias: string | undefined

        if (lowerLabel.startsWith(lowerQuery)) score = 2
        else if (lowerLabel.includes(lowerQuery)) score = 1
        else {
          foundAlias = skill.aliases?.find((a) => a.toLowerCase().includes(lowerQuery))
          if (foundAlias) score = 0
        }

        if (score === -1) return null
        return { ...skill, label, internalMatchedAlias: foundAlias, _score: score }
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => b._score! - a._score!)
      .slice(0, 100)
      .map(({ _score, ...rest }) => rest)
  }

  return skills.map((skill) => ({
    ...skill,
    label: skill.preferredLabel[locale] || '',
    internalMatchedAlias: skill.matchedAlias,
  }))
}

interface SkillsModalProps {
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

export default function SkillsModal({
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
}: SkillsModalProps) {
  const t = useTranslations('profile')
  const inputRef = useRef<HTMLInputElement>(null)
  const filteredSkills = filterSkills(query, allItems, skills, locale, isLibraryMode)
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
          <SearchInput
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
              regionHintId={selectedHintId}
            />
          </>
        ) : undefined
      }
    >
      <div className="px-2">
        <SkillsList
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
