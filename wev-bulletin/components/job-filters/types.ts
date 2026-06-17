import type { JobPosting } from '@/lib/supabase';
import type { BulletinFilterOptions } from '@/lib/bulletin/filter-options';

export interface JobFiltersProps {
  jobs: JobPosting[];
  filterOptions?: BulletinFilterOptions;
  filteredJobsCount?: number;
  totalJobsCount?: number;
  /** True while the first results for the current filters are still loading. */
  loading?: boolean;
}
