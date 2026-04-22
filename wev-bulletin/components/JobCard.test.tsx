import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import JobCard from './JobCard';
import type { JobPosting } from '@/lib/supabase';
import { mockRouter } from '@/test-stubs/constants';

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@lineiconshq/react-lineicons', () => vi.importActual('./test-utils/lineicons-mock.ts'));

import { createClient } from '@/lib/supabase/client';
import { useRouter } from '@/i18n/navigation';

const mockCreateClient = vi.mocked(createClient);
const mockUseRouter = vi.mocked(useRouter);

const defaultJob: JobPosting = {
  id: 'job-1',
  job_title: 'Software Engineer',
  organization: 'Green Tech Co',
  location: 'Ottawa, ON',
  municipality: 'Ottawa',
  province: 'ON',
  work_type: 'remote',
  date_posted: '2026-01-15T00:00:00Z',
  close_date: null,
  wage: '$90,000 – $110,000',
  listing_url: 'https://example.com/jobs/1',
  summary: 'Build software for a sustainable future.',
  is_sse: false,
  values: [],
};

function makeSupabaseClient() {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    }),
  };
}

const BOOKMARK_LABEL = 'Bookmark job';
const COLLAPSE_LABEL = 'Collapse job details';
const EXPAND_LABEL = 'Expand job details';
const SSE_LABEL = 'Mark as SSE job';

function renderJobCard(overrides: Partial<Parameters<typeof JobCard>[0]> = {}) {
  const props = {
    job: defaultJob,
    isAdmin: false,
    userId: null,
    profile: null,
    onSseToggle: () => {},
    updatingId: null,
    initialExpanded: true,
    ...overrides,
  };
  return render(<JobCard {...props} />);
}

describe('JobCard', () => {
  it('renders job details when the card is expanded', () => {
    mockUseRouter.mockReturnValue(mockRouter() as never);

    renderJobCard();

    expect(screen.getByText('Green Tech Co')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Software Engineer' })).toBeVisible();
    expect(screen.getByText('Ottawa, ON')).toBeVisible();
    expect(screen.getByText('Build software for a sustainable future.')).toBeVisible();
    expect(screen.getByText('$90,000 – $110,000')).toBeVisible();
  });

  it('shows a bookmark button and a collapse button', () => {
    mockUseRouter.mockReturnValue(mockRouter() as never);

    renderJobCard();

    expect(screen.getByRole('button', { name: BOOKMARK_LABEL })).toBeVisible();
    expect(screen.getByRole('button', { name: COLLAPSE_LABEL })).toBeVisible();
  });

  it('collapses and expands the card body when the toggle button is clicked', async () => {
    const user = userEvent.setup();
    mockUseRouter.mockReturnValue(mockRouter() as never);

    renderJobCard();

    const collapseBtn = screen.getByRole('button', { name: COLLAPSE_LABEL });
    await user.click(collapseBtn);

    expect(screen.getByRole('button', { name: EXPAND_LABEL })).toBeVisible();
  });

  it('redirects an unauthenticated user to /login when clicking bookmark', async () => {
    const user = userEvent.setup();
    const mockPush = vi.fn();
    mockUseRouter.mockReturnValue({ push: mockPush, replace: vi.fn() } as never);

    renderJobCard();

    await user.click(screen.getByRole('button', { name: BOOKMARK_LABEL }));

    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('toggles the bookmark state for an authenticated user', async () => {
    const user = userEvent.setup();
    mockUseRouter.mockReturnValue(mockRouter() as never);
    mockCreateClient.mockReturnValue(makeSupabaseClient() as never);

    renderJobCard({ initialBookmarked: false, userId: 'user-1' });

    await user.click(screen.getByRole('button', { name: BOOKMARK_LABEL }));

    expect(screen.getByRole('button', { name: 'Bookmarked (click to remove)' })).toBeVisible();
  });

  it('shows the SSE toggle button for admin users', () => {
    mockUseRouter.mockReturnValue(mockRouter() as never);

    renderJobCard({ isAdmin: true });

    expect(screen.getByRole('button', { name: SSE_LABEL })).toBeVisible();
  });

  it('does not show the SSE toggle button for non-admin users', () => {
    mockUseRouter.mockReturnValue(mockRouter() as never);

    renderJobCard();

    expect(screen.queryByRole('button', { name: SSE_LABEL })).not.toBeInTheDocument();
  });

  it('shows the match score and value pills for a logged-in user with a match', () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        skills: [
          { concept_uri: 'http://data.europa.eu/esco/skill/test-skill', term: 'Test Skill' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    mockUseRouter.mockReturnValue(mockRouter() as never);

    renderJobCard({
      userId: 'user-1',
      job: {
        ...defaultJob,
        values: ['Advancement'],
        skills: ['http://data.europa.eu/esco/skill/test-skill'],
      },
      match: {
        score: 0.8,
        value_score: 0.8,
        skill_score: 0.6,
        shared_values: ['Advancement'],
        shared_skills: ['http://data.europa.eu/esco/skill/test-skill'],
      },
    });

    // Check for the match percentage in the rendered output
    expect(screen.getByText('80%')).toBeVisible();
    // Check for the tooltip button (bookmark button is the only button visible)
    expect(screen.getByRole('button', { name: 'Bookmark job' })).toBeVisible();
    vi.unstubAllGlobals();
  });

  it('shows a loading state for match details while user metadata is fetching', () => {
    mockUseRouter.mockReturnValue(mockRouter() as never);

    renderJobCard({
      userId: 'user-1',
      matchLoading: true,
      job: {
        ...defaultJob,
        values: ['Advancement'],
      },
    });

    expect(screen.getByRole('status')).toBeVisible();
    expect(screen.getByText('Loading...')).toBeVisible();
  });

  it('caps displayed skills to five pills for users', async () => {
    const skills = [
      'skill-one',
      'skill-two',
      'skill-three',
      'skill-four',
      'skill-five',
      'skill-six',
      'skill-seven',
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        skills: skills.map((skill) => ({
          concept_uri: skill,
          term: skill,
        })),
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    mockUseRouter.mockReturnValue(mockRouter() as never);

    renderJobCard({
      userId: 'user-1',
      job: {
        ...defaultJob,
        values: [],
        skills,
      },
      match: {
        score: 0.7,
        value_score: 0,
        skill_score: 0.6,
        shared_values: [],
        shared_skills: ['skill-one', 'skill-two', 'skill-three'],
      },
    });

    // Click the expand button (chevron) within the skills summary pill to expand individual skill pills
    const expandButton = screen.getByRole('button', { name: 'Expand' });

    // Use fake timers to advance the staggered expansion animation (88ms per pill)
    vi.useFakeTimers();
    fireEvent.click(expandButton);

    act(() => {
      vi.advanceTimersByTime(1000); // Ensure all staggers complete
    });

    // When expanded, all skills should be visible (no capping when expanded)
    expect(screen.getByText('skill-one')).toBeVisible();
    expect(screen.getByText('skill-two')).toBeVisible();
    expect(screen.getByText('skill-three')).toBeVisible();
    expect(screen.getByText('skill-four')).toBeVisible();
    expect(screen.getByText('skill-five')).toBeVisible();
    expect(screen.getByText('skill-six')).toBeVisible();
    expect(screen.getByText('skill-seven')).toBeVisible();

    vi.useRealTimers();

    vi.unstubAllGlobals();
  });
});
