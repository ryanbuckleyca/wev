import { GET } from './route';
import { supabaseServer } from '@/lib/supabase-server';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { selectSpy, likeSpy, limitSpy } = vi.hoisted(() => ({
  selectSpy: vi.fn().mockReturnThis(),
  likeSpy: vi.fn().mockReturnThis(),
  limitSpy: vi.fn().mockResolvedValue({ data: [{ name: 'Montreal' }], error: null }),
}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn(() => ({
      select: selectSpy,
      like: likeSpy,
      limit: limitSpy,
    })),
  },
}));

describe('GET /api/locations/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitSpy.mockResolvedValue({ data: [{ name: 'Montreal' }], error: null });
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
    expect(selectSpy).toHaveBeenCalledWith('name, province, display_name, lat, lng');
    expect(likeSpy).toHaveBeenCalledWith('search_name', 'mont%');
    expect(data).toEqual([{ name: 'Montreal' }]);
  });

  it('returns 500 if supabase returns an error', async () => {
    limitSpy.mockResolvedValue({ data: null, error: { message: 'Database error' } });
    const request = new Request('http://localhost/api/locations/search?q=mont');
    const response = await GET(request);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Database error' });
  });
});
