import { mockRequireAdminResponse } from '@/test-utils/require-admin-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { calculateJobMatches } from '@/lib/match-calculator';
import { adminGateUnauthorized } from '@/test-utils/admin-route';

vi.mock('@/lib/match-calculator', () => ({
  calculateJobMatches: vi.fn(),
}));

const { mockSingle, mockSupabase } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockSupabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockSingle,
        })),
      })),
    })),
  };
  return { mockSingle, mockSupabase };
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: mockSupabase,
}));

const mockCalculateJobMatches = vi.mocked(calculateJobMatches);

describe('POST /api/matches/calculate-job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { id: 'job-1' }, error: null });
    mockCalculateJobMatches.mockResolvedValue(undefined);
    mockSupabase.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: mockSingle })),
      })),
    });
  });

  it('returns admin gate without calculating matches', async () => {
    mockRequireAdminResponse.mockResolvedValue(adminGateUnauthorized());

    const res = await POST(
      new Request('http://localhost/api/matches/calculate-job', {
        method: 'POST',
        body: JSON.stringify({ jobId: 'job-1' }),
      }),
    );

    expect(res.status).toBe(401);
    expect(mockCalculateJobMatches).not.toHaveBeenCalled();
  });

  it('calculates matches when admin and job exists', async () => {
    mockRequireAdminResponse.mockResolvedValue(null);

    const res = await POST(
      new Request('http://localhost/api/matches/calculate-job', {
        method: 'POST',
        body: JSON.stringify({ jobId: 'job-1' }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
    expect(mockCalculateJobMatches).toHaveBeenCalledWith('job-1');
  });

  it('returns 400 when jobId is missing', async () => {
    mockRequireAdminResponse.mockResolvedValue(null);

    const res = await POST(
      new Request('http://localhost/api/matches/calculate-job', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(res.status).toBe(400);
    expect(mockCalculateJobMatches).not.toHaveBeenCalled();
  });

  it('returns 404 when job not found', async () => {
    mockRequireAdminResponse.mockResolvedValue(null);
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const res = await POST(
      new Request('http://localhost/api/matches/calculate-job', {
        method: 'POST',
        body: JSON.stringify({ jobId: 'missing' }),
      }),
    );

    expect(res.status).toBe(404);
    expect(mockCalculateJobMatches).not.toHaveBeenCalled();
  });
});
