import { useRef, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import SearchInput from '../SearchInput'
import SelectedPillsStrip from '../SelectedPillsStrip'
import ValuesList from './ValuesList'
import SelectionBrowseModal from '../SelectionBrowseModal'
import type { WorkValue } from '@/lib/values'

const VALUES_LISTBOX_ID = 'profile-values-listbox'

interface ValuesModalProps {
  isOpen: boolean
  onClose: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
  query: string
  onQueryChange: (value: string) => void
  onClearQuery: () => void
  values: WorkValue[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  locale: 'en' | 'fr'
}

export default function ValuesModal({
  isOpen,
  onClose,
  returnFocusRef,
  query,
  onQueryChange,
  onClearQuery,
  values,
  selectedIds,
  onToggle,
  onRemove,
  locale,
}: ValuesModalProps) {
  const t = useTranslations('profile')
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedSet = new Set(selectedIds)

  const kbdHintId = `${VALUES_LISTBOX_ID}-kbd-hint`
  const selectedHintId = `${VALUES_LISTBOX_ID}-selected-hint`

  return (
    <SelectionBrowseModal
      isOpen={isOpen}
      onClose={onClose}
      searchInputRef={inputRef}
      returnFocusRef={returnFocusRef}
      dialogAriaLabel={t('valuesBrowseDialogLabel')}
      backAriaLabel={t('valuesBack')}
      doneLabel={t('valuesDone')}
      selectedCount={selectedSet.size}
      headerCenter={
        <>
          <span id={kbdHintId} className="sr-only">
            {t('valuesListboxKbdHint')}
          </span>
          <SearchInput
            query={query}
            onQueryChange={onQueryChange}
            inputRef={inputRef}
            onClear={onClearQuery}
            placeholder={t('valuesPlaceholderShort')}
            listboxId={VALUES_LISTBOX_ID}
            ariaDescribedBy={kbdHintId}
          />
        </>
      }
      selectedPills={
        selectedSet.size > 0 ? (
          <>
            <span id={selectedHintId} className="sr-only">
              {t('valuesSelectedRegionHint')}
            </span>
            <SelectedPillsStrip
              items={selectedIds
                .map((id) => { const v = values.find((val) => val.id === id); return v ? { key: v.id, label: v.label[locale], removeArg: v.id } : null })
                .filter(Boolean) as { key: string; label: string; removeArg: string }[]}
              onRemove={onRemove}
              ariaLabel={t('valuesSelectedRegionLabel', { count: selectedSet.size })}
              optPrefix="values-pill"
              regionHintId={selectedHintId}
              useHorizontalScroll={!!query}
              fadeBackground="var(--card)"
            />
          </>
        ) : undefined
      }
    >
      <div className="min-h-0">
        <ValuesList
          values={values}
          selectedSet={selectedSet}
          query={query}
          locale={locale}
          onToggle={onToggle}
          listboxId={VALUES_LISTBOX_ID}
          ariaDescribedBy={kbdHintId}
        />
      </div>
    </SelectionBrowseModal>
  )
}
