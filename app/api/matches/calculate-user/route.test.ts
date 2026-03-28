import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { requireAdminResponse } from '@/lib/auth/require-admin';
import { calculateUserMatches } from '@/lib/match-calculator';
import { createClient } from '@/lib/supabase/server';
import { adminGateUnauthorized } from '@/test-utils/admin-route';

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdminResponse: vi.fn(),
}));

vi.mock('@/lib/match-calculator', () => ({
  calculateUserMatches: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const mockRequireAdminResponse = vi.mocked(requireAdminResponse);
const mockCalculateUserMatches = vi.mocked(calculateUserMatches);
const mockCreateClient = vi.mocked(createClient);

const mockSingle = vi.fn();

describe('POST /api/matches/calculate-user', () => {
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
    mockSingle.mockResolvedValue({ data: { id: 'user-1' }, error: null });
    mockCalculateUserMatches.mockResolvedValue(undefined);
  });

  it('returns admin gate without calculating matches', async () => {
    mockRequireAdminResponse.mockResolvedValue(adminGateUnauthorized());

    const res = await POST(
      new Request('http://localhost/api/matches/calculate-user', {
        method: 'POST',
        body: JSON.stringify({ userId: 'user-1' }),
      }),
    );

    expect(res.status).toBe(401);
    expect(mockCalculateUserMatches).not.toHaveBeenCalled();
  });

  it('calculates matches when admin and user exists', async () => {
    mockRequireAdminResponse.mockResolvedValue(null);

    const res = await POST(
      new Request('http://localhost/api/matches/calculate-user', {
        method: 'POST',
        body: JSON.stringify({ userId: 'user-1' }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
    expect(mockCalculateUserMatches).toHaveBeenCalledWith('user-1');
  });

  it('returns 400 when userId is missing', async () => {
    mockRequireAdminResponse.mockResolvedValue(null);

    const res = await POST(
      new Request('http://localhost/api/matches/calculate-user', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(res.status).toBe(400);
    expect(mockCalculateUserMatches).not.toHaveBeenCalled();
  });

  it('returns 404 when profile not found', async () => {
    mockRequireAdminResponse.mockResolvedValue(null);
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const res = await POST(
      new Request('http://localhost/api/matches/calculate-user', {
        method: 'POST',
        body: JSON.stringify({ userId: 'missing' }),
      }),
    );

    expect(res.status).toBe(404);
    expect(mockCalculateUserMatches).not.toHaveBeenCalled();
  });
});
