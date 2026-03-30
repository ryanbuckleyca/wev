/**
 * SQL / TypeScript parity tests for annualize_v1 / toAnnual
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 6.5
 *
 * The SQL function `annualize_v1` in the Supabase migration implements the
 * same formula as the TypeScript `toAnnual` in lib/compensation/helpers.ts.
 * These tests verify parity by re-implementing the SQL formula in TypeScript
 * (as a reference implementation) and asserting it produces the same result
 * as `toAnnual`.
 *
 * SQL formula (from annualize_v1):
 *   HOUR  → amount * COALESCE(actual_hours_per_week * 52, 2080)
 *   DAY   → amount * 260
 *   WEEK  → amount * 52
 *   MONTH → amount * 12
 *   YEAR  → amount
 *   else  → NULL
 */

import { describe, it, expect } from 'vitest'
import { toAnnual } from './helpers'

// ---------------------------------------------------------------------------
// Reference implementation of SQL annualize_v1
// ---------------------------------------------------------------------------

/**
 * Mirrors the SQL annualize_v1 function exactly.
 * Returns null when unit is null or unrecognized.
 */
function annualize_v1_ref(
  amount: bigint,
  unit: string | null,
  actual_hours_per_week: number | null = null,
): bigint | null {
  switch (unit) {
    case 'HOUR':
      return amount * BigInt(actual_hours_per_week != null ? actual_hours_per_week * 52 : 2080)
    case 'DAY':
      return amount * 260n
    case 'WEEK':
      return amount * 52n
    case 'MONTH':
      return amount * 12n
    case 'YEAR':
      return amount
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const AMOUNTS = [100n, 5000n, 1_000_000n]
const HOURS_PER_WEEK_VALUES = [null, 1, 20, 40, 80]
const ALL_UNITS = ['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'] as const

// ---------------------------------------------------------------------------
// Per-unit parity tests
// ---------------------------------------------------------------------------

describe('SQL / TypeScript parity — annualize_v1 vs toAnnual', () => {
  describe('HOUR unit — with and without hoursPerWeek', () => {
    for (const amount of AMOUNTS) {
      for (const hours of HOURS_PER_WEEK_VALUES) {
        it(`amount=${amount}, hoursPerWeek=${hours}`, () => {
          const ref = annualize_v1_ref(amount, 'HOUR', hours)
          const ts = toAnnual(amount, 'HOUR', hours)
          expect(ts).toBe(ref)
        })
      }
    }
  })

  describe('DAY unit', () => {
    for (const amount of AMOUNTS) {
      it(`amount=${amount}`, () => {
        const ref = annualize_v1_ref(amount, 'DAY', null)
        const ts = toAnnual(amount, 'DAY', null)
        expect(ts).toBe(ref)
      })
    }
  })

  describe('WEEK unit', () => {
    for (const amount of AMOUNTS) {
      it(`amount=${amount}`, () => {
        const ref = annualize_v1_ref(amount, 'WEEK', null)
        const ts = toAnnual(amount, 'WEEK', null)
        expect(ts).toBe(ref)
      })
    }
  })

  describe('MONTH unit', () => {
    for (const amount of AMOUNTS) {
      it(`amount=${amount}`, () => {
        const ref = annualize_v1_ref(amount, 'MONTH', null)
        const ts = toAnnual(amount, 'MONTH', null)
        expect(ts).toBe(ref)
      })
    }
  })

  describe('YEAR unit', () => {
    for (const amount of AMOUNTS) {
      it(`amount=${amount}`, () => {
        const ref = annualize_v1_ref(amount, 'YEAR', null)
        const ts = toAnnual(amount, 'YEAR', null)
        expect(ts).toBe(ref)
      })
    }
  })

  // ---------------------------------------------------------------------------
  // Edge cases for null inputs
  // ---------------------------------------------------------------------------

  describe('null input edge cases', () => {
    it('toAnnual(null, "YEAR", null) === null', () => {
      expect(toAnnual(null, 'YEAR', null)).toBeNull()
    })

    it('toAnnual(100n, null, null) === null', () => {
      expect(toAnnual(100n, null, null)).toBeNull()
    })

    it('annualize_v1_ref(100n, null) === null', () => {
      expect(annualize_v1_ref(100n, null)).toBeNull()
    })

    it('annualize_v1_ref(100n, "INVALID") === null', () => {
      expect(annualize_v1_ref(100n, 'INVALID')).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Property 1: SQL/TS Parity
  //
  // For all valid (amountCents, unit, hoursPerWeek) combinations,
  // toAnnual produces a result equal to annualize_v1_ref.
  //
  // Validates: Requirements 6.5, 8.2
  // ---------------------------------------------------------------------------

  describe('Property 1: SQL/TS Parity — parameterized over all valid combinations', () => {
    /**
     * **Validates: Requirements 8.1, 8.2, 8.3, 6.5**
     *
     * For every (amountCents, unit, hoursPerWeek) triple in the valid input
     * space, toAnnual(amountCents, unit, hoursPerWeek) must equal
     * annualize_v1_ref(amountCents, unit, hoursPerWeek).
     */
    for (const unit of ALL_UNITS) {
      for (const amount of AMOUNTS) {
        if (unit === 'HOUR') {
          for (const hours of HOURS_PER_WEEK_VALUES) {
            it(`unit=${unit}, amount=${amount}, hoursPerWeek=${hours} — parity holds`, () => {
              const ref = annualize_v1_ref(amount, unit, hours)
              const ts = toAnnual(amount, unit, hours)
              expect(ts).toBe(ref)
              // Both must be non-null for valid inputs
              expect(ts).not.toBeNull()
            })
          }
        } else {
          it(`unit=${unit}, amount=${amount}, hoursPerWeek=null — parity holds`, () => {
            const ref = annualize_v1_ref(amount, unit, null)
            const ts = toAnnual(amount, unit, null)
            expect(ts).toBe(ref)
            expect(ts).not.toBeNull()
          })
        }
      }
    }
  })
})
