import type { Mock } from 'vitest';
import { vi } from 'vitest';

type PostgrestOrderResult = Promise<{ data: unknown; error: { message: string } | null }>;

/**
 * Wires `mockFrom` / `mockEq` to match `GET /api/bookmarks` query shape: `from().select().eq().order()`.
 * Keep in sync with `app/api/bookmarks/route.ts`.
 */
export function wireBookmarksRouteQueryMock(
  mockFrom: Mock,
  mockEq: Mock,
  orderResult: PostgrestOrderResult,
  mockOrder?: Mock,
): void {
  const orderFn = mockOrder || vi.fn();
  orderFn.mockReturnValue(orderResult);

  mockEq.mockReturnValue({
    order: orderFn,
  });
  const mockSelect = vi.fn().mockReturnValue({
    eq: mockEq,
  });
  mockFrom.mockReturnValue({
    select: mockSelect,
  });
}
