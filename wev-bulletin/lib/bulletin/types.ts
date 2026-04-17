import type { JobMatchData, JobPosting } from '@/lib/supabase';
import type { SerializedMatchData } from '@/lib/bulletin/server-data';
import type { BulletinFilters, JobSortOption } from '@/lib/bulletin/job-query';
import type { BulletinFilterOptions } from '@/lib/bulletin/filter-options';
import type { SkillLabel } from '@/lib/resolve-skill-labels';

export type { SkillLabel };

/**
 * Server-side data passed from the Server Component via BulletinPageClient.
 *
 * The jobs payload is optional so the page can avoid embedding the entire
 * bulletin dataset in the initial RSC/HTML response.
 */
export interface InitialBulletinData {
  jobs?: JobPosting[];
  scrapeTime?: string | null;
  userId?: string | null;
  matchData?: SerializedMatchData;
  bookmarkedJobIds?: string[];
  skillLabels?: Record<string, SkillLabel>;
  isPartialHydration?: boolean;
  filteredJobsCount?: number;
  totalJobsCount?: number;
  totalPages?: number;
  filterOptions?: BulletinFilterOptions;
}

export interface BulletinDataState {
  allJobs: JobPosting[];
  filteredJobs: JobPosting[];
  paginatedJobs: JobPosting[];
  filteredJobsCount: number;
  totalJobsCount: number;
  lastScrapeTime: string | null;
  loading: boolean;
  error: string | null;
  matchData: Map<string, JobMatchData>;
  bookmarkedJobIds: Set<string>;
  skillLabels: Record<string, SkillLabel>;
  filterOptions: BulletinFilterOptions;
  totalPages: number;
  itemsPerPage: number;
  refresh: () => Promise<void>;
  fetchAllFilteredJobs: () => Promise<JobPosting[]>;
  handleJobSseChange: (jobId: string, isSse: boolean) => void;
  handleJobBookmarkChange: (job: JobPosting, bookmarked: boolean) => void;
}

export interface UseBulletinDataOptions {
  filters: BulletinFilters;
  sortBy: JobSortOption;
  currentPage: number;
  setCurrentPage: (page: number) => Promise<unknown> | void;
}
