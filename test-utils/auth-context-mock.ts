import type { AuthContextValue } from '@/contexts/AuthContext';

const defaultAuth: AuthContextValue = {
  user: null,
  role: 'user',
  roles: ['user'],
  loading: false,
};

/**
 * Builds a full `AuthContextValue` for mocked `useAuth` in tests so partials stay
 * type-safe when `AuthContextValue` gains fields.
 */
export function createMockAuthContext(overrides: Partial<AuthContextValue>): AuthContextValue {
  return { ...defaultAuth, ...overrides };
}
