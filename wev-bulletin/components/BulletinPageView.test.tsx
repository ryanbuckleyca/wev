import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test-utils';
import BulletinPageView from './BulletinPageView';
import type { BulletinDataState } from '@/lib/bulletin/types';
import type { BulletinFilterControls } from '@/lib/hooks/useBulletinFilters';
import type { JobPosting } from '@/lib/supabase';

vi.mock('next/image', () => ({
  default: ({
    priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt} />;
  },
}));

vi.mock('@/components/WatercolorBackground', () => ({
  default: () => <div data-testid="watercolor-background" />,
}));

vi.mock('@/components/ReScrapeButton', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <button onClick={onComplete}>re-scrape</button>
  ),
}));

vi.mock('@/components/CopyPageJobsButton', () => ({
  default: ({ jobs }: { jobs: JobPosting[] }) => <div>copy-jobs:{jobs.length}</div>,
}));

vi.mock('@/components/JobFilters', () => ({
  default: ({
    jobs,
    filteredJobsCount,
    totalJobsCount,
  }: {
    jobs: JobPosting[];
    filteredJobsCount: number;
    totalJobsCount: number;
  }) => (
    <div>
      job-filters:{jobs.length}:{filteredJobsCount}:{totalJobsCount}
    </div>
  ),
}));

vi.mock('@/components/SortDropdown', () => ({
  default: ({ showMatchOption }: { showMatchOption?: boolean }) => {
    return <button>sort:{showMatchOption ? 'yes' : 'no'}</button>;
  },
}));

vi.mock('@/components/ExpandAllToggle', () => ({
  default: function MockExpandAllToggle() {
    return <button>toggle-expand</button>;
  },
}));

vi.mock('@/components/JobListings', () => ({
  default: ({ jobs }: { jobs: JobPosting[] }) => <div>job-listings:{jobs.length}</div>,
}));

vi.mock('@/components/Pagination', () => ({
  default: ({ totalPages }: { totalPages: number }) => {
    return <button>pagination:{totalPages}</button>;
  },
}));

const baseJobs: JobPosting[] = [
  {
    id: 'job-1',
    job_title: 'Policy Analyst',
    organization: 'Org One',
    location: 'Toronto, ON',
    municipality: 'Toronto',
    province: 'Ontario',
    work_type: 'remote',
    date_posted: '2026-03-01T00:00:00.000Z',
    close_date: null,
    wage: '$80,000',
    listing_url: 'https://example.com/job-1',
    is_sse: true,
  },
  {
    id: 'job-2',
    job_title: 'Planner',
    organization: 'Org Two',
    location: 'Halifax, NS',
    municipality: 'Halifax',
    province: 'Nova Scotia',
    work_type: 'hybrid',
    date_posted: '2026-03-02T00:00:00.000Z',
    close_date: null,
    wage: null,
    listing_url: 'https://example.com/job-2',
    is_sse: false,
  },
  {
    id: 'job-3',
    job_title: 'Coordinator',
    organization: 'Org Three',
    location: 'Remote',
    municipality: null,
    province: null,
    work_type: 'remote',
    date_posted: '2026-03-03T00:00:00.000Z',
    close_date: null,
    wage: '$70,000',
    listing_url: 'https://example.com/job-3',
    is_sse: true,
  },
];

function createFilters(): BulletinFilterControls {
  return {
    filters: {
      searchQuery: '',
      selectedOrganizations: [],
      selectedProvinces: [],
      selectedMunicipalities: [],
      selectedEmploymentTypes: [],
      selectedSources: [],
      selectedWorkTypes: [],
      showOnlySse: true,
      showJobsWithoutSalary: true,
      postedWithin: '2-weeks',
    },
    searchQuery: '',
    setSearchQuery: vi.fn(),
    selectedOrganizations: [],
    setSelectedOrganizations: vi.fn(),
    selectedProvinces: [],
    setSelectedProvinces: vi.fn(),
    selectedMunicipalities: [],
    setSelectedMunicipalities: vi.fn(),
    selectedEmploymentTypes: [],
    setSelectedEmploymentTypes: vi.fn(),
    selectedSources: [],
    setSelectedSources: vi.fn(),
    selectedWorkTypes: ['remote'],
    setSelectedWorkTypes: vi.fn(),
    showOnlySse: true,
    setShowOnlySse: vi.fn(),
    showJobsWithoutSalary: true,
    setShowJobsWithoutSalary: vi.fn(),
    postedWithin: '2-weeks',
    setPostedWithin: vi.fn(),
    filtersExpanded: false,
    setFiltersExpanded: vi.fn(),
    currentPage: 1,
    setCurrentPage: vi.fn(),
    allJobsExpanded: true,
    setAllJobsExpanded: vi.fn(),
    sortBy: 'date-desc',
    setSortBy: vi.fn(),
    profileWorkTypes: ['remote'],
    isUsingProfileWorkTypes: true,
    handleResetToProfileWorkTypes: vi.fn(),
    profileMunicipality: null,
    profileProvince: null,
    isUsingProfileLocation: false,
    handleResetToProfileLocation: vi.fn(),
    hasAnyFilters: false,
    clearAllFilters: vi.fn(),
    applySuggestedDefaults: vi.fn(),
  };
}

function createData(): BulletinDataState {
  return {
    jobsOnPage: baseJobs.slice(0, 1),
    totalMatchingJobs: 3,
    lastScrapeTime: 'March 28, 2026, 9:00 AM EDT',
    loading: false,
    userMetaLoading: false,
    error: null,
    matchData: new Map(),
    bookmarkedJobIds: new Set(['job-1']),
    skillLabels: {},
    totalPages: 3,
    itemsPerPage: 20,
    refresh: vi.fn(async () => {}),
    handleJobSseChange: vi.fn(),
    handleJobBookmarkChange: vi.fn(),
  };
}

describe('BulletinPageView', () => {
  it('wires listing and admin action props from hook state', async () => {
    const user = userEvent.setup();
    const filters = createFilters();
    const data = createData();

    render(
      <BulletinPageView
        isAdmin
        isLoggedIn
        userId="user-1"
        profile={null}
        filters={filters}
        data={data}
      />,
    );

    expect(screen.getByText('job-filters:1:3:3')).toBeVisible();
    expect(screen.getByText('job-listings:1')).toBeVisible();
    expect(screen.getByText('copy-jobs:1')).toBeVisible();
    expect(screen.getByText(/Last updated/i)).toBeVisible();
    expect(screen.getByText('sort:yes')).toBeVisible();
    expect(screen.getByText('pagination:3')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 're-scrape' }));
    expect(data.refresh).toHaveBeenCalled();
  });

  it('hides admin actions and match sorting when no user context is available', () => {
    const filters = createFilters();
    const data = createData();

    render(
      <BulletinPageView
        isAdmin={false}
        isLoggedIn={false}
        userId={null}
        profile={null}
        filters={filters}
        data={data}
      />,
    );

    expect(screen.queryByRole('button', { name: 're-scrape' })).not.toBeInTheDocument();
    expect(screen.queryByText(/copy-jobs:/)).not.toBeInTheDocument();
    expect(screen.getByText('sort:no')).toBeVisible();
  });
});
