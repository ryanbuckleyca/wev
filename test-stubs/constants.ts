import { vi } from 'vitest'

/**
 * Shared test constants and mock factories.
 *
 * These reduce duplication across test files for common patterns like
 * auth context mocks and router mocks.
 */

/** Unauthenticated user — useAuth() return value when not signed in. */
export const MOCK_AUTH_ANON = {
  user: null,
  role: 'user' as const,
  roles: ['user'],
  loading: false,
}

/** Minimal fake user object matching Supabase User shape. */
export const FAKE_USER = { id: 'user-1' } as const

/** Authenticated user — useAuth() return value when signed in. */
export const MOCK_AUTH_USER = {
  user: FAKE_USER as never,
  role: 'user' as const,
  roles: ['user'],
  loading: false,
}

/** Create a mock router with vi.fn() for replace and push. */
export function mockRouter() {
  return { replace: vi.fn(), push: vi.fn() }
}
