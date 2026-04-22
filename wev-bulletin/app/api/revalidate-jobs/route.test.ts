import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRevalidateTag, mockRevalidatePath } = vi.hoisted(() => ({
  mockRevalidateTag: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock('next/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/cache')>();
  return {
    ...actual,
    revalidateTag: mockRevalidateTag,
    revalidatePath: mockRevalidatePath,
  };
});

describe('POST /api/revalidate-jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns 503 when revalidation secret is not configured', async () => {
    vi.stubEnv('REVALIDATE_SECRET', undefined);
    vi.stubEnv('REVALIDATION_SECRET', undefined);

    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/revalidate-jobs', { method: 'POST' }),
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('Not configured');
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('returns 401 when bearer token is invalid', async () => {
    vi.stubEnv('REVALIDATE_SECRET', 'test-secret');

    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/revalidate-jobs', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('Unauthorized');
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('revalidates tag and bulletin paths when authorized', async () => {
    vi.stubEnv('REVALIDATE_SECRET', 'test-secret');

    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/revalidate-jobs', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { revalidated: boolean; tag: string };
    expect(body.revalidated).toBe(true);
    expect(body.tag).toBe('bulletin-jobs');

    expect(mockRevalidateTag).toHaveBeenCalledWith('bulletin-jobs', 'default');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/en', 'page');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/fr', 'page');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/en/jobs', 'page');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/fr/jobs', 'page');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/fr/emplois', 'page');
  });
});
