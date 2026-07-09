import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOrganization, updateOrganization } from './actions';

const { mockRequireAdminSession, mockFrom, organizationsQuery } = vi.hoisted(() => {
  const createQuery = () => {
    let result: { data: unknown; error: unknown } = { data: null, error: null };
    const query: Record<string, unknown> = {
      insert: vi.fn(() => query),
      update: vi.fn(() => query),
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      single: vi.fn(() => Promise.resolve(result)),
      setResult(next: { data: unknown; error: unknown }) {
        result = next;
      },
    };
    return query;
  };

  const organizations = createQuery();
  const from = vi.fn((table: string) => {
    if (table === 'organizations') return organizations;
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockRequireAdminSession: vi.fn(),
    mockFrom: from,
    organizationsQuery: organizations,
  };
});

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdminSession: mockRequireAdminSession,
}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: { from: mockFrom },
}));

const validInput = {
  name: 'Test Org',
  slug: 'test-org',
  description: null,
  mission_statement: null,
  website: 'https://example.org',
  location: 'Montreal',
  type: 'nonprofit',
  is_sse: false,
  values_list: ['Community'],
};

describe('organizations/actions', () => {
  const setOrgResult = (result: { data: unknown; error: unknown }) => {
    (
      organizationsQuery as { setResult: (next: { data: unknown; error: unknown }) => void }
    ).setResult(result);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminSession.mockResolvedValue({
      ok: true,
      user: { id: 'admin-1' },
    });
    setOrgResult({ data: null, error: null });
  });

  it('returns unauthorized when admin session is missing', async () => {
    mockRequireAdminSession.mockResolvedValue({ ok: false, response: { status: 401 } });

    const result = await createOrganization(validInput);
    expect(result).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('returns validation error for invalid slug', async () => {
    const result = await createOrganization({ ...validInput, slug: 'Bad Slug' });
    expect(result).toEqual({ ok: false, error: 'slug_invalid', field: 'slug' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('creates organization with normalized payload', async () => {
    const created = { id: 1, name: 'Test Org', slug: 'test-org' };
    setOrgResult({ data: created, error: null });

    const result = await createOrganization(validInput);

    expect(result.ok).toBe(true);
    expect(organizationsQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Org',
        slug: 'test-org',
        values_list: ['Community'],
        sse_rating: 'no',
        sse_details: expect.objectContaining({ flags: ['admin_override'] }),
      }),
    );
  });

  it('maps slug unique violations', async () => {
    setOrgResult({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "organizations_slug_key"',
        details: 'Key (slug)=(test-org) already exists.',
      },
    });

    const result = await createOrganization(validInput);
    expect(result).toEqual({ ok: false, error: 'slug_taken', field: 'slug' });
  });

  it('updates organization fields', async () => {
    const updated = { id: 5, name: 'Updated Org', slug: 'updated-org' };
    setOrgResult({ data: updated, error: null });

    const result = await updateOrganization(5, { name: 'Updated Org' });

    expect(result.ok).toBe(true);
    expect(organizationsQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Updated Org' }),
    );
    expect(organizationsQuery.eq).toHaveBeenCalledWith('id', 5);
  });
});
