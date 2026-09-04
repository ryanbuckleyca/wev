import { mockRequireAdminResponse } from '@/test-utils/require-admin-mock';

vi.mock('next/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/cache')>();
  return {
    ...actual,
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
  };
});
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';
import { adminGateUnauthorized } from '@/test-utils/admin-route';
import { revalidatePath, revalidateTag } from 'next/cache';

const { mockSingle, mockSupabase, mockSelectSingle } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockSelectSingle = vi.fn();
  const mockSupabase = {
    from: vi.fn(),
  };
  return { mockSingle, mockSupabase, mockSelectSingle };
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: mockSupabase,
}));

function mockUpdateChain() {
  return {
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: mockSingle,
        })),
      })),
    })),
  };
}

function mockSelectChain() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: mockSelectSingle,
      })),
    })),
  };
}

describe('PATCH /api/bulletin/jobs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({
      data: { id: 'job-1', is_sse: false },
      error: null,
    });
    mockSupabase.from.mockReturnValue(mockUpdateChain());
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

  it('updates is_sse when admin unmarks SSE', async () => {
    mockRequireAdminResponse.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/bulletin/jobs/job-1', {
      method: 'PATCH',
      body: JSON.stringify({ is_sse: false }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'job-1' }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ id: 'job-1', is_sse: false });
    expect(mockSingle).toHaveBeenCalled();
    expect(revalidateTag).toHaveBeenCalledWith('bulletin-jobs', 'default');
    expect(revalidatePath).toHaveBeenCalledWith('/en', 'page');
    expect(revalidatePath).toHaveBeenCalledWith('/fr', 'page');
    expect(revalidatePath).toHaveBeenCalledWith('/en/jobs', 'page');
    expect(revalidatePath).toHaveBeenCalledWith('/fr/jobs', 'page');
    expect(revalidatePath).toHaveBeenCalledWith('/fr/emplois', 'page');
  });

  it('rejects marking SSE when the linked org is not SSE', async () => {
    mockRequireAdminResponse.mockResolvedValue(null);
    mockSelectSingle.mockResolvedValue({
      data: { id: 'job-1', organization_id: 9, organizations: { is_sse: false } },
      error: null,
    });
    mockSupabase.from.mockReturnValueOnce(mockSelectChain());

    const request = new NextRequest('http://localhost/api/bulletin/jobs/job-1', {
      method: 'PATCH',
      body: JSON.stringify({ is_sse: true }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'job-1' }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/organization is SSE/i);
    expect(mockSingle).not.toHaveBeenCalled();
  });

  it('allows marking SSE when the linked org is SSE', async () => {
    mockRequireAdminResponse.mockResolvedValue(null);
    mockSelectSingle.mockResolvedValue({
      data: { id: 'job-1', organization_id: 9, organizations: { is_sse: true } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { id: 'job-1', is_sse: true },
      error: null,
    });
    mockSupabase.from
      .mockReturnValueOnce(mockSelectChain())
      .mockReturnValueOnce(mockUpdateChain());

    const request = new NextRequest('http://localhost/api/bulletin/jobs/job-1', {
      method: 'PATCH',
      body: JSON.stringify({ is_sse: true }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: 'job-1' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'job-1', is_sse: true });
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
