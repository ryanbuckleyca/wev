/**
 * Property-based tests for `formatCompensation`
 *
 * Uses parameterized test cases (it.each) to cover a wide range of inputs.
 *
 * Property 7: Display Fallback Invariant
 *   Validates: Requirements 7.2, 11.3, 11.4
 *
 * Property 8: Tilde Invariant
 *   Validates: Requirement 7.3
 *
 * Property 14: Secondary Display Condition
 *   Validates: Requirement 7.4
 */

import { describe, it, expect } from 'vitest'
import { formatCompensation } from './helpers'
import type { JobPosting } from '@/lib/supabase'

const LOCALE = 'en'

// ---------------------------------------------------------------------------
// Property 7: Display Fallback Invariant
// Validates: Requirements 7.2, 11.3, 11.4
// ---------------------------------------------------------------------------

describe('Property 7: Display Fallback Invariant', () => {
  /**
   * When min_value or unit_text is null, formatCompensation returns
   * { isStructured: false, primary: job.wage ?? 'N/A' }
   */

  const fallbackCases: Array<{ label: string; job: Partial<JobPosting>; expectedPrimary: string }> = [
    {
      label: 'min_value=null, unit_text=YEAR, wage set',
      job: { min_value: null, unit_text: 'YEAR', wage: '$60,000/year' },
      expectedPrimary: '$60,000/year',
    },
    {
      label: 'min_value=100, unit_text=null, wage set',
      job: { min_value: 100, unit_text: null, wage: '$60,000/year' },
      expectedPrimary: '$60,000/year',
    },
    {
      label: 'both null, wage set',
      job: { min_value: null, unit_text: null, wage: 'Competitive' },
      expectedPrimary: 'Competitive',
    },
    {
      label: 'min_value=null, unit_text=null, no wage',
      job: { min_value: null, unit_text: null, wage: null },
      expectedPrimary: 'N/A',
    },
    {
      label: 'min_value=null, unit_text=null, wage undefined',
      job: { min_value: null, unit_text: null },
      expectedPrimary: 'N/A',
    },
  ]

  it.each(fallbackCases)('$label → isStructured=false, primary=$expectedPrimary', ({ job, expectedPrimary }) => {
    const result = formatCompensation(job as JobPosting, LOCALE)
    expect(result.isStructured).toBe(false)
    expect(result.primary).toBe(expectedPrimary)
  })
})

// ---------------------------------------------------------------------------
// Property 8: Tilde Invariant
// Validates: Requirement 7.3
// ---------------------------------------------------------------------------

describe('Property 8: Tilde Invariant', () => {
  /**
   * isInferred === true iff unit_text === 'HOUR' and hours_per_week == null
   */

  const tildeCases: Array<{ label: string; job: Partial<JobPosting>; expectedIsInferred: boolean }> = [
    {
      label: 'HOUR + null hours → isInferred=true',
      job: { min_value: 3000, unit_text: 'HOUR', hours_per_week: null },
      expectedIsInferred: true,
    },
    {
      label: 'HOUR + 40 hours → isInferred=false',
      job: { min_value: 3000, unit_text: 'HOUR', hours_per_week: 40 },
      expectedIsInferred: false,
    },
    {
      label: 'HOUR + 35 hours → isInferred=false',
      job: { min_value: 3000, unit_text: 'HOUR', hours_per_week: 35 },
      expectedIsInferred: false,
    },
    {
      label: 'YEAR + null hours → isInferred=false',
      job: { min_value: 6000000, unit_text: 'YEAR', hours_per_week: null },
      expectedIsInferred: false,
    },
    {
      label: 'MONTH + null hours → isInferred=false',
      job: { min_value: 500000, unit_text: 'MONTH', hours_per_week: null },
      expectedIsInferred: false,
    },
  ]

  it.each(tildeCases)('$label', ({ job, expectedIsInferred }) => {
    const result = formatCompensation(job as JobPosting, LOCALE)
    expect(result.isInferred).toBe(expectedIsInferred)
    if (expectedIsInferred) {
      expect(result.primary.startsWith('~')).toBe(true)
    } else if (result.isStructured) {
      expect(result.primary.startsWith('~')).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Property 14: Secondary Display Condition
// Validates: Requirement 7.4
// ---------------------------------------------------------------------------

describe('Property 14: Secondary Display Condition', () => {
  /**
   * secondary is non-null iff unit_text === 'HOUR' and hours_per_week != null
   * and hours_per_week !== PLATFORM_DEFAULT_HOURS_PER_WEEK (40)
   */

  const secondaryCases: Array<{
    label: string
    job: Partial<JobPosting>
    expectSecondary: boolean
  }> = [
    {
      label: 'HOUR + 35h → secondary non-null',
      job: { min_value: 3000, unit_text: 'HOUR', hours_per_week: 35 },
      expectSecondary: true,
    },
    {
      label: 'HOUR + 40h → secondary null',
      job: { min_value: 3000, unit_text: 'HOUR', hours_per_week: 40 },
      expectSecondary: false,
    },
    {
      label: 'HOUR + null hours → secondary null',
      job: { min_value: 3000, unit_text: 'HOUR', hours_per_week: null },
      expectSecondary: false,
    },
    {
      label: 'YEAR + 35h → secondary null',
      job: { min_value: 6000000, unit_text: 'YEAR', hours_per_week: 35 },
      expectSecondary: false,
    },
    {
      label: 'HOUR + 20h → secondary non-null',
      job: { min_value: 3000, unit_text: 'HOUR', hours_per_week: 20 },
      expectSecondary: true,
    },
    {
      label: 'MONTH + null hours → secondary null',
      job: { min_value: 500000, unit_text: 'MONTH', hours_per_week: null },
      expectSecondary: false,
    },
  ]

  it.each(secondaryCases)('$label', ({ job, expectSecondary }) => {
    const result = formatCompensation(job as JobPosting, LOCALE)
    if (expectSecondary) {
      expect(result.secondary).toBeDefined()
      expect(typeof result.secondary).toBe('string')
      expect(result.secondary!.length).toBeGreaterThan(0)
    } else {
      expect(result.secondary).toBeUndefined()
    }
  })
})
