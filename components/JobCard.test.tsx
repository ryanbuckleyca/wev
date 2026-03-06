import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'
import JobCard from './JobCard'
import type { JobPosting } from '@/lib/supabase'
import { MOCK_AUTH_ANON, MOCK_AUTH_USER, mockRouter } from '@/test-stubs/constants'

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

const BOOKMARK_LABEL = 'Bookmark job'
const COLLAPSE_LABEL = 'Collapse job details'
const EXPAND_LABEL = 'Expand job details'
const SSE_LABEL = 'Mark as SSE job'

function renderJobCard(overrides: Partial<Parameters<typeof JobCard>[0]> = {}) {
  const props = {
    job: defaultJob,
    isAdmin: false,
    onSseToggle: () => {},
    updatingId: null,
    initialExpanded: true,
    ...overrides,
  }
  return render(<JobCard {...props} />)
}

describe('JobCard', () => {
  it('renders job details when the card is expanded', () => {
    mockUseAuth.mockReturnValue(MOCK_AUTH_ANON as never)
    mockUseRouter.mockReturnValue(mockRouter() as never)

    renderJobCard()

    expect(screen.getByText('Green Tech Co')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Software Engineer' })).toBeVisible()
    expect(screen.getByText('Ottawa, ON')).toBeVisible()
    expect(screen.getByText('Build software for a sustainable future.')).toBeVisible()
    expect(screen.getByText('$90,000 – $110,000')).toBeVisible()
  })

  it('shows a bookmark button and a collapse button', () => {
    mockUseAuth.mockReturnValue(MOCK_AUTH_ANON as never)
    mockUseRouter.mockReturnValue(mockRouter() as never)

    renderJobCard()

    expect(screen.getByRole('button', { name: BOOKMARK_LABEL })).toBeVisible()
    expect(screen.getByRole('button', { name: COLLAPSE_LABEL })).toBeVisible()
  })

  it('collapses and expands the card body when the toggle button is clicked', async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue(MOCK_AUTH_ANON as never)
    mockUseRouter.mockReturnValue(mockRouter() as never)

    renderJobCard()

    const collapseBtn = screen.getByRole('button', { name: COLLAPSE_LABEL })
    await user.click(collapseBtn)

    expect(screen.getByRole('button', { name: EXPAND_LABEL })).toBeVisible()
  })

  it('redirects an unauthenticated user to /login when clicking bookmark', async () => {
    const user = userEvent.setup()
    const mockPush = vi.fn()
    mockUseAuth.mockReturnValue(MOCK_AUTH_ANON as never)
    mockUseRouter.mockReturnValue({ push: mockPush, replace: vi.fn() } as never)

    renderJobCard()

    await user.click(screen.getByRole('button', { name: BOOKMARK_LABEL }))

    expect(mockPush).toHaveBeenCalledWith('/login')
  })

  it('toggles the bookmark state for an authenticated user', async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue(MOCK_AUTH_USER as never)
    mockUseRouter.mockReturnValue(mockRouter() as never)
    mockCreateClient.mockReturnValue(makeSupabaseClient() as never)

    renderJobCard({ initialBookmarked: false })

    await user.click(screen.getByRole('button', { name: BOOKMARK_LABEL }))

    expect(screen.getByRole('button', { name: 'Bookmarked (click to remove)' })).toBeVisible()
  })

  it('shows the SSE toggle button for admin users', () => {
    mockUseAuth.mockReturnValue(MOCK_AUTH_ANON as never)
    mockUseRouter.mockReturnValue(mockRouter() as never)

    renderJobCard({ isAdmin: true })

    expect(screen.getByRole('button', { name: SSE_LABEL })).toBeVisible()
  })

  it('does not show the SSE toggle button for non-admin users', () => {
    mockUseAuth.mockReturnValue(MOCK_AUTH_ANON as never)
    mockUseRouter.mockReturnValue(mockRouter() as never)

    renderJobCard()

    expect(screen.queryByRole('button', { name: SSE_LABEL })).not.toBeInTheDocument()
  })

  it('shows the match score and value pills for a logged-in user with a match', () => {
    mockUseAuth.mockReturnValue(MOCK_AUTH_USER as never)
    mockUseRouter.mockReturnValue(mockRouter() as never)

    renderJobCard({
      job: { ...defaultJob, values: ['Advancement'] },
      match: { score: 0.8, shared_values: ['Advancement'] },
    })

    expect(screen.getByText('80% match:')).toBeVisible()
  })
})
