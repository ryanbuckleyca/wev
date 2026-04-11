import { vi } from 'vitest';

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdminResponse: vi.fn(),
}));

import { requireAdminResponse } from '@/lib/auth/require-admin';

/** Shared mock for `requireAdminResponse`. Import this module before importing the route handler under test. */
export const mockRequireAdminResponse = vi.mocked(requireAdminResponse);
