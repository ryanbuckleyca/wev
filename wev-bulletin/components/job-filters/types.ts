import type { JobPosting } from '@/lib/supabase';

export interface JobFiltersProps {
  jobs: JobPosting[];
  filteredJobsCount?: number;
  totalJobsCount?: number;
}
