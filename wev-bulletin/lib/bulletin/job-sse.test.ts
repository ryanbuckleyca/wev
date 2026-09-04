import { describe, it, expect, vi } from 'vitest';
import { demoteOrgJobSse, resolveJobIsSse } from './job-sse';

describe('resolveJobIsSse', () => {
  it('requires org SSE for a yes', () => {
    expect(resolveJobIsSse(true, true)).toBe(true);
    expect(resolveJobIsSse(true, false)).toBe(false);
    expect(resolveJobIsSse(true, null)).toBe(null);
    expect(resolveJobIsSse(false, true)).toBe(false);
    expect(resolveJobIsSse(false, null)).toBe(false);
    expect(resolveJobIsSse(null, true)).toBe(null);
  });
});

describe('demoteOrgJobSse', () => {
  it('updates SSE jobs for the org and returns the row count', async () => {
    const eqIsSse = vi.fn().mockResolvedValue({
      data: [{ id: 'j1' }, { id: 'j2' }],
      error: null,
    });
    const eqOrg = vi.fn(() => ({ eq: eqIsSse }));
    const update = vi.fn(() => ({ eq: eqOrg }));
    const from = vi.fn(() => ({ update }));

    const count = await demoteOrgJobSse({ from }, 42);

    expect(from).toHaveBeenCalledWith('jobs');
    expect(update).toHaveBeenCalledWith({ is_sse: false });
    expect(eqOrg).toHaveBeenCalledWith('organization_id', 42);
    expect(eqIsSse).toHaveBeenCalledWith('is_sse', true);
    expect(count).toBe(2);
  });

  it('returns 0 on error', async () => {
    const eqIsSse = vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } });
    const eqOrg = vi.fn(() => ({ eq: eqIsSse }));
    const update = vi.fn(() => ({ eq: eqOrg }));
    const from = vi.fn(() => ({ update }));

    expect(await demoteOrgJobSse({ from }, 1)).toBe(0);
  });
});
