import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import {
  createOrganization,
  updateOrganization,
  deleteOrganization,
  setOrganizationAssessmentReview,
} from './actions';

const { mockRequireAdminSession, mockFrom, organizationsQuery, jobsQuery } = vi.hoisted(() => {
  const createQuery = () => {
    let result: { data: unknown; error: unknown } = { data: null, error: null };
    const query: Record<string, unknown> = {
      insert: vi.fn(() => query),
      update: vi.fn(() => query),
      delete: vi.fn(() => query),
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      single: vi.fn(() => Promise.resolve(result)),
      maybeSingle: vi.fn(() => Promise.resolve(result)),
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
      setResult(next: { data: unknown; error: unknown }) {
        result = next;
      },
    };
    return query;
  };

  const organizations = createQuery();
  const jobs = createQuery();
  const from = vi.fn((table: string) => {
    if (table === 'organizations') return organizations;
    if (table === 'jobs') return jobs;
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    mockRequireAdminSession: vi.fn(),
    mockFrom: from,
    organizationsQuery: organizations,
    jobsQuery: jobs,
  };
});

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdminSession: mockRequireAdminSession,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
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
    (
      jobsQuery as { setResult: (next: { data: unknown; error: unknown }) => void }
    ).setResult({ data: [], error: null });
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
    const updated = { id: 5, name: 'Updated Org', slug: 'updated-org', is_sse: false };
    setOrgResult({ data: updated, error: null });

    const result = await updateOrganization(5, { name: 'Updated Org' });

    expect(result.ok).toBe(true);
    expect(organizationsQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Updated Org' }),
    );
    expect(organizationsQuery.eq).toHaveBeenCalledWith('id', 5);
  });

  it('demotes job SSE when the org is marked non-SSE', async () => {
    (organizationsQuery.single as Mock)
      .mockResolvedValueOnce({
        data: {
          id: 5,
          slug: 'sse-org',
          is_sse: true,
          type: 'nonprofit',
          assessment_skip_reason: null,
          sector_id: 'housing-collective-real-estate',
          description: 'x',
          description_en: 'x',
          description_fr: 'x',
          language: 'en',
          values_list: ['Community'],
          name: 'SSE Org',
          website: 'https://example.org',
          municipality: 'Montreal',
          province: 'QC',
          location: 'Montreal, QC',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: 5, slug: 'sse-org', is_sse: false, name: 'SSE Org' },
        error: null,
      });
    (
      jobsQuery as { setResult: (next: { data: unknown; error: unknown }) => void }
    ).setResult({ data: [{ id: 'j1' }], error: null });

    const result = await updateOrganization(5, { is_sse: false });

    expect(result.ok).toBe(true);
    expect(jobsQuery.update).toHaveBeenCalledWith({ is_sse: false });
    expect(jobsQuery.eq).toHaveBeenCalledWith('organization_id', 5);
    expect(jobsQuery.eq).toHaveBeenCalledWith('is_sse', true);
  });

  it('deletes organization when found', async () => {
    setOrgResult({ data: { id: 9, name: 'Doomed Org', slug: 'doomed-org' }, error: null });

    const result = await deleteOrganization(9);

    expect(result).toEqual({ ok: true });
    expect(organizationsQuery.delete).toHaveBeenCalled();
    expect(organizationsQuery.eq).toHaveBeenCalledWith('id', 9);
  });

  it('returns not_found when deleting a missing organization', async () => {
    setOrgResult({ data: null, error: null });

    const result = await deleteOrganization(404);
    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(organizationsQuery.delete).not.toHaveBeenCalled();
  });

  describe('assessment review state', () => {
    const VALID_SECTOR = 'housing-collective-real-estate';

    // mockClear (from vi.clearAllMocks) leaves queued *Once values in place, so
    // reset the queue explicitly or one test's leftovers shift the next one.
    beforeEach(() => {
      (organizationsQuery.single as Mock).mockReset();
      (organizationsQuery.single as Mock).mockResolvedValue({ data: null, error: null });
    });

    /** updateOrganization reads the existing row, then writes; queue both. */
    const queueExistingThenUpdated = (
      existing: unknown,
      updated: unknown = { id: 5, slug: 's' },
    ) => {
      (organizationsQuery.single as Mock)
        .mockResolvedValueOnce({ data: existing, error: null })
        .mockResolvedValueOnce({ data: updated, error: null });
    };

    const parkedIncomplete = {
      id: 5,
      slug: 'riverside',
      is_sse: false,
      type: 'cooperative',
      assessment_skip_reason: 'location_mismatch',
      sector_id: null,
      description: null,
      description_en: 'Member-owned housing.',
      description_fr: 'Logement.',
      language: 'en',
      values_list: ['Community'],
      name: 'Riverside Housing Co-op',
      website: 'https://riverside.example',
      municipality: 'Sainte-Catherine',
      province: 'QC',
      location: 'Sainte-Catherine, QC',
    };

    it('clears the skip reason when the save completes the org', async () => {
      queueExistingThenUpdated(parkedIncomplete);

      await updateOrganization(5, { sector_id: VALID_SECTOR });

      expect(organizationsQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({ sector_id: VALID_SECTOR, assessment_skip_reason: null }),
      );
    });

    it('clears the skip reason when identity changed but the org is still incomplete', async () => {
      queueExistingThenUpdated(parkedIncomplete);

      await updateOrganization(5, { municipality: 'St. Catharines' });

      expect(organizationsQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({ assessment_skip_reason: null }),
      );
    });

    it('leaves the skip reason untouched on a cosmetic edit', async () => {
      queueExistingThenUpdated(parkedIncomplete);

      await updateOrganization(5, { description_en: 'Reworded blurb.' });

      const payload = (organizationsQuery.update as Mock).mock.calls[0][0];
      expect(payload).not.toHaveProperty('assessment_skip_reason');
    });

    it('does not unpark when the form resubmits location without coordinates', async () => {
      queueExistingThenUpdated(parkedIncomplete);

      await updateOrganization(5, {
        name: parkedIncomplete.name,
        website: parkedIncomplete.website,
        location: parkedIncomplete.location,
        municipality: null,
        province: null,
        description_en: 'Reworded blurb.',
      });

      const payload = (organizationsQuery.update as Mock).mock.calls[0][0];
      expect(payload.municipality).toBeNull();
      expect(payload).not.toHaveProperty('assessment_skip_reason');
    });

    it('writes the cleared reason even when it is the only change', async () => {
      queueExistingThenUpdated({
        ...parkedIncomplete,
        sector_id: VALID_SECTOR,
        assessment_skip_reason: 'partial_fill',
      });

      await updateOrganization(5, {});

      expect(organizationsQuery.update).toHaveBeenCalledWith({ assessment_skip_reason: null });
    });

    it('does not touch the reason for an org that was never parked', async () => {
      queueExistingThenUpdated({ ...parkedIncomplete, assessment_skip_reason: null });

      await updateOrganization(5, { municipality: 'St. Catharines' });

      const payload = (organizationsQuery.update as Mock).mock.calls[0][0];
      expect(payload).not.toHaveProperty('assessment_skip_reason');
    });

    /** setOrganizationAssessmentReview writes and reads back in one round trip. */
    const queueReviewWrite = (data: unknown, error: unknown = null) => {
      (organizationsQuery.single as Mock).mockResolvedValueOnce({ data, error });
    };

    it('retry clears the reason', async () => {
      queueReviewWrite({ id: 5, name: 'Riverside', slug: 'riverside' });

      const result = await setOrganizationAssessmentReview(5, 'retry');

      expect(result.ok).toBe(true);
      expect(organizationsQuery.update).toHaveBeenCalledWith({ assessment_skip_reason: null });
      expect(organizationsQuery.eq).toHaveBeenCalledWith('id', 5);
    });

    it('ignore parks the org out of the queue', async () => {
      queueReviewWrite({ id: 5, name: 'Riverside', slug: 'riverside' });

      const result = await setOrganizationAssessmentReview(5, 'ignore');

      expect(result.ok).toBe(true);
      expect(organizationsQuery.update).toHaveBeenCalledWith({
        assessment_skip_reason: 'ignored',
      });
    });

    it('requires an admin session', async () => {
      mockRequireAdminSession.mockResolvedValue({ ok: false, response: { status: 401 } });

      const result = await setOrganizationAssessmentReview(5, 'retry');

      expect(result).toEqual({ ok: false, error: 'unauthorized' });
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('returns not_found when the org is missing', async () => {
      queueReviewWrite(null, { code: 'PGRST116', message: 'no rows' });

      const result = await setOrganizationAssessmentReview(404, 'retry');

      expect(result).toEqual({ ok: false, error: 'not_found' });
    });
  });
});
