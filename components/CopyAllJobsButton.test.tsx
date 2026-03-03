import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CopyAllJobsButton from './CopyAllJobsButton'
import type { JobPosting } from '@/lib/supabase'

const originalNavigator = global.navigator

describe('CopyAllJobsButton', () => {
  const writeTextMock = vi.fn()

  beforeEach(() => {
    // Mock navigator.clipboard. We intentionally exercise the "plain text"
    // fallback path so we don't couple tests to ClipboardItem/Blob internals.
    ;(global as any).navigator = {
      ...originalNavigator,
      clipboard: {
        writeText: writeTextMock,
      },
    }
    writeTextMock.mockReset()
    ;(global as any).ClipboardItem = vi.fn(() => {
      throw new Error('ClipboardItem not supported in test environment')
    })
  })

  afterEach(() => {
    ;(global as any).navigator = originalNavigator
    ;(global as any).ClipboardItem = undefined
    vi.clearAllMocks()
  })

  const makeJob = (overrides: Partial<JobPosting>): JobPosting =>
    ({
      id: overrides.id ?? '1',
      created_at: overrides.created_at ?? new Date().toISOString(),
      organization: overrides.organization ?? 'Org',
      job_title: overrides.job_title ?? 'Title',
      location: overrides.location ?? 'Location',
      summary: overrides.summary ?? null,
      date_posted: overrides.date_posted ?? new Date().toISOString(),
      wage: overrides.wage ?? null,
      listing_url: overrides.listing_url ?? null,
      source: overrides.source ?? 'source',
      employment_type: overrides.employment_type ?? 'Full-time',
      work_type: overrides.work_type ?? 'In-person',
      municipality: overrides.municipality ?? 'Municipality',
      province: overrides.province ?? 'Province',
      is_sse: overrides.is_sse ?? false,
    } as JobPosting)

  it('copies only the provided jobs in the given order', async () => {
    const user = userEvent.setup()

    const jobA = makeJob({
      id: 'a',
      organization: 'Alpha Org',
      job_title: 'First Role',
      date_posted: '2024-01-01T00:00:00Z',
    })
    const jobB = makeJob({
      id: 'b',
      organization: 'Beta Org',
      job_title: 'Second Role',
      date_posted: '2024-01-02T00:00:00Z',
    })

    // Simulate "filtered & sorted" jobs by providing them in the desired order
    const filteredAndSortedJobs = [jobB, jobA]

    render(<CopyAllJobsButton jobs={filteredAndSortedJobs} />)

    const button = screen.getByRole('button', { name: 'Copy All Jobs' })
    await user.click(button)

    expect(writeTextMock).toHaveBeenCalledTimes(1)
    const plainText = writeTextMock.mock.calls[0][0] as string

    // Ensures we only copy the passed-in jobs, in the same order
    const idxBeta = plainText.indexOf('Who: Beta Org')
    const idxAlpha = plainText.indexOf('Who: Alpha Org')

    expect(idxBeta).toBeGreaterThanOrEqual(0)
    expect(idxAlpha).toBeGreaterThanOrEqual(0)
    expect(idxBeta).toBeLessThan(idxAlpha)
  })

  it('renders nothing when there are no jobs', () => {
    const { container } = render(<CopyAllJobsButton jobs={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

