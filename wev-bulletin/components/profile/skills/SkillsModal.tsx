import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import InfoPopover from '@/components/InfoPopover';
import SearchInput from '../SearchInput';
import SelectedPillsStrip from '../SelectedPillsStrip';
import SkillsList from './SkillsList';
import type { EscoSkill } from '@/lib/types/skills';
import SelectionBrowseModal from '../SelectionBrowseModal';

const ID = 'profile-skills-listbox';

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  onClearQuery: () => void;
  selected: EscoSkill[];
  onRemove: (uri: string) => void;
  onToggle: (skill: EscoSkill) => void;
  skills: EscoSkill[];
  hasQuery: boolean;
  isLoading: boolean;
  locale: 'en' | 'fr';
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
  skills,
  hasQuery,
  isLoading,
  locale,
}: SkillsModalProps) {
  const t = useTranslations('profile');
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedUris = new Set(selected.map((s) => s.uri));
  const listboxInDom = skills.length > 0;

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
          <span id={`${ID}-kbd-hint`} className="sr-only">
            {t('skillsListboxKbdHint')}
          </span>
          <SearchInput
            query={query}
            onQueryChange={onQueryChange}
            isSearching={isLoading}
            inputRef={inputRef}
            onClear={onClearQuery}
            placeholder={t('skillsPlaceholderShort')}
            listboxId={listboxInDom ? ID : undefined}
            ariaDescribedBy={`${ID}-kbd-hint`}
          />
        </>
      }
      selectedPills={
        selected.length > 0 ? (
          <>
            <span id={`${ID}-selected-hint`} className="sr-only">
              {t('skillsSelectedRegionHint')}
            </span>
            <SelectedPillsStrip
              items={selected.map((s) => ({
                key: s.uri,
                label: s.preferredLabel[locale],
                removeArg: s.uri,
              }))}
              onRemove={onRemove}
              ariaLabel={t('skillsSelectedRegionLabel', { count: selected.length })}
              optPrefix="skills-pill"
              regionHintId={`${ID}-selected-hint`}
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
      <div className="flex min-h-0 flex-1 flex-col px-2">
        <SkillsList
          listboxId={ID}
          ariaDescribedBy={`${ID}-kbd-hint`}
          skills={skills}
          selectedUris={selectedUris}
          onToggle={onToggle}
          locale={locale}
          hasQuery={hasQuery}
          isLoading={isLoading}
        />
      </div>
    </SelectionBrowseModal>
  );
}
