import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test-utils';

const { mockBulletinPageClient, mockFetchServerBulletinJobs } = vi.hoisted(() => ({
  mockBulletinPageClient: vi.fn(),
  mockFetchServerBulletinJobs: vi.fn(),
}));

vi.mock('@/components/BulletinPageClient', () => ({
  default: (props: unknown) => {
    mockBulletinPageClient(props);
    return null;
  },
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
      filterOptions: {},
    });
  });

  it('renders anonymous SSR shell with server jobs payload', async () => {
    const { BulletinDataContainer } = await import('./page');
    const output = await BulletinDataContainer({ parsedLocale: 'en' });
    render(output);

    expect(mockFetchServerBulletinJobs).toHaveBeenCalledWith('en');

    const props = mockBulletinPageClient.mock.calls[0][0] as Record<string, unknown>;
    expect(props.initialUserId).toBeNull();
    expect(props.isLoggedIn).toBe(false);
    expect(props.isAdmin).toBe(false);
    expect(props.initialMatchData).toBeUndefined();
    expect(props.initialBookmarkedJobIds).toBeUndefined();
    expect(props.initialProfile).toBeUndefined();
  });

  it('loads French locale jobs for fr shell', async () => {
    const { BulletinDataContainer } = await import('./page');
    const output = await BulletinDataContainer({ parsedLocale: 'fr' });
    render(output);

    expect(mockFetchServerBulletinJobs).toHaveBeenCalledWith('fr');

    const props = mockBulletinPageClient.mock.calls[0][0] as Record<string, unknown>;
    expect(props.initialUserId).toBeNull();
    expect(props.isLoggedIn).toBe(false);
    expect(props.isAdmin).toBe(false);
  });
});
