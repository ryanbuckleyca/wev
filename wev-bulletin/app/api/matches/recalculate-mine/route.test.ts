import { POST } from './route';
import { createClient } from '@/lib/supabase/server';
import { calculateUserMatches } from '@/lib/match-calculator';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/match-calculator', () => ({
  calculateUserMatches: vi.fn(),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual as any,
    after: vi.fn((cb) => cb()), // execute immediately for test
  };
});

describe('POST /api/matches/recalculate-mine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if not authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as any);

    const response = await POST();
    expect(response.status).toBe(401);
  });

  it('returns 200 and calls calculateUserMatches if authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    } as any);

    const response = await POST();
    expect(response.status).toBe(200);
    expect(calculateUserMatches).toHaveBeenCalledWith('user-1');
  });
});
