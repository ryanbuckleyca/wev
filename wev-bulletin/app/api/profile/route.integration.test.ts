import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from './route';
import { getRequestUser } from '@/lib/auth/request-user';
import { supabaseServer } from '@/lib/supabase-server';

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn(),
  },
}));

const mockGetRequestUser = vi.mocked(getRequestUser);
const mockSupabase = vi.mocked(supabaseServer);

describe('API Route: /api/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns 401 if unauthorized', async () => {
      mockGetRequestUser.mockResolvedValue({ ok: false, error: 'unauthorized', status: 401 });
      const response = await GET();
      expect(response.status).toBe(401);
    });

    it('returns profile data if authorized', async () => {
      mockGetRequestUser.mockResolvedValue({ ok: true, user: { id: 'u123', email: 'test@example.com' } });
      mockSupabase.maybeSingle.mockResolvedValue({ data: { id: 'u123', full_name: 'Test' }, error: null });

      const response = await GET();
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.profile.full_name).toBe('Test');
    });
  });

  describe('PATCH', () => {
    it('returns 400 for invalid schema', async () => {
      mockGetRequestUser.mockResolvedValue({ ok: true, user: { id: 'u123', email: 'test@example.com' } });
      const request = new NextRequest('http://l/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ unknown_field: 'error' }),
      });

      const response = await PATCH(request);
      expect(response.status).toBe(400);
    });

    it('returns updated profile on success', async () => {
      mockGetRequestUser.mockResolvedValue({ ok: true, user: { id: 'u123', email: 'test@example.com' } });
      mockSupabase.single.mockResolvedValue({ data: { id: 'u123', full_name: 'New Name' }, error: null });

      const request = new NextRequest('http://l/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ full_name: 'New Name' }),
      });

      const response = await PATCH(request);
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.profile.full_name).toBe('New Name');
    });
  });
});
