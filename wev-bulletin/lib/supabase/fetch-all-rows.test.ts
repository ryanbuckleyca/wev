import { describe, expect, it, vi } from 'vitest';
import { POSTGREST_MAX_ROWS, fetchAllPagedRows } from './fetch-all-rows';

describe('fetchAllPagedRows', () => {
  it('returns a single page when under the PostgREST cap', async () => {
    const fetchPage = vi.fn(async () => ({
      data: [{ id: 1 }, { id: 2 }],
      error: null,
    }));

    await expect(fetchAllPagedRows(fetchPage)).resolves.toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(0, POSTGREST_MAX_ROWS - 1);
  });

  it('pages until a short final chunk', async () => {
    const full = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => ({ id: i }));
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: full, error: null })
      .mockResolvedValueOnce({ data: [{ id: POSTGREST_MAX_ROWS }], error: null });

    const rows = await fetchAllPagedRows<{ id: number }>(fetchPage);
    expect(rows).toHaveLength(POSTGREST_MAX_ROWS + 1);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, POSTGREST_MAX_ROWS - 1);
    expect(fetchPage).toHaveBeenNthCalledWith(
      2,
      POSTGREST_MAX_ROWS,
      POSTGREST_MAX_ROWS * 2 - 1,
    );
  });

  it('throws when a page returns an error', async () => {
    await expect(
      fetchAllPagedRows(async () => ({ data: null, error: { message: 'boom' } })),
    ).rejects.toThrow('boom');
  });
});
