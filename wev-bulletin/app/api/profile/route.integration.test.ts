import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { User } from '@supabase/supabase-js';
import { GET, PATCH } from './route';
import { getRequestUser, type RequestUserResult } from '@/lib/auth/request-user';
import { supabaseServer } from '@/lib/supabase-server';

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };

  return {
    supabaseServer: {
      from: vi.fn().mockReturnValue(mockChain),
    },
  };
});

const mockGetRequestUser = vi.mocked(getRequestUser);

describe('API Route: /api/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns 401 if unauthorized', async () => {
      mockGetRequestUser.mockResolvedValue({ ok: false, authError: 'unauthorized' } as RequestUserResult);
      const response = await GET();
      expect(response.status).toBe(401);
    });

    it('returns profile data if authorized', async () => {
      mockGetRequestUser.mockResolvedValue({ 
        ok: true, 
        user: { 
          id: 'u123', 
          email: 'test@example.com',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as User 
      });
      
      const chain = vi.mocked(supabaseServer.from('profiles'));
      chain.maybeSingle.mockResolvedValue({ data: { id: 'u123', full_name: 'Test' }, error: null });

      const response = await GET();
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.profile.full_name).toBe('Test');
    });
  });

  describe('PATCH', () => {
    it('returns 400 for invalid schema', async () => {
      mockGetRequestUser.mockResolvedValue({ 
        ok: true, 
        user: { 
          id: 'u123', 
          email: 'test@example.com',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as User 
      });
      const request = new NextRequest('http://l/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ unknown_field: 'error' }),
      });

      const response = await PATCH(request);
      expect(response.status).toBe(400);
    });

    it('returns updated profile on success', async () => {
      mockGetRequestUser.mockResolvedValue({ 
        ok: true, 
        user: { 
          id: 'u123', 
          email: 'test@example.com',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as User 
      });
      
      const chain = vi.mocked(supabaseServer.from('profiles'));
      chain.single.mockResolvedValue({ data: { id: 'u123', full_name: 'New Name' }, error: null });

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
