import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMatchMap, fetchMatchMapForJobs } from './match-map';

const mockIn = vi.fn();
const mockEq = vi.fn(() => ({ in: mockIn }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

describe('match map helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a match map with safe defaults', () => {
    const matchMap = buildMatchMap([
      {
        job_id: 'job-1',
        score: 0.8,
        value_score: null,
        skill_score: 0.6,
        shared_values: ['community'],
      },
    ]);

    expect(matchMap.get('job-1')).toEqual({
      score: 0.8,
      value_score: null,
      skill_score: 0.6,
      shared_values: ['community'],
      shared_skills: [],
    });
  });

  it('does not query Supabase when there are no job ids', async () => {
    const matchMap = await fetchMatchMapForJobs('user-1', []);

    expect(matchMap).toEqual(new Map());
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('fetches and maps match data for a user', async () => {
    mockIn.mockResolvedValue({
      data: [
        {
          job_id: 'job-1',
          score: 0.9,
          value_score: 0.7,
          skill_score: 0.8,
          shared_values: ['care'],
          shared_skills: ['skill-1'],
        },
      ],
      error: null,
    });

    const matchMap = await fetchMatchMapForJobs('user-1', ['job-1']);

    expect(mockFrom).toHaveBeenCalledWith('job_matches');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockIn).toHaveBeenCalledWith('job_id', ['job-1']);
    expect(matchMap.get('job-1')).toEqual({
      score: 0.9,
      value_score: 0.7,
      skill_score: 0.8,
      shared_values: ['care'],
      shared_skills: ['skill-1'],
    });
  });
});
