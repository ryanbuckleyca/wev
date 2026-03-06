import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'
import JobCard from './JobCard'
import type { JobPosting } from '@/lib/supabase'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: vi.fn(),
}))

import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from '@/i18n/navigation'

const mockUseAuth = vi.mocked(useAuth)
const mockCreateClient = vi.mocked(createClient)
const mockUseRouter = vi.mocked(useRouter)

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
}

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
  }
}

describe('JobCard', () => {
  it('renders job details when the card is expanded', () => {
    mockUseAuth.mockReturnValue({ user: null, role: 'user', roles: ['user'], loading: false })
    mockUseRouter.mockReturnValue({ push: vi.fn(), replace: vi.fn() } as never)

    render(
      <JobCard
        job={defaultJob}
        isAdmin={false}
        onSseToggle={() => {}}
        updatingId={null}
        initialExpanded
      />
    )

    expect(screen.getByText('Green Tech Co')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Software Engineer' })).toBeVisible()
    expect(screen.getByText('Ottawa, ON')).toBeVisible()
    expect(screen.getByText('Build software for a sustainable future.')).toBeVisible()
    expect(screen.getByText('$90,000 – $110,000')).toBeVisible()
  })

  it('shows a bookmark button and a collapse button', () => {
    mockUseAuth.mockReturnValue({ user: null, role: 'user', roles: ['user'], loading: false })
    mockUseRouter.mockReturnValue({ push: vi.fn(), replace: vi.fn() } as never)

    render(
      <JobCard
        job={defaultJob}
        isAdmin={false}
        onSseToggle={() => {}}
        updatingId={null}
        initialExpanded
      />
    )

    expect(screen.getByRole('button', { name: 'Bookmark job' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Collapse job details' })).toBeVisible()
  })

  it('collapses and expands the card body when the toggle button is clicked', async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue({ user: null, role: 'user', roles: ['user'], loading: false })
    mockUseRouter.mockReturnValue({ push: vi.fn(), replace: vi.fn() } as never)

    render(
      <JobCard
        job={defaultJob}
        isAdmin={false}
        onSseToggle={() => {}}
        updatingId={null}
        initialExpanded
      />
    )

    const collapseBtn = screen.getByRole('button', { name: 'Collapse job details' })
    await user.click(collapseBtn)

    expect(screen.getByRole('button', { name: 'Expand job details' })).toBeVisible()
  })

  it('redirects an unauthenticated user to /login when clicking bookmark', async () => {
    const user = userEvent.setup()
    const mockPush = vi.fn()
    mockUseAuth.mockReturnValue({ user: null, role: 'user', roles: ['user'], loading: false })
    mockUseRouter.mockReturnValue({ push: mockPush, replace: vi.fn() } as never)

    render(
      <JobCard
        job={defaultJob}
        isAdmin={false}
        onSseToggle={() => {}}
        updatingId={null}
        initialExpanded
      />
    )

    await user.click(screen.getByRole('button', { name: 'Bookmark job' }))

    expect(mockPush).toHaveBeenCalledWith('/login')
  })

  it('toggles the bookmark state for an authenticated user', async () => {
    const user = userEvent.setup()
    const fakeUser = { id: 'user-1' }
    mockUseAuth.mockReturnValue({ user: fakeUser as never, role: 'user', roles: ['user'], loading: false })
    mockUseRouter.mockReturnValue({ push: vi.fn(), replace: vi.fn() } as never)
    mockCreateClient.mockReturnValue(makeSupabaseClient() as never)

    render(
      <JobCard
        job={defaultJob}
        isAdmin={false}
        onSseToggle={() => {}}
        updatingId={null}
        initialExpanded
        initialBookmarked={false}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Bookmark job' }))

    expect(screen.getByRole('button', { name: 'Bookmarked (click to remove)' })).toBeVisible()
  })

  it('shows the SSE toggle button for admin users', () => {
    mockUseAuth.mockReturnValue({ user: null, role: 'user', roles: ['user'], loading: false })
    mockUseRouter.mockReturnValue({ push: vi.fn(), replace: vi.fn() } as never)

    render(
      <JobCard
        job={defaultJob}
        isAdmin
        onSseToggle={() => {}}
        updatingId={null}
        initialExpanded
      />
    )

    expect(screen.getByRole('button', { name: 'Mark as SSE job' })).toBeVisible()
  })

  it('does not show the SSE toggle button for non-admin users', () => {
    mockUseAuth.mockReturnValue({ user: null, role: 'user', roles: ['user'], loading: false })
    mockUseRouter.mockReturnValue({ push: vi.fn(), replace: vi.fn() } as never)

    render(
      <JobCard
        job={defaultJob}
        isAdmin={false}
        onSseToggle={() => {}}
        updatingId={null}
        initialExpanded
      />
    )

    expect(screen.queryByRole('button', { name: 'Mark as SSE job' })).not.toBeInTheDocument()
  })

  it('shows the match score and value pills for a logged-in user with a match', () => {
    const fakeUser = { id: 'user-1' }
    mockUseAuth.mockReturnValue({ user: fakeUser as never, role: 'user', roles: ['user'], loading: false })
    mockUseRouter.mockReturnValue({ push: vi.fn(), replace: vi.fn() } as never)

    render(
      <JobCard
        job={{ ...defaultJob, values: ['Advancement'] }}
        isAdmin={false}
        onSseToggle={() => {}}
        updatingId={null}
        initialExpanded
        match={{ score: 0.8, shared_values: ['Advancement'] }}
      />
    )

    expect(screen.getByText('80% match:')).toBeVisible()
  })
})
