import { mockRequireAdminResponse } from '@/test-utils/require-admin-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { adminGateUnauthorized } from '@/test-utils/admin-route';

const mockFetch = vi.fn();

describe('GET /api/github/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WEV_GITHUB_TOKEN', 'test-token');
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        workflow_runs: [
          {
            id: 1,
            status: 'completed',
            conclusion: 'success',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      }),
    } as Response);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when not admin', async () => {
    mockRequireAdminResponse.mockResolvedValue(adminGateUnauthorized());

    const res = await GET(new NextRequest('http://localhost/api/github/status'));

    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns workflow status when admin', async () => {
    mockRequireAdminResponse.mockResolvedValue(null);

    const res = await GET(new NextRequest('http://localhost/api/github/status'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });
});
