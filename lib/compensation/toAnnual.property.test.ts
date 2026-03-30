/**
 * Property-based tests for `toAnnual`
 *
 * Uses parameterized test cases (it.each) to cover a wide range of inputs.
 *
 * Property 3: Null Propagation
 *   Validates: Requirement 6.2
 *
 * Property 2: Annualization Monotonicity
 *   Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6
 */

import { describe, it, expect } from 'vitest'
import { toAnnual } from './helpers'
import type { CompensationUnit } from './constants'

const ALL_UNITS: CompensationUnit[] = ['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR']
const SAMPLE_AMOUNTS = [0n, 1n, 100n, 1_000_000n]
const SAMPLE_HOURS = [null, 1, 40, 80] as const

// ---------------------------------------------------------------------------
// Property 3: Null Propagation
// Validates: Requirement 6.2
// ---------------------------------------------------------------------------

describe('Property 3: Null Propagation', () => {
  /**
   * toAnnual(null, unit, h) returns null for all valid units and any hoursPerWeek
   */
  describe('null amount → null result', () => {
    it.each(
      ALL_UNITS.flatMap((unit) =>
        SAMPLE_HOURS.map((h) => ({ unit, h }))
      )
    )('toAnnual(null, "$unit", $h) === null', ({ unit, h }) => {
      expect(toAnnual(null, unit, h)).toBeNull()
    })
  })

  /**
   * toAnnual(amount, null, h) returns null for any positive amount and any hoursPerWeek
   */
  describe('null unit → null result', () => {
    it.each(
      SAMPLE_AMOUNTS.flatMap((amount) =>
        SAMPLE_HOURS.map((h) => ({ amount, h }))
      )
    )('toAnnual($amount, null, $h) === null', ({ amount, h }) => {
      expect(toAnnual(amount, null, h)).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// Property 2: Annualization Monotonicity
// Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6
// ---------------------------------------------------------------------------

describe('Property 2: Annualization Monotonicity', () => {
  /**
   * For any amount > 0n and valid unit, toAnnual(amount, unit, h) >= amount
   *
   * The annualized value is always at least as large as the original amount
   * because all multipliers are >= 1 (YEAR=1, MONTH=12, WEEK=52, DAY=260,
   * HOUR=h*52 where h>=1).
   */
  const positiveAmounts = [1n, 100n, 1_000_000n]

  it.each(
    ALL_UNITS.flatMap((unit) =>
      positiveAmounts.flatMap((amount) =>
        SAMPLE_HOURS.map((h) => ({ unit, amount, h }))
      )
    )
  )('toAnnual($amount, "$unit", $h) >= $amount', ({ unit, amount, h }) => {
    const result = toAnnual(amount, unit, h)
    expect(result).not.toBeNull()
    expect(result! >= amount).toBe(true)
  })
})
