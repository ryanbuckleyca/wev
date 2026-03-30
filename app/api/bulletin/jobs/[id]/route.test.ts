import { mockRequireAdminResponse } from '@/test-utils/require-admin-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';
import { adminGateUnauthorized } from '@/test-utils/admin-route';

const { mockSingle, mockSupabase } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockSupabase = {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: mockSingle,
          })),
        })),
      })),
    })),
  };
  return { mockSingle, mockSupabase };
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: mockSupabase,
}));

describe('PATCH /api/bulletin/jobs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({
      data: { id: 'job-1', is_sse: true },
      error: null,
    });
    mockSupabase.from.mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: mockSingle,
          })),
        })),
      })),
    });
  });

  it('returns the admin gate response when not authorized', async () => {
    mockRequireAdminResponse.mockResolvedValue(adminGateUnauthorized());

    const request = new NextRequest('http://localhost/api/bulletin/jobs/job-1', {
      method: 'PATCH',
      body: JSON.stringify({ is_sse: true }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'job-1' }) });
    expect(response.status).toBe(401);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('updates is_sse when admin and body is valid', async () => {
    mockRequireAdminResponse.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/bulletin/jobs/job-1', {
      method: 'PATCH',
      body: JSON.stringify({ is_sse: false }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'job-1' }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ id: 'job-1', is_sse: true });
    expect(mockSingle).toHaveBeenCalled();
  });

  it('returns 400 when is_sse is not a boolean', async () => {
    mockRequireAdminResponse.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/bulletin/jobs/job-1', {
      method: 'PATCH',
      body: JSON.stringify({ is_sse: 'yes' }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'job-1' }) });
    expect(response.status).toBe(400);
  });
});
