import { GET } from './route';
import { supabaseServer } from '@/lib/supabase-server';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        like: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [{ name: 'Montreal' }], error: null })),
        })),
      })),
    })),
  },
}));

describe('GET /api/locations/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array if query is too short', async () => {
    const request = new Request('http://localhost/api/locations/search?q=a');
    const response = await GET(request);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it('calls supabase for valid query', async () => {
    const request = new Request('http://localhost/api/locations/search?q=mont');
    const response = await GET(request);
    const data = await response.json();
    expect(supabaseServer.from).toHaveBeenCalledWith('cities');
    expect(data).toEqual([{ name: 'Montreal' }]);
  });
});
