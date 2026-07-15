import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveOrgSlugs } from './resolve-org-slugs';

describe('resolveOrgSlugs', () => {
  const inMock = vi.fn();

  beforeEach(() => {
    inMock.mockReset();
    inMock.mockResolvedValue({
      data: [
        { id: 1, slug: 'org-one' },
        { id: 2, slug: 'org-two' },
      ],
      error: null,
    });
  });

  function makeSupabase() {
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: inMock,
        })),
      })),
    } as unknown as Parameters<typeof resolveOrgSlugs>[0];
  }

  it('no-ops when jobs is not an array', async () => {
    const supabase = makeSupabase();
    await resolveOrgSlugs(supabase, null);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('skips non-object rows and jobs without numeric organization_id', async () => {
    const supabase = makeSupabase();
    const jobs = [
      null,
      'bad',
      { organization_id: '1' },
      { organization_id: 1 },
      { organization_id: 2 },
    ];

    await resolveOrgSlugs(supabase, jobs);

    expect(inMock).toHaveBeenCalledWith('id', [1, 2]);
    expect(jobs[3]).toEqual({ organization_id: 1, organization_slug: 'org-one' });
    expect(jobs[4]).toEqual({ organization_id: 2, organization_slug: 'org-two' });
  });

  it('fetches all unique org slugs in a single batched query', async () => {
    const supabase = makeSupabase();
    const jobs = [
      { organization_id: 1 },
      { organization_id: 1 },
      { organization_id: 2 },
      { organization_id: 3 },
    ];

    await resolveOrgSlugs(supabase, jobs);

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(inMock).toHaveBeenCalledTimes(1);
    expect(inMock).toHaveBeenCalledWith('id', [1, 2, 3]);
  });
});
