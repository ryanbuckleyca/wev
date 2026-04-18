import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, DELETE } from './route';
import { getRequestUser } from '@/lib/auth/request-user';
import { supabaseServer } from '@/lib/supabase-server';

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn().mockReturnThis(),
    insert: vi.fn(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  },
}));

const mockGetRequestUser = vi.mocked(getRequestUser);
const mockSupabase = vi.mocked(supabaseServer);

describe('API Route: /api/bookmarks/item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST', () => {
    it('returns 401 if unauthorized', async () => {
      mockGetRequestUser.mockResolvedValue({ ok: false, error: 'unauthorized', status: 401 } as unknown as any);
      const request = new NextRequest('http://l/api/bookmarks/item', { method: 'POST' });
      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('returns ok on success', async () => {
      mockGetRequestUser.mockResolvedValue({ ok: true, user: { id: 'u1' } } as unknown as any);
      // @ts-expect-error Mocking Supabase
      mockSupabase.insert.mockResolvedValue({ error: null });

      const request = new NextRequest('http://l/api/bookmarks/item', { 
        method: 'POST', 
        body: JSON.stringify({ jobId: 'j1' }) 
      });
      const response = await POST(request);
      const body = await response.json();
      expect(body.ok).toBe(true);
    });
  });

  describe('DELETE', () => {
    it('returns ok on success', async () => {
      mockGetRequestUser.mockResolvedValue({ ok: true, user: { id: 'u1' } } as unknown as any);
      // @ts-expect-error Mocking Supabase
      mockSupabase.delete().eq().eq.mockResolvedValue({ error: null });

      const request = new NextRequest('http://l/api/bookmarks/item', { 
        method: 'DELETE', 
        body: JSON.stringify({ jobId: 'j1' }) 
      });
      const response = await DELETE(request);
      const body = await response.json();
      expect(body.ok).toBe(true);
    });
  });
});
