import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { getRequestUser } from '@/lib/auth/request-user';

/**
 * Handler contract: auth gate + bookmark-id lookup + job fetch + normalize/label pipeline.
 */
const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: mockFrom,
  },
}));

const mockGetRequestUser = vi.mocked(getRequestUser);

describe('GET /api/bookmarks (handler contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRequestUser.mockResolvedValue({
      ok: true,
      user: { id: 'bookmark-user-1', email: 'b@example.com' } as never,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'bookmarks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        };
      }

      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetRequestUser.mockResolvedValue({
      ok: false,
      authError: new Error('Not authenticated'),
    });

    const response = await GET(new Request('http://localhost/api/bookmarks?locale=en'));
    expect(response.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns bookmarked jobs JSON for an authenticated user', async () => {
    const response = await GET(new Request('http://localhost/api/bookmarks?locale=en'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { jobs: unknown[] };
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(body.jobs).toHaveLength(0);

    expect(mockFrom).toHaveBeenCalledWith('bookmarks');
    expect(mockFrom).not.toHaveBeenCalledWith('jobs');
  });

  it('returns 500 when bookmark lookup fails', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'bookmarks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: null, error: { message: 'query failed' } })),
            })),
          })),
        };
      }

      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const response = await GET(new Request('http://localhost/api/bookmarks'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('query failed');
  });

  it('returns jobs ordered by bookmark recency', async () => {
    const bookmarkRows = {
      data: [
        { job_id: 'job-2', created_at: '2026-04-19T20:00:00.000Z' },
        { job_id: 'job-1', created_at: '2026-04-19T19:00:00.000Z' },
      ],
      error: null,
    };
    const fallbackJobs = {
      data: [
        {
          id: 'job-1',
          job_title: 'First Job',
          organization: 'Org A',
          location: 'Toronto',
          municipality: 'Toronto',
          province: 'ON',
          work_type: 'Remote',
          date_posted: '2026-04-18',
          close_date: null,
          wage: null,
          listing_url: 'https://example.com/1',
          employment_type: 'full-time',
          summary: null,
          is_sse: true,
          source_id: null,
          sources: { name: 'Source A' },
          values: [],
          skills: [],
        },
        {
          id: 'job-2',
          job_title: 'Second Job',
          organization: 'Org B',
          location: 'Montreal',
          municipality: 'Montreal',
          province: 'QC',
          work_type: 'Hybrid',
          date_posted: '2026-04-19',
          close_date: null,
          wage: null,
          listing_url: 'https://example.com/2',
          employment_type: 'contract',
          summary: null,
          is_sse: false,
          source_id: null,
          sources: { name: 'Source B' },
          values: [],
          skills: [],
        },
      ],
      error: null,
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'bookmarks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve(bookmarkRows)),
            })),
          })),
        };
      }

      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve(fallbackJobs)),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const response = await GET(new Request('http://localhost/api/bookmarks?locale=en'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { jobs: Array<{ id: string }> };
    expect(body.jobs.map((job) => job.id)).toEqual(['job-2', 'job-1']);
  });

  it('returns 500 when jobs lookup fails', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'bookmarks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() =>
                Promise.resolve({
                  data: [{ job_id: 'job-1', created_at: '2026-04-19T20:00:00.000Z' }],
                  error: null,
                }),
              ),
            })),
          })),
        };
      }

      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ data: null, error: { message: 'jobs failed' } })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const response = await GET(new Request('http://localhost/api/bookmarks?locale=en'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('jobs failed');
  });
});
