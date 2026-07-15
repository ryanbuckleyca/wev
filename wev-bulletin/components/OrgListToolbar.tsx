'use client';

import type { ReactNode } from 'react';
import SortDropdown from './SortDropdown';
import { ORG_INDEX_SORT_OPTIONS } from '@/lib/organizations/utils';

type OrgListToolbarProps = {
  /** Count label (or a simple skeleton while loading). */
  countContent: ReactNode;
  sortBy: string;
  onSortChange: (value: string) => void;
  /** When true, sort control is shown but not interactive (route loading shell). */
  sortDisabled?: boolean;
};

/** Shared count + sort chrome for the org index (live page and loading shell). */
export default function OrgListToolbar({
  countContent,
  sortBy,
  onSortChange,
  sortDisabled = false,
}: OrgListToolbarProps) {
  return (
    <div className="flex justify-between items-center px-2">
      <div className="text-sm text-muted-foreground" aria-live="polite">
        {countContent}
      </div>
      <div className={sortDisabled ? 'pointer-events-none opacity-50' : undefined}>
        <SortDropdown
          sortBy={sortBy}
          onChange={sortDisabled ? () => {} : onSortChange}
          optionValues={[...ORG_INDEX_SORT_OPTIONS]}
        />
      </div>
    </div>
  );
}
