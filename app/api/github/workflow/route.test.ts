import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';
import { requireAdminResponse } from '@/lib/auth/require-admin';
import { adminGateUnauthorized } from '@/test-utils/admin-route';

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdminResponse: vi.fn(),
}));

const mockRequireAdminResponse = vi.mocked(requireAdminResponse);
const mockFetch = vi.fn();

describe('POST /api/github/workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WEV_GITHUB_TOKEN', 'test-token');
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ default_branch: 'main' }),
        text: async () => '',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns admin gate without calling GitHub', async () => {
    mockRequireAdminResponse.mockResolvedValue(adminGateUnauthorized());

    const res = await POST();
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 500 when GitHub token is missing', async () => {
    mockRequireAdminResponse.mockResolvedValue(null);
    vi.stubEnv('WEV_GITHUB_TOKEN', '');

    const res = await POST();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('GitHub');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('dispatches workflow when admin and GitHub succeeds', async () => {
    mockRequireAdminResponse.mockResolvedValue(null);

    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain('/repos/ryanbuckleyca/wev-scraper');
    expect(mockFetch.mock.calls[1][0]).toContain('/actions/workflows/scrape.yml/dispatches');
  });
});
