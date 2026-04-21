import type { JobMatchData, JobPosting } from '@/lib/supabase';
import type { SerializedMatchData } from '@/lib/bulletin/server-data';
import type { BulletinFilters, JobSortOption } from '@/lib/bulletin/job-query';
import type { SkillLabel } from '@/lib/resolve-skill-labels';

export type { SkillLabel };

/**
 * Server-side data passed from the Server Component via BulletinPageClient.
 */
export interface InitialBulletinData {
  jobs: JobPosting[];
  scrapeTime: string | null;
  total: number;
  userId?: string | null;
  matchData?: SerializedMatchData;
  bookmarkedJobIds?: string[];
  skillLabels?: Record<string, SkillLabel>;
}

export interface BulletinDataState {
  jobsOnPage: JobPosting[];
  totalMatchingJobs: number;
  lastScrapeTime: string | null;
  loading: boolean;
  userMetaLoading: boolean;
  error: string | null;
  matchData: Map<string, JobMatchData>;
  bookmarkedJobIds: Set<string>;
  skillLabels: Record<string, SkillLabel>;
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
