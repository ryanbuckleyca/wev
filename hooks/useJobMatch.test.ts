import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useJobMatch } from './useJobMatch'
import { MOCK_AUTH_ANON, MOCK_AUTH_USER } from '@/test-stubs/constants'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'

const mockUseAuth = vi.mocked(useAuth)
const mockCreateClient = vi.mocked(createClient)

function makeSupabaseClient(data: unknown, error: unknown = null) {
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  }
  return { from: vi.fn().mockReturnValue(queryBuilder) }
}

const JOB_ID = 'job-1'

describe('useJobMatch', () => {
  it('returns null match and stops loading immediately when there is no user', async () => {
    mockUseAuth.mockReturnValue(MOCK_AUTH_ANON as never)

    const { result } = renderHook(() => useJobMatch(JOB_ID))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.match).toBeNull()
    expect(result.current.matchPercentage).toBe(0)
  })

  it('returns match data fetched from the database when the user is signed in', async () => {
    mockUseAuth.mockReturnValue(MOCK_AUTH_USER as never)
    mockCreateClient.mockReturnValue(
      makeSupabaseClient({ score: 0.75, shared_values: ['sustainability', 'innovation'] }) as never
    )

    const { result } = renderHook(() => useJobMatch(JOB_ID))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.match).toEqual({ score: 0.75, shared_values: ['sustainability', 'innovation'] })
    expect(result.current.matchPercentage).toBe(75)
  })

  it('returns null match when no record exists in the database', async () => {
    mockUseAuth.mockReturnValue(MOCK_AUTH_USER as never)
    mockCreateClient.mockReturnValue(makeSupabaseClient(null) as never)

    const { result } = renderHook(() => useJobMatch(JOB_ID))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.match).toBeNull()
    expect(result.current.matchPercentage).toBe(0)
  })

  it('returns null match when the database query fails', async () => {
    // Suppress the expected console.error the hook logs on DB failure
    vi.spyOn(console, 'error').mockImplementation(() => {})

    mockUseAuth.mockReturnValue(MOCK_AUTH_USER as never)
    mockCreateClient.mockReturnValue(makeSupabaseClient(null, new Error('DB error')) as never)

    const { result } = renderHook(() => useJobMatch(JOB_ID))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.match).toBeNull()
  })

  it('isValueMatched returns true for a shared value and false for a non-shared one', async () => {
    mockUseAuth.mockReturnValue(MOCK_AUTH_USER as never)
    mockCreateClient.mockReturnValue(
      makeSupabaseClient({ score: 0.5, shared_values: ['sustainability'] }) as never
    )

    const { result } = renderHook(() => useJobMatch(JOB_ID))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isValueMatched('sustainability')).toBe(true)
    expect(result.current.isValueMatched('innovation')).toBe(false)
  })
})
