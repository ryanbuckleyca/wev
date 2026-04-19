import type { JobMatchData, JobPosting } from '@/lib/supabase';
import type { SerializedMatchData, BulletinFilterOptions } from '@/lib/bulletin/server-data';
import type { BulletinFilters, JobSortOption } from '@/lib/bulletin/job-query';
import type { SkillLabel } from '@/lib/resolve-skill-labels';

export type { SkillLabel };

/**
 * Server-side data passed from the Server Component via BulletinPageClient.
 */
export interface InitialBulletinData {
  scrapeTime: string | null;
  userId?: string | null;
  matchData?: SerializedMatchData;
  bookmarkedJobIds?: string[];
  skillLabels?: Record<string, SkillLabel>;
  filterOptions?: BulletinFilterOptions;
}

export interface BulletinDataState {
  paginatedJobs: JobPosting[];
  totalCount: number;
  lastScrapeTime: string | null;
  loading: boolean;
  error: string | null;
  matchData: Map<string, JobMatchData>;
  bookmarkedJobIds: Set<string>;
  skillLabels: Record<string, SkillLabel>;
  filterOptions: BulletinFilterOptions | null;
  totalPages: number;
  itemsPerPage: number;
  refresh: () => Promise<void>;
  handleJobSseChange: (jobId: string, isSse: boolean) => void;
  handleJobBookmarkChange: (job: JobPosting, bookmarked: boolean) => void;
}

export interface UseBulletinDataOptions {
  filters: BulletinFilters;
  sortBy: JobSortOption;
  currentPage: number;
  setCurrentPage: (page: number) => Promise<unknown> | void;
}
