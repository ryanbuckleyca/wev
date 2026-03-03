import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CopyAllJobsButton from './CopyAllJobsButton'
import type { JobPosting } from '@/lib/supabase'

const originalClipboard = navigator.clipboard
const originalClipboardItem = (global as any).ClipboardItem

describe('CopyAllJobsButton', () => {
  const writeTextMock = vi.fn()

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })
    writeTextMock.mockReset()
    ;(global as any).ClipboardItem = vi.fn(() => {
      throw new Error('ClipboardItem not supported in test environment')
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    })
    ;(global as any).ClipboardItem = originalClipboardItem
    vi.clearAllMocks()
  })

  const makeJob = (overrides: Partial<JobPosting>): JobPosting => ({
    id: '1',
    job_title: 'Title',
    organization: 'Org',
    location: 'Location',
    municipality: 'Municipality',
    province: 'Province',
    work_type: 'remote',
    date_posted: new Date().toISOString(),
    close_date: null,
    wage: null,
    listing_url: 'https://example.com/job',
    employment_type: 'Full-time',
    summary: null,
    is_sse: false,
    source: 'source',
    ...overrides,
  } satisfies JobPosting)

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

