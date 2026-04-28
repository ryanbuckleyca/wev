import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@/test-utils';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import { useProfile } from '@/contexts/ProfileContext';
import { MAX_PROFILE_SKILLS } from '@/lib/hooks/useProfileForm';
import notify from '@/lib/toast';
import ProfilePage from './page';

/** Matches `messages/en.json` `profile.skillsPlaceholderShort` (modal search; Unicode ellipsis). */
const SKILLS_SEARCH_PLACEHOLDER = 'Search to add skills…';

vi.mock('@/lib/hooks/useRequireAuth', () => ({
  useRequireAuth: vi.fn(),
}));

vi.mock('@/contexts/ProfileContext', () => ({
  useProfile: vi.fn(),
}));

vi.mock('@/lib/toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
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

const baseProfile = {
  id: 'user-1',
  full_name: 'Test User',
  bio: 'Bio',
  values: [],
  skills: ['uri-1'],
  work_types: ['remote'],
  created_at: '2026-03-06T00:00:00.000Z',
  updated_at: '2026-03-06T00:00:00.000Z',
};

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('ProfilePage skills integration', () => {
  const mockUpdateProfile = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRequireAuth).mockReturnValue({
      user: { id: 'user-1', email: 'user@example.com' },
      loading: false,
    } as never);
    vi.mocked(useProfile).mockReturnValue({
      profile: baseProfile,
      loading: false,
      error: null,
      isUpdating: false,
      refresh: vi.fn(),
      updateProfile: mockUpdateProfile,
    } as never);
    mockUpdateProfile.mockResolvedValue(baseProfile);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('hydrates existing skills on mount via /api/skills/by-uri', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/skills/by-uri?uris=uri-1&locale=en')) {
        return jsonResponse({
          skills: [
            {
              concept_uri: 'uri-1',
              term: 'Data analysis',
              definition: 'Analyze structured datasets.',
              scope_note: null,
              skill_type: 'knowledge',
              reuse_level: 'cross-sector',
            },
          ],
        });
      }
      if (url.startsWith('/api/skills/all?locale=en')) {
        return jsonResponse({
          skills: [
            {
              uri: 'uri-1',
              term: 'Data analysis',
              definition: 'Analyze structured datasets.',
              type: 'knowledge',
              level: 'cross-sector',
              aliases: [],
            },
          ],
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProfilePage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/skills/by-uri?uris=uri-1&locale=en');
    });
    expect(await screen.findByText('Data analysis')).toBeInTheDocument();
  });

  it('removing a chip updates form data and save payload', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/skills/by-uri?uris=uri-1&locale=en')) {
        return jsonResponse({
          skills: [
            {
              concept_uri: 'uri-1',
              term: 'Data analysis',
              definition: 'Analyze structured datasets.',
              scope_note: null,
              skill_type: 'knowledge',
              reuse_level: 'cross-sector',
            },
          ],
        });
      }
      if (url.startsWith('/api/skills/all?locale=en')) {
        return jsonResponse({
          skills: [
            {
              uri: 'uri-1',
              term: 'Data analysis',
              definition: 'Analyze structured datasets.',
              type: 'knowledge',
              level: 'cross-sector',
              aliases: [],
            },
          ],
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProfilePage />);

    const removeButton = await screen.findByRole('button', {
      name: /remove data analysis/i,
    });
    screen.debug(); await user.click(removeButton);
    await user.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalled();
    });
    expect(mockUpdateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        skills: [],
      }),
    );
  });

  it('saves concept_uri[] (not labels) after selecting a search result', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/skills/by-uri?uris=uri-1&locale=en')) {
        return jsonResponse({
          skills: [
            {
              concept_uri: 'uri-1',
              term: 'Data analysis',
              definition: 'Analyze structured datasets.',
              scope_note: null,
              skill_type: 'knowledge',
              reuse_level: 'cross-sector',
            },
          ],
        });
      }
      if (url.startsWith('/api/skills/all?locale=en')) {
        return jsonResponse({
          skills: [
            {
              uri: 'uri-1',
              term: 'Data analysis',
              definition: 'Analyze structured datasets.',
              type: 'knowledge',
              level: 'cross-sector',
              aliases: [],
            },
            {
              uri: 'uri-2',
              term: 'Data governance',
              definition: 'Manage data controls.',
              type: 'skill',
              level: 'transversal',
              aliases: ['govern data'],
            },
          ],
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProfilePage />);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).match(/^\/api\/skills\/all\?locale=en&cb=/),
      );
      expect(call).toBeDefined();
    });

    await user.click(screen.getByRole('button', { name: /search and add skills/i }));
    const searchInput = await screen.findByPlaceholderText(SKILLS_SEARCH_PLACEHOLDER);
    await user.type(searchInput, 'da');
    await user.click(await screen.findByRole('option', { name: /Data governance/i }));
    await user.click(screen.getByRole('button', { name: /done/i }));
    await user.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalled();
    });

    const savePayload = mockUpdateProfile.mock.calls[
      mockUpdateProfile.mock.calls.length - 1
    ][0] as {
      skills: string[];
    };
    expect(new Set(savePayload.skills)).toEqual(new Set(['uri-1', 'uri-2']));
  });

  it('blocks save and shows error when skills exceed limit', async () => {
    const user = userEvent.setup();
    const profileAtMaxSkills = {
      ...baseProfile,
      skills: Array.from({ length: MAX_PROFILE_SKILLS }, (_, i) => `uri-${i + 1}`),
    };
    vi.mocked(useProfile).mockReturnValue({
      profile: profileAtMaxSkills,
      loading: false,
      error: null,
      isUpdating: false,
      refresh: vi.fn(),
      updateProfile: mockUpdateProfile,
    } as never);

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/skills/by-uri')) {
        return jsonResponse({
          skills: Array.from({ length: MAX_PROFILE_SKILLS }, (_, i) => ({
            concept_uri: `uri-${i + 1}`,
            term: `Skill ${i + 1}`,
            definition: null,
            scope_note: null,
            skill_type: 'skill',
            reuse_level: 'cross-sector',
          })),
        });
      }
      if (url.startsWith('/api/skills/all?locale=en')) {
        return jsonResponse({
          skills: [
            ...Array.from({ length: MAX_PROFILE_SKILLS }, (_, i) => ({
              uri: `uri-${i + 1}`,
              term: `Skill ${i + 1}`,
              definition: null,
              type: 'skill',
              level: 'cross-sector',
              aliases: [] as string[],
            })),
            {
              uri: 'uri-11',
              term: 'Extra skill',
              definition: null,
              type: 'skill',
              level: 'cross-sector',
              aliases: [] as string[],
            },
          ],
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ProfilePage />);

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/skills/all'))).toBe(true),
    );

    await user.click(screen.getByRole('button', { name: /search and add skills/i }));
    const searchInput = await screen.findByPlaceholderText(SKILLS_SEARCH_PLACEHOLDER);
    await user.type(searchInput, 'Extra');
    await user.click(await screen.findByRole('option', { name: /Extra skill/i }));
    await user.click(screen.getByRole('button', { name: /done/i }));
    await user.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });
    expect(notify.error).toHaveBeenCalled();
  });
});
