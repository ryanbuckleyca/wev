import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchLastScrapeTime,
  fetchServerMatchData,
  fetchServerBookmarks,
  fetchServerProfile,
} from './server-data';
import { supabaseServer } from '@/lib/supabase-server';

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/resolve-skill-labels', () => ({
  resolveSkillLabels: vi.fn().mockResolvedValue(new Map()),
}));

describe('server-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchLastScrapeTime', () => {
    it('returns run_at from the latest scrape run', async () => {
      const mockData = { run_at: '2024-03-15T10:00:00Z' };
      vi.mocked(supabaseServer.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockData, error: null }),
            }),
          }),
        }),
      } as any);

      const result = await fetchLastScrapeTime();
      expect(result).toBe('2024-03-15T10:00:00Z');
    });

    it('returns null if no scrape runs found', async () => {
      vi.mocked(supabaseServer.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      } as any);

      const result = await fetchLastScrapeTime();
      expect(result).toBeNull();
    });

    it('throws error if supabase fails', async () => {
      vi.mocked(supabaseServer.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' } }),
            }),
          }),
        }),
      } as any);

      await expect(fetchLastScrapeTime()).rejects.toThrow('DB Error');
    });
  });

  describe('fetchServerMatchData', () => {
    it('returns serialized match data for a user', async () => {
      const mockData = [
        {
          job_id: 'job-1',
          score: 85,
          value_score: 10,
          skill_score: 20,
          work_type_score: 30,
          location_score: 25,
          shared_values: ['V1'],
          shared_skills: ['S1'],
        },
      ];

      vi.mocked(supabaseServer.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mockData, error: null }),
        }),
      } as any);

      const result = await fetchServerMatchData('user-1');
      expect(result['job-1']).toEqual({
        score: 85,
        value_score: 10,
        skill_score: 20,
        work_type_score: 30,
        location_score: 25,
        shared_values: ['V1'],
        shared_skills: ['S1'],
      });
    });

    it('returns empty object on error', async () => {
      vi.mocked(supabaseServer.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
        }),
      } as any);

      const result = await fetchServerMatchData('user-1');
      expect(result).toEqual({});
    });
  });

  describe('fetchServerBookmarks', () => {
    it('returns array of bookmarked job IDs', async () => {
      vi.mocked(supabaseServer.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [{ job_id: 'j1' }, { job_id: 'j2' }], error: null }),
        }),
      } as any);

      const result = await fetchServerBookmarks('user-1');
      expect(result).toEqual(['j1', 'j2']);
    });

    it('returns empty array on error', async () => {
      vi.mocked(supabaseServer.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
        }),
      } as any);

      const result = await fetchServerBookmarks('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('fetchServerProfile', () => {
    it('returns profile for a user', async () => {
      const mockProfile = { id: 'user-1', full_name: 'Test User' };
      vi.mocked(supabaseServer.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      } as any);

      const result = await fetchServerProfile('user-1');
      expect(result).toEqual(mockProfile);
    });

    it('returns null on error', async () => {
      vi.mocked(supabaseServer.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
          }),
        }),
      } as any);

      const result = await fetchServerProfile('user-1');
      expect(result).toBeNull();
    });
  });
});
