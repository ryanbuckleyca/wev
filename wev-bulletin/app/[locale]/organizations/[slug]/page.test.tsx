import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test-utils';

const { mockGetOrganizationBySlug, mockGetOrganizationJobs, mockNotFound } = vi.hoisted(() => ({
  mockGetOrganizationBySlug: vi.fn(),
  mockGetOrganizationJobs: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'jobs' && typeof values?.count === 'number') return `${values.count} jobs`;
    return key;
  }),
}));

vi.mock('@/lib/organizations/server-data', () => ({
  getOrganizationBySlug: mockGetOrganizationBySlug,
  getOrganizationJobs: mockGetOrganizationJobs,
}));

vi.mock('@/components/OrganizationProfileHeader', () => ({
  default: ({ org }: { org: { name: string } }) => <div>{org.name}</div>,
}));

vi.mock('@/components/OrganizationJobRow', () => ({
  default: ({ job }: { job: { job_title: string } }) => <div>{job.job_title}</div>,
}));

vi.mock('@/components/SimplePagination', () => ({
  default: () => <div>pagination</div>,
}));

import OrganizationDetailPage from './page';

describe('OrganizationDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls notFound when the organization slug does not exist', async () => {
    mockGetOrganizationBySlug.mockResolvedValue(null);

    await expect(
      OrganizationDetailPage({
        params: Promise.resolve({ locale: 'en', slug: 'missing-org' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalledOnce();
    expect(mockGetOrganizationJobs).not.toHaveBeenCalled();
  });

  it('renders the translated empty state when the organization has no active jobs', async () => {
    mockGetOrganizationBySlug.mockResolvedValue({
      id: 12,
      name: 'Test Org',
      slug: 'test-org',
      description: null,
      website: null,
      location: null,
      sse_rating: null,
      sse_details: null,
      is_sse: false,
      type: null,
      values: null,
      logo_url: null,
      created_at: '2026-06-01T00:00:00.000Z',
    });
    mockGetOrganizationJobs.mockResolvedValue({
      jobs: [],
      total: 0,
      totalAvailable: 0,
    });

    const output = await OrganizationDetailPage({
      params: Promise.resolve({ locale: 'en', slug: 'test-org' }),
      searchParams: Promise.resolve({}),
    });

    render(output);

    expect(screen.getByText('Test Org')).toBeInTheDocument();
    expect(screen.getByText('0 jobs')).toBeInTheDocument();
    expect(screen.getByText('noJobsForOrg')).toBeInTheDocument();
    expect(screen.queryByText('pagination')).not.toBeInTheDocument();
  });
});
