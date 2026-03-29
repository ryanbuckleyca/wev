import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBookmarkedJobIds, formatLastScrapeTime } from './client-data';

const mockIn = vi.fn();
const mockEq = vi.fn(() => ({ in: mockIn }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

describe('bulletin client-data helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats scrape timestamps for the bulletin header', () => {
    const formatted = formatLastScrapeTime('2026-03-28T14:00:00', 'en');

    expect(formatted).toContain('March');
    expect(formatted).toContain('EDT');
  });

  it('returns null when no scrape timestamp is available', () => {
    expect(formatLastScrapeTime(null, 'en')).toBeNull();
  });

  it('fetches bookmarked job ids for the current user', async () => {
    mockIn.mockResolvedValue({
      data: [{ job_id: 'job-1' }, { job_id: 'job-2' }],
      error: null,
    });

    const bookmarks = await fetchBookmarkedJobIds('user-1', ['job-1', 'job-2']);

    expect(mockFrom).toHaveBeenCalledWith('bookmarks');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockIn).toHaveBeenCalledWith('job_id', ['job-1', 'job-2']);
    expect(bookmarks).toEqual(new Set(['job-1', 'job-2']));
  });
});
