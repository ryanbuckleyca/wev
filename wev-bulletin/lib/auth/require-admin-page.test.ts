import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { redirectMock, mockRequireAdminSession } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  mockRequireAdminSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('./require-admin', () => ({
  requireAdminSession: mockRequireAdminSession,
}));

import { requireAdminPage } from './require-admin-page';

describe('requireAdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the user for admins', async () => {
    const user = { id: 'admin-1' };
    mockRequireAdminSession.mockResolvedValue({ ok: true, user });

    await expect(requireAdminPage('en')).resolves.toBe(user);
  });

  it('redirects non-admins to locale home', async () => {
    mockRequireAdminSession.mockResolvedValue({ ok: false, response: { status: 403 } });

    await expect(requireAdminPage('fr')).rejects.toThrow('redirect:/fr');
  });

  it('redirects unauthenticated users to login', async () => {
    mockRequireAdminSession.mockResolvedValue({ ok: false, response: { status: 401 } });

    await expect(requireAdminPage('en')).rejects.toThrow('redirect:/en/login');
  });
});
