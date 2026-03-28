import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import InfoPopover from '@/components/InfoPopover'
import SearchInput from '../SearchInput'
import SelectedPillsStrip from '../SelectedPillsStrip'
import SkillsList from './SkillsList'
import type { EscoSkill } from './SkillsSelector'
import SelectionBrowseModal from '../SelectionBrowseModal'

const SKILLS_LISTBOX_ID = 'profile-skills-listbox'

function filterSkills(
  query: string,
  allItems: EscoSkill[],
  locale: 'en' | 'fr',
): (EscoSkill & { label: string; internalMatchedAlias?: string | null })[] {
  if (!query) return []
  const lowerQuery = query.toLowerCase()

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

interface SkillsModalProps {
  isOpen: boolean
  onClose: () => void
  query: string
  onQueryChange: (value: string) => void
  onClearQuery: () => void
  selected: EscoSkill[]
  onRemove: (uri: string) => void
  onToggle: (skill: EscoSkill) => void
  allItems: EscoSkill[]
  isLoading: boolean
  locale: 'en' | 'fr'
}

export default function SkillsModal({
  isOpen,
  onClose,
  query,
  onQueryChange,
  onClearQuery,
  selected,
  onRemove,
  onToggle,
  allItems,
  isLoading,
  locale,
}: SkillsModalProps) {
  const t = useTranslations('profile')
  const inputRef = useRef<HTMLInputElement>(null)
  const filteredSkills = filterSkills(query, allItems, locale)
  const selectedUris = new Set(selected.map((s) => s.uri))
  const listboxInDom = Boolean(query && filteredSkills.length > 0)

  const kbdHintId = `${SKILLS_LISTBOX_ID}-kbd-hint`
  const selectedHintId = `${SKILLS_LISTBOX_ID}-selected-hint`

  return (
    <SelectionBrowseModal
      isOpen={isOpen}
      onClose={onClose}
      searchInputRef={inputRef}
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
            isSearching={isLoading}
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
            <SelectedPillsStrip
              items={selected.map((s) => ({ key: s.uri, label: s.preferredLabel[locale], removeArg: s.uri }))}
              onRemove={onRemove}
              ariaLabel={t('skillsSelectedRegionLabel', { count: selected.length })}
              optPrefix="skills-pill"
              regionHintId={selectedHintId}
              useHorizontalScroll={!!query}
              fadeBackground="var(--card)"
              wrapPill={(pill, _item, i) => (
                <InfoPopover
                  content={selected[i].description?.[locale] || selected[i].preferredLabel[locale]}
                  className={query ? 'shrink-0' : undefined}
                  triggerTabIndex={-1}
                >
                  {pill}
                </InfoPopover>
              )}
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
          hasQuery={!!query}
        />
      </div>
    </SelectionBrowseModal>
  )
}
