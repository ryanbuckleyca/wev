import { vi } from 'vitest';
import type { ReactNode } from 'react';

/** Shared spies for `useRouter()` in tests that mock `@/i18n/navigation`. */
export const mockRouterReplace = vi.fn();
export const mockRouterPush = vi.fn();

/**
 * Stub `Link` + `useRouter` for Vitest. Import this module via `vi.mock`:
 *
 * `vi.mock('@/i18n/navigation', () => import('@/test-utils/i18n-navigation-mock'));`
 *
 * Assert navigation with `mockRouterReplace` / `mockRouterPush`.
 */
export function Link({
  href,
  children,
  prefetch,
  ...props
}: {
  href: string;
  children: ReactNode;
  prefetch?: boolean;
}) {
  void prefetch;
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

export const useRouter = vi.fn(() => ({
  replace: mockRouterReplace,
  push: mockRouterPush,
}));
