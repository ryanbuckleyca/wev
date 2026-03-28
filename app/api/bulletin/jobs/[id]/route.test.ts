import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';
import { requireAdminResponse } from '@/lib/auth/require-admin';
import { getSupabaseServer } from '@/lib/supabase-server';
import { adminGateUnauthorized } from '@/test-utils/admin-route';

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdminResponse: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseServer: vi.fn(),
}));

const mockRequireAdminResponse = vi.mocked(requireAdminResponse);
const mockGetSupabaseServer = vi.mocked(getSupabaseServer);

describe('PATCH /api/bulletin/jobs/[id]', () => {
  const mockSingle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({
      data: { id: 'job-1', is_sse: true },
      error: null,
    });
    mockGetSupabaseServer.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: mockSingle,
            })),
          })),
        })),
      })),
    } as unknown as ReturnType<typeof getSupabaseServer>);
  });

  it('returns the admin gate response when not authorized', async () => {
    mockRequireAdminResponse.mockResolvedValue(adminGateUnauthorized());

    const request = new NextRequest('http://localhost/api/bulletin/jobs/job-1', {
      method: 'PATCH',
      body: JSON.stringify({ is_sse: true }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'job-1' }) });
    expect(response.status).toBe(401);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
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
