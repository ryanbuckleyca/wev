import { useRef } from 'react';
import InfoPopover from '@/components/InfoPopover';
import { useTranslations } from 'next-intl';
import SearchInput from '../SearchInput';
import SelectedPillsStrip, { type PillItem } from '../SelectedPillsStrip';
import ValuesList from './ValuesList';
import SelectionBrowseModal from '../SelectionBrowseModal';
import type { WorkValue } from '@/lib/values';

const ID = 'profile-values-listbox';

function toPillItem(id: string, values: WorkValue[], locale: 'en' | 'fr'): PillItem | null {
  const v = values.find((val) => val.id === id);
  return v ? { key: v.id, label: v.label[locale], removeArg: v.id } : null;
}

interface ValuesModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  onClearQuery: () => void;
  values: WorkValue[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  locale: 'en' | 'fr';
}

export default function ValuesModal({
  isOpen,
  onClose,
  query,
  onQueryChange,
  onClearQuery,
  values,
  selectedIds,
  onToggle,
  onRemove,
  locale,
}: ValuesModalProps) {
  const t = useTranslations('profile');
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedSet = new Set(selectedIds);
  const pillItems = selectedIds
    .map((id) => toPillItem(id, values, locale))
    .filter((p): p is PillItem => p !== null);
  // Map from id to WorkValue for popover content
  const valueMap = Object.fromEntries(values.map((v) => [v.id, v]));

  return (
    <SelectionBrowseModal
      isOpen={isOpen}
      onClose={onClose}
      searchInputRef={inputRef}
      dialogAriaLabel={t('valuesBrowseDialogLabel')}
      backAriaLabel={t('valuesBack')}
      doneLabel={t('valuesDone')}
      selectedCount={selectedSet.size}
      headerCenter={
        <>
          <span id={`${ID}-kbd-hint`} className="sr-only">
            {t('valuesListboxKbdHint')}
          </span>
          <SearchInput
            query={query}
            onQueryChange={onQueryChange}
            inputRef={inputRef}
            onClear={onClearQuery}
            placeholder={t('valuesPlaceholderShort')}
            listboxId={ID}
            ariaDescribedBy={`${ID}-kbd-hint`}
          />
        </>
      }
      selectedPills={
        pillItems.length > 0 ? (
          <>
            <span id={`${ID}-selected-hint`} className="sr-only">
              {t('valuesSelectedRegionHint')}
            </span>
            <SelectedPillsStrip
              items={pillItems}
              onRemove={onRemove}
              ariaLabel={t('valuesSelectedRegionLabel', { count: pillItems.length })}
              optPrefix="values-pill"
              regionHintId={`${ID}-selected-hint`}
              useHorizontalScroll
              fadeBackground="var(--card)"
              wrapPill={(pill, item) => {
                const v = valueMap[item.key];
                return (
                  <InfoPopover
                    content={v?.summary?.[locale] || v?.label?.[locale]}
                    triggerTabIndex={-1}
                  >
                    {pill}
                  </InfoPopover>
                );
              }}
            />
          </>
        ) : undefined
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <ValuesList
          values={values}
          selectedSet={selectedSet}
          query={query}
          locale={locale}
          onToggle={onToggle}
          listboxId={ID}
          ariaDescribedBy={`${ID}-kbd-hint`}
        />
      </div>
    </SelectionBrowseModal>
  );
}
