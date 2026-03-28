import { useRef, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import SearchInput from '../SearchInput'
import ValuesList from './ValuesList'
import SelectedValuesPills from './SelectedValuesPills'
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
            <SelectedValuesPills
              values={values}
              selectedIds={selectedIds}
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
