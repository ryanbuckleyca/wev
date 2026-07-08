/**
 * The "Show filters / Hide filters" button used in both JobSearch and OrganizationSearch.
 * Behaviour:
 *   ≥ 520px  →  icon + "Show filters" / "Hide filters"
 *   < 520px  →  icon only  (text hidden via max-[519px]:hidden)
 * Count badge is always visible.
 */
import { useTranslations } from 'next-intl';
import FilterIcon from './FilterIcon';
import { JOB_BOARD_TEST_IDS } from '@/lib/testing/job-board-contract';

interface FilterToggleButtonProps {
  filtersExpanded: boolean;
  onToggle: () => void;
  activeCount: number;
  /** aria-controls id of the collapsible filter panel */
  controlsId: string;
  /** Include the data-testid used by e2e/unit tests (job board only) */
  withTestId?: boolean;
}

export default function FilterToggleButton({
  filtersExpanded,
  onToggle,
  activeCount,
  controlsId,
  withTestId = false,
}: FilterToggleButtonProps) {
  const t = useTranslations('filters');

  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid={withTestId ? JOB_BOARD_TEST_IDS.filtersToggle : undefined}
      className="h-10 px-3 border border-border rounded-wev-btn bg-card text-sm text-muted-foreground hover:border-primary transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
      aria-expanded={filtersExpanded}
      aria-controls={controlsId}
    >
      <FilterIcon className="w-4 h-4" aria-hidden />
      <span className="max-[519px]:hidden">
        {filtersExpanded ? t('hideFilters') : t('showFilters')}
      </span>
      <span className="inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full bg-primary text-white text-xs font-semibold">
        {activeCount}
      </span>
    </button>
  );
}
