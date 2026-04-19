import type { JobMatchData, JobPosting } from '@/lib/supabase';
import type { SerializedMatchData, BulletinFilterOptions } from '@/lib/bulletin/server-data';
import type { SkillLabel } from '@/lib/resolve-skill-labels';

export type { SkillLabel };

/**
 * Bulletin filter and sort constants/types.
 */
export const POSTED_WITHIN_FILTER_OPTIONS = ['1-week', '2-weeks', '3-weeks', '1-month', 'any'] as const;

export type PostedWithinSelection = (typeof POSTED_WITHIN_FILTER_OPTIONS)[number];

export const JOB_SORT_OPTIONS = [
  'date-desc',
  'date-asc',
  'match-desc',
  'value-match-desc',
  'skill-match-desc',
  'salary-desc',
  'salary-asc',
  'org-asc',
] as const;

export type JobSortOption = (typeof JOB_SORT_OPTIONS)[number];

export type BulletinFilters = {
  searchQuery: string;
  selectedOrganizations: string[];
  selectedProvinces: string[];
  selectedMunicipalities: string[];
  selectedEmploymentTypes: string[];
  selectedSources: string[];
  selectedWorkTypes: string[];
  showOnlySse: boolean;
  showJobsWithoutSalary: boolean;
  postedWithin: PostedWithinSelection;
  now?: number;
};

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
