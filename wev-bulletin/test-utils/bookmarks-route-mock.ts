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
): void {
  mockEq.mockReturnValue({
    order: vi.fn(() => orderResult),
  });
  mockFrom.mockReturnValue({
    select: vi.fn(() => ({
      eq: mockEq,
    })),
  });
}
