import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test-utils';

const { mockGetOrganizationBySlug, mockGetOrganizationJobs, mockNotFound, mockGetUser } =
  vi.hoisted(() => ({
    mockGetOrganizationBySlug: vi.fn(),
    mockGetOrganizationJobs: vi.fn(),
    mockNotFound: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
    mockGetUser: vi.fn(async () => ({ data: { user: null } })),
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

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock('@/lib/auth/server-user-roles', () => ({
  fetchUserRolesFromService: vi.fn(async () => ({ ok: true, roles: ['user'] })),
}));

vi.mock('@/components/OrganizationProfileHeader', () => ({
  default: ({
    org,
    editHref,
    editLabel,
  }: {
    org: { name: string };
    editHref?: string | null;
    editLabel?: string;
  }) => (
    <div>
      <span>{org.name}</span>
      {editHref && editLabel ? <a href={editHref}>{editLabel}</a> : null}
    </div>
  ),
}));

vi.mock('@/lib/bulletin/server-data', () => ({
  fetchServerProfile: vi.fn(async () => null),
}));

vi.mock('@/components/OrganizationJobRow', () => ({
  default: ({ job }: { job: { job_title: string } }) => <div>{job.job_title}</div>,
  OrganizationJobsList: ({ jobs }: { jobs: { job_title: string }[] }) => (
    <div>
      {jobs.map((job) => (
        <div key={job.job_title}>{job.job_title}</div>
      ))}
    </div>
  ),
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
      description_en: null,
      description_fr: null,
      website: null,
      location: null,
      sse_rating: null,
      sse_details: null,
      is_sse: false,
      type: null,
      values: null,
      logo_url: null,
      created_at: '2026-06-01T00:00:00.000Z',
      mission_statement: null,
      mission_statement_en: null,
      mission_statement_fr: null,
      municipality: null,
      province: null,
      lat: null,
      lng: null,
      geocode_accuracy_type: null,
      sector_id: null,
      values_list: null,
      values_rated: null,
    });
    mockGetOrganizationJobs.mockResolvedValue({
      jobs: [],
      total: 0,
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
