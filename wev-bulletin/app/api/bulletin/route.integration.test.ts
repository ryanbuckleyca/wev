import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import {
  queryBulletinJobs,
  parseBulletinRequestFromUrlSearchParams,
} from '@/lib/bulletin/server-data';
import { getRequestUser, type RequestUserResult } from '@/lib/auth/request-user';

/**
 * Route handler contract: locale/query parsing + no-store policy + server-data shape.
 * Server data functions are mocked so the suite does not require a live DB (CI-safe).
 */
vi.mock('@/lib/bulletin/server-data', () => ({
  parseBulletinRequestFromUrlSearchParams: vi.fn(),
  queryBulletinJobs: vi.fn(),
  BULLETIN_CACHE_TAG: 'bulletin-jobs',
}));

const mockParseRequest = vi.mocked(parseBulletinRequestFromUrlSearchParams);
const mockQueryBulletinJobs = vi.mocked(queryBulletinJobs);

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: vi.fn(),
}));

const mockGetRequestUser = vi.mocked(getRequestUser);

describe('GET /api/bulletin (handler contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseRequest.mockReturnValue({
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
      sortBy: 'date-desc',
      currentPage: 1,
    });

    mockQueryBulletinJobs.mockResolvedValue({
      jobs: [],
      lastScrapeTime: '2020-01-01T00:00:00.000Z',
      skillLabels: {},
      filteredJobsCount: 0,
      totalJobsCount: 0,
      totalPages: 0,
      currentPage: 1,
      filterOptions: {
        organizations: [],
        provinces: [],
        municipalitiesByProvince: {},
        employmentTypes: [],
        sources: [],
      },
    });
    
    mockGetRequestUser.mockResolvedValue({ ok: false, authError: 'unauthorized' } as RequestUserResult);
  });

  it('returns JSON and public Cache-Control with locale from query', async () => {
    const response = await GET(new Request('http://localhost/api/bulletin?locale=fr'));

    expect(mockQueryBulletinJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'fr',
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('public, max-age');

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.jobs).toEqual([]);
    expect(body.lastScrapeTime).toBe('2020-01-01T00:00:00.000Z');
    expect(body.skillLabels).toEqual({});
    expect(body.filteredJobsCount).toBe(0);
    expect(body.totalJobsCount).toBe(0);
    expect(body.totalPages).toBe(0);
  });

  it('returns JSON and no-store Cache-Control when performing personalized sorts', async () => {
    mockParseRequest.mockReturnValueOnce({
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
      sortBy: 'match-desc',
      currentPage: 1,
    });
    
    mockGetRequestUser.mockResolvedValueOnce({ 
      ok: true, 
      user: { id: 'test-user-id' } 
    } as RequestUserResult);

    const response = await GET(new Request('http://localhost/api/bulletin?locale=en'));

    expect(mockQueryBulletinJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'test-user-id',
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('defaults locale to English when the locale query is missing', async () => {
    await GET(new Request('http://localhost/api/bulletin'));
    expect(mockQueryBulletinJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'en',
      }),
    );
  });

  it('defaults locale to English when the locale query is not fr', async () => {
    await GET(new Request('http://localhost/api/bulletin?locale=de'));
    expect(mockQueryBulletinJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'en',
      }),
    );
  });

  it('returns 500 when queryBulletinJobs throws', async () => {
    mockQueryBulletinJobs.mockRejectedValue(new Error('db unavailable'));

    const response = await GET(new Request('http://localhost/api/bulletin'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('db unavailable');
  });
});
