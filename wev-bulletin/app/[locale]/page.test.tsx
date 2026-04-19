import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@/test-utils';
import { useEffect, useState, type ReactNode } from 'react';
import { MOCK_AUTH_USER } from '@/test-stubs/constants';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/contexts/ProfileContext', () => ({
  useProfile: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    prefetch,
    ...props
  }: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
  }) => {
    void prefetch;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock('nuqs', async () => {
  const React = await import('react');

  function makeParser<T>(defaultValue?: T) {
    return {
      defaultValue,
      withDefault: (value: T) => makeParser(value),
    };
  }

  return {
    parseAsString: makeParser(''),
    parseAsBoolean: makeParser(false),
    parseAsInteger: makeParser(0),
    parseAsStringLiteral: (values: string[]) => makeParser(values?.[0]),
    parseAsArrayOf: () => makeParser([] as string[]),
    useQueryState: (key: string, parser?: { defaultValue?: unknown }) => {
      const initial = Array.isArray(parser?.defaultValue)
        ? [...parser.defaultValue]
        : parser?.defaultValue;
      const [value, setValue] = React.useState(initial);
      const setter = (next: unknown) => {
        setValue((prev: unknown) =>
          typeof next === 'function' ? (next as (p: unknown) => unknown)(prev) : next,
        );
      };
      return [value, setter] as const;
    },
  };
});

import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useSearchParams } from 'next/navigation';

const mockUseAuth = vi.mocked(useAuth);
const mockUseProfile = vi.mocked(useProfile);
const mockUseSearchParams = vi.mocked(useSearchParams);
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

const profileWithWorkType = {
  id: 'user-1',
  full_name: 'Test User',
  bio: null,
  values: [],
  skills: [],
  work_types: ['hybrid'],
  profile_photo_url: null,
  created_at: '2026-03-06T00:00:00.000Z',
  updated_at: '2026-03-06T00:00:00.000Z',
};

describe('Home page work type defaults', () => {
  beforeAll(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  beforeEach(() => {
    mockUseAuth.mockReturnValue(MOCK_AUTH_USER as never);
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>,
    );

    mockUseProfile.mockImplementation(() => {
      const [loading, setLoading] = useState(true);
      useEffect(() => {
        setLoading(false);
      }, []);

      if (loading) {
        return {
          profile: null,
          loading: true,
          error: null,
          isUpdating: false,
          refresh: () => Promise.resolve(),
          updateProfile: () => Promise.resolve(null),
        } as never;
      }

      return {
        profile: profileWithWorkType,
        loading: false,
        error: null,
        isUpdating: false,
        refresh: () => Promise.resolve(),
        updateProfile: () => Promise.resolve(null),
      } as never;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('adds the profile work type to default filters after the profile loads', async () => {
    // page.tsx is now an async Server Component that can't be rendered in unit
    // tests. We test BulletinPageClient directly with server-provided initial data.
    const { default: BulletinPageClient } = await import('@/components/BulletinPageClient');

    render(
      <BulletinPageClient
        initialJobs={[]}
        initialScrapeTime={null}
        initialSkillLabels={{}}
        initialUserId="user-1"
        isLoggedIn={true}
        isAdmin={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove Hybrid' })).toBeVisible();
    });
  });
});
