import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test-utils';

const { mockBulletinPageClient, mockGetRequestUser, mockFetchUserRoles, mockFetchServerBulletinJobs } =
  vi.hoisted(() => ({
    mockBulletinPageClient: vi.fn(),
    mockGetRequestUser: vi.fn(),
    mockFetchUserRoles: vi.fn(),
    mockFetchServerBulletinJobs: vi.fn(),
  }));

vi.mock('@/components/BulletinPageClient', () => ({
  default: (props: unknown) => {
    mockBulletinPageClient(props);
    return null;
  },
}));

vi.mock('@/lib/auth/request-user', () => ({
  getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/auth/server-user-roles', () => ({
  fetchUserRolesFromService: mockFetchUserRoles,
}));

vi.mock('@/lib/auth', () => ({
  rolesIncludeAdmin: (roles: string[]) => roles.includes('admin'),
}));

vi.mock('@/lib/bulletin/server-data', () => ({
  fetchServerBulletinJobs: mockFetchServerBulletinJobs,
}));

vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
  },
}));

vi.mock('@/lib/resolve-skill-labels', () => ({
  parseLocale: (locale: string) => (locale === 'fr' ? 'fr' : 'en'),
}));

describe('BulletinDataContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchServerBulletinJobs.mockResolvedValue({
      jobs: [],
      total: 0,
      lastScrapeTime: null,
      skillLabels: {},
    });
  });

  it('defers user meta hydration and renders with server jobs payload', async () => {
    mockGetRequestUser.mockResolvedValue({ ok: true, user: { id: 'user-1' } });
    mockFetchUserRoles.mockResolvedValue({ ok: true, roles: ['admin'] });

    const { BulletinDataContainer } = await import('./page');
    const output = await BulletinDataContainer({ parsedLocale: 'en' });
    render(output);

    expect(mockFetchServerBulletinJobs).toHaveBeenCalledWith('en');
    expect(mockFetchUserRoles).toHaveBeenCalledWith('user-1');

    const props = mockBulletinPageClient.mock.calls[0][0] as Record<string, unknown>;
    expect(props.initialUserId).toBe('user-1');
    expect(props.isLoggedIn).toBe(true);
    expect(props.isAdmin).toBe(true);
    expect(props.initialMatchData).toBeUndefined();
    expect(props.initialBookmarkedJobIds).toBeUndefined();
    expect(props.initialProfile).toBeUndefined();
  });

  it('skips role lookup when request is anonymous', async () => {
    mockGetRequestUser.mockResolvedValue({ ok: false, authError: null });

    const { BulletinDataContainer } = await import('./page');
    const output = await BulletinDataContainer({ parsedLocale: 'fr' });
    render(output);

    expect(mockFetchServerBulletinJobs).toHaveBeenCalledWith('fr');
    expect(mockFetchUserRoles).not.toHaveBeenCalled();

    const props = mockBulletinPageClient.mock.calls[0][0] as Record<string, unknown>;
    expect(props.initialUserId).toBeNull();
    expect(props.isLoggedIn).toBe(false);
    expect(props.isAdmin).toBe(false);
  });
});
