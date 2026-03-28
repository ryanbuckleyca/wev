import { mockRequireAdminResponse } from '@/test-utils/require-admin-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { calculateJobMatches } from '@/lib/match-calculator';
import { createClient } from '@/lib/supabase/server';
import { adminGateUnauthorized } from '@/test-utils/admin-route';

vi.mock('@/lib/match-calculator', () => ({
  calculateJobMatches: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const mockCalculateJobMatches = vi.mocked(calculateJobMatches);
const mockCreateClient = vi.mocked(createClient);

const mockSingle = vi.fn();

describe('POST /api/matches/calculate-job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSingle,
          })),
        })),
      })),
    } as never);
    mockSingle.mockResolvedValue({ data: { id: 'job-1' }, error: null });
    mockCalculateJobMatches.mockResolvedValue(undefined);
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
