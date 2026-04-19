import type { JobPosting } from '@/lib/supabase';
import type { BulletinFilterOptions } from '@/lib/bulletin/server-data';

export interface JobFiltersProps {
  jobs: JobPosting[];
  filteredJobsCount?: number;
  totalJobsCount?: number;
  filterOptions?: BulletinFilterOptions | null;
}
