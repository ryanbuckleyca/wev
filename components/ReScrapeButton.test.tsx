import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import ReScrapeButton from './ReScrapeButton'

vi.mock('@/lib/toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

import notify from '@/lib/toast'

const originalFetch = global.fetch
const STORAGE_KEY = 'wev-scrape-state'

// ─── fetch helpers ───────────────────────────────────────────────────────────

const triggerOk = () =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)

const triggerFail = (msg: string) =>
  Promise.resolve({
    ok: false,
    json: () => Promise.resolve({ error: msg }),
  } as unknown as Response)

const pollRunning = () =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ running: true, status: 'in_progress', completed: false }),
  } as unknown as Response)

const pollSuccess = () =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({ running: false, completed: true, success: true, conclusion: 'success' }),
  } as unknown as Response)

const pollFailure = () =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({ running: false, completed: true, success: false, conclusion: 'failure' }),
  } as unknown as Response)

const pollApiError = (msg = 'Unauthorized') =>
  Promise.resolve({
    ok: false,
    statusText: msg,
    json: () => Promise.resolve({ error: msg }),
  } as unknown as Response)

const pollNotFound = () =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ running: false, completed: false }),
  } as unknown as Response)

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Trigger a button click. We use fireEvent rather than userEvent here because
 * userEvent v14 wraps interactions in `act(async () => ...)`, which in React 18
 * waits for all pending async work — including intentionally never-resolving
 * fetch mocks used in some tests. Since we're testing the async polling state
 * machine (not click semantics), fireEvent is the right tool.
 */
const clickButton = () =>
  act(() => { fireEvent.click(screen.getByRole('button')) })

/** Flush pending microtasks so awaited fetch mocks resolve. */
const flushPromises = () => act(async () => { await Promise.resolve() })

/** Advance fake timers AND drain all resulting microtasks. */
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

// ─── tests ───────────────────────────────────────────────────────────────────

describe('ReScrapeButton', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.removeItem(STORAGE_KEY)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
    global.fetch = originalFetch
    localStorage.removeItem(STORAGE_KEY)
  })

  it('renders "Re-scrape Data" and is enabled initially', () => {
    render(<ReScrapeButton onComplete={() => {}} />)
    const btn = screen.getByRole('button', { name: 'Re-scrape Data' })
    expect(btn).toBeVisible()
    expect(btn).toBeEnabled()
  })

  it('shows "Starting..." and disables the button immediately after click', async () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) // hang forever

    render(<ReScrapeButton onComplete={() => {}} />)
    await clickButton()

    const btn = screen.getByRole('button', { name: 'Starting...' })
    expect(btn).toBeVisible()
    expect(btn).toBeDisabled()
  })

  it('shows error toast and re-enables if the workflow trigger request fails', async () => {
    global.fetch = vi.fn().mockReturnValue(triggerFail('Bad credentials'))

    render(<ReScrapeButton onComplete={() => {}} />)
    await clickButton()
    await flushPromises()

    expect(notify.error).toHaveBeenCalledWith('Bad credentials')
    const btn = screen.getByRole('button', { name: 'Re-scrape Data' })
    expect(btn).toBeVisible()
    expect(btn).toBeEnabled()
  })

  it('shows "Queued..." after a successful trigger while waiting for initial delay', async () => {
    global.fetch = vi.fn()
      .mockReturnValueOnce(triggerOk())
      .mockReturnValue(new Promise(() => {})) // poll hangs

    render(<ReScrapeButton onComplete={() => {}} />)
    await clickButton()
    await flushPromises()

    expect(screen.getByRole('button', { name: 'Queued...' })).toBeVisible()
  })

  it('transitions Queued → Running → complete and calls onComplete on success', async () => {
    const onComplete = vi.fn()

    global.fetch = vi.fn()
      .mockReturnValueOnce(triggerOk())
      .mockReturnValueOnce(pollRunning())   // first poll
      .mockReturnValueOnce(pollSuccess())   // second poll

    render(<ReScrapeButton onComplete={onComplete} />)
    await clickButton()
    await flushPromises()

    expect(screen.getByRole('button', { name: 'Queued...' })).toBeVisible()

    // Initial 5 s delay before first poll
    await tick(5_000)
    expect(screen.getByRole('button', { name: 'Running...' })).toBeVisible()

    // 15 s to next poll
    await tick(15_000)

    expect(onComplete).toHaveBeenCalledOnce()
    expect(notify.success).toHaveBeenCalledWith(expect.stringContaining('Re-scrape complete'))
    const btn = screen.getByRole('button', { name: 'Re-scrape Data' })
    expect(btn).toBeVisible()
    expect(btn).toBeEnabled()
  })

  it('stays "Queued..." for extra ticks when run not visible yet, then resolves', async () => {
    const onComplete = vi.fn()

    global.fetch = vi.fn()
      .mockReturnValueOnce(triggerOk())
      .mockReturnValueOnce(pollNotFound())  // not in API yet
      .mockReturnValueOnce(pollSuccess())   // appears on second poll

    render(<ReScrapeButton onComplete={onComplete} />)
    await clickButton()
    await flushPromises()

    await tick(5_000)
    expect(screen.getByRole('button', { name: 'Queued...' })).toBeVisible()

    await tick(15_000)
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('shows error and resets on workflow failure conclusion', async () => {
    const onComplete = vi.fn()

    global.fetch = vi.fn()
      .mockReturnValueOnce(triggerOk())
      .mockReturnValueOnce(pollFailure())

    render(<ReScrapeButton onComplete={onComplete} />)
    await clickButton()
    await flushPromises()
    await tick(5_000)

    expect(onComplete).not.toHaveBeenCalled()
    expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('failure'))
    const btn = screen.getByRole('button', { name: 'Re-scrape Data' })
    expect(btn).toBeVisible()
    expect(btn).toBeEnabled()
  })

  it('shows error, stops polling, and resets on non-OK status API response', async () => {

    const fetchMock = vi.fn()
      .mockReturnValueOnce(triggerOk())
      .mockReturnValueOnce(pollApiError('Unauthorized'))
    global.fetch = fetchMock

    render(<ReScrapeButton onComplete={() => {}} />)
    await clickButton()
    await flushPromises()
    await tick(5_000)

    expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'))
    const btn = screen.getByRole('button', { name: 'Re-scrape Data' })
    expect(btn).toBeVisible()
    expect(btn).toBeEnabled()

    // No further polls should fire
    const callCount = fetchMock.mock.calls.length
    await tick(15_000)
    expect(fetchMock).toHaveBeenCalledTimes(callCount)
  })

  it('does not throw or call setState after unmount', async () => {

    global.fetch = vi.fn()
      .mockReturnValueOnce(triggerOk())
      .mockReturnValueOnce(pollRunning())

    const { unmount } = render(<ReScrapeButton onComplete={() => {}} />)
    await clickButton()
    await flushPromises()
    await tick(5_000) // first poll fires, returns running, schedules next

    unmount() // abort controller fires, timeout is cleared

    // Advancing timers after unmount should be a no-op — no errors thrown
    await tick(15_000)
    expect(true).toBe(true) // just ensuring no throw
  })

  // ─── localStorage persistence tests ──────────────────────────────────────

  it('persists scrape state to localStorage after successful trigger', async () => {
    global.fetch = vi.fn()
      .mockReturnValueOnce(triggerOk())
      .mockReturnValue(new Promise(() => {}))

    render(<ReScrapeButton onComplete={() => {}} />)
    await clickButton()
    await flushPromises()

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored).toMatchObject({ status: 'queued' })
    expect(stored.triggeredAt).toBeDefined()
    expect(stored.startedAt).toBeGreaterThan(0)
  })

  it('clears localStorage on successful completion', async () => {
    global.fetch = vi.fn()
      .mockReturnValueOnce(triggerOk())
      .mockReturnValueOnce(pollSuccess())

    render(<ReScrapeButton onComplete={() => {}} />)
    await clickButton()
    await flushPromises()
    await tick(5_000)

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('clears localStorage on failure', async () => {
    global.fetch = vi.fn()
      .mockReturnValueOnce(triggerOk())
      .mockReturnValueOnce(pollFailure())

    render(<ReScrapeButton onComplete={() => {}} />)
    await clickButton()
    await flushPromises()
    await tick(5_000)

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('clears localStorage when trigger request fails', async () => {
    global.fetch = vi.fn().mockReturnValue(triggerFail('Unauthorized'))

    render(<ReScrapeButton onComplete={() => {}} />)
    await clickButton()
    await flushPromises()

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('resumes polling from localStorage on mount and completes', async () => {
    const onComplete = vi.fn()
    const saved = {
      triggeredAt: new Date(Date.now() - 30_000).toISOString(),
      startedAt: Date.now(),
      status: 'queued',
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))

    global.fetch = vi.fn().mockReturnValueOnce(pollSuccess())

    render(<ReScrapeButton onComplete={onComplete} />)

    // Button should show loading state immediately from localStorage
    expect(screen.getByRole('button')).toBeDisabled()

    await flushPromises()

    expect(onComplete).toHaveBeenCalledOnce()
    expect(notify.success).toHaveBeenCalledWith(expect.stringContaining('Re-scrape complete'))
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('resumes with "Running..." when localStorage has running status', async () => {
    const saved = {
      triggeredAt: new Date(Date.now() - 30_000).toISOString(),
      startedAt: Date.now(),
      status: 'running',
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))

    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(<ReScrapeButton onComplete={() => {}} />)

    expect(screen.getByRole('button', { name: 'Running...' })).toBeDisabled()
  })

  it('discards expired localStorage state and renders idle', () => {
    const expired = {
      triggeredAt: new Date(Date.now() - 30_000).toISOString(),
      startedAt: Date.now() - 11 * 60_000, // older than MAX_WAIT_MS
      status: 'running',
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expired))

    render(<ReScrapeButton onComplete={() => {}} />)

    const btn = screen.getByRole('button', { name: 'Re-scrape Data' })
    expect(btn).toBeEnabled()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
