import { vi } from 'vitest';

/**
 * Shared `createClient` mock for `@/lib/supabase/server` (Vitest hoists `vi.mock`).
 * Import this module before route handlers that depend on `createClient`.
 */
const mockCreateClient = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}));

export { mockCreateClient };
