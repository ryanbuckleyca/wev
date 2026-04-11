import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchUserRolesFromService } from './server-user-roles';

const mocks = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn();
  const mockEq = vi.fn();
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  return { mockMaybeSingle, mockEq, mockSelect, mockFrom };
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: mocks.mockFrom,
  },
}));

describe('fetchUserRolesFromService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockEq.mockReturnValue({ maybeSingle: mocks.mockMaybeSingle });
    mocks.mockSelect.mockReturnValue({ eq: mocks.mockEq });
    mocks.mockFrom.mockReturnValue({ select: mocks.mockSelect });
  });

  it('returns ok with parsed roles on success', async () => {
    mocks.mockMaybeSingle.mockResolvedValue({
      data: { roles: ['admin', 'user'] },
      error: null,
    });

    const result = await fetchUserRolesFromService('user-1');
    expect(mocks.mockFrom).toHaveBeenCalledWith('user_roles');
    expect(mocks.mockEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.roles).toEqual(['admin', 'user']);
  });

  it('returns not ok when PostgREST returns an error', async () => {
    mocks.mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'relation does not exist' },
    });

    const result = await fetchUserRolesFromService('user-1');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toEqual({ message: 'relation does not exist' });
  });

  it('returns not ok when the db call throws', async () => {
    mocks.mockFrom.mockImplementationOnce(() => {
      throw new Error('config');
    });

    const result = await fetchUserRolesFromService('user-1');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect((result.error as Error).message).toBe('config');
  });
});
