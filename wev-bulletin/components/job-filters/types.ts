import type { JobPosting } from '@/lib/supabase';
import type { BulletinFilterOptions } from '@/lib/bulletin/filter-options';

export interface JobFiltersProps {
  jobs: JobPosting[];
  filteredJobsCount?: number;
  totalJobsCount?: number;
  filterOptions?: BulletinFilterOptions;
}
