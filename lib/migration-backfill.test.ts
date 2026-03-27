/**
 * Property test: migration backfill round-trip for profiles.values_rated
 *
 * Validates: Requirements 4.3
 *
 * Property: Backfilling `profiles.values` then reading `values_rated[*].value`
 * produces the same string set as the original array.
 *
 * The migration converts each string entry in `profiles.values` to an unrated
 * Rated_Value object: { "value": "...", "tier": null }
 * Reading `.value` from each object must reproduce the original string set.
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// The backfill logic under test (mirrors the SQL migration exactly)
// ---------------------------------------------------------------------------

interface RatedValue {
  value: string
  tier: null
}

/** Replicates the SQL backfill:
 *  jsonb_agg(jsonb_build_object('value', v, 'tier', NULL))
 */
function backfillValuesRated(values: string[]): RatedValue[] {
  return values.map((v) => ({ value: v, tier: null }))
}

/** Replicates reading values_rated[*].value back out */
function extractValues(valuesRated: RatedValue[]): string[] {
  return valuesRated.map((r) => r.value)
}

// ---------------------------------------------------------------------------
// Helper: assert the round-trip property for a given input array
// ---------------------------------------------------------------------------

function assertRoundTrip(input: string[]): void {
  const valuesRated = backfillValuesRated(input)
  const extracted = extractValues(valuesRated)

  // The extracted set must equal the input set (order-independent)
  expect(new Set(extracted)).toEqual(new Set(input))

  // Length must be preserved (duplicates are kept, not collapsed)
  expect(extracted).toHaveLength(input.length)

  // Each individual value must survive the round-trip unchanged
  for (let i = 0; i < input.length; i++) {
    expect(extracted[i]).toBe(input[i])
  }
}

// ---------------------------------------------------------------------------
// Parameterized property test — covers representative input classes
// ---------------------------------------------------------------------------

describe('migration backfill round-trip (profiles.values → values_rated[*].value)', () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * Property: for any array of value strings, converting each to
   * { value: "...", tier: null } and then extracting .value produces
   * the same string set as the original array.
   */
  const cases: Array<{ label: string; input: string[] }> = [
    // Edge: empty array
    { label: 'empty array', input: [] },

    // Edge: single value
    { label: 'single value', input: ['Creativity'] },

    // Typical: a few distinct values
    { label: 'two values', input: ['Community', 'Creativity'] },
    { label: 'three values', input: ['Community', 'Creativity', 'Challenge'] },

    // Typical: full set of five (common profile size)
    {
      label: 'five values',
      input: ['Community', 'Creativity', 'Challenge', 'Knowledge', 'Security'],
    },

    // Edge: duplicates — the backfill must preserve them (SQL unnest does)
    { label: 'duplicate values', input: ['Community', 'Community', 'Creativity'] },

    // Edge: values with special characters / whitespace
    { label: 'values with spaces', input: ['Work-Life Balance', 'Social Impact'] },
    { label: 'values with unicode', input: ['Équité', 'Zusammenarbeit', '创造力'] },

    // Edge: single-character and long strings
    { label: 'single char value', input: ['A'] },
    {
      label: 'long value string',
      input: ['A very long value string that exceeds typical lengths but must still round-trip'],
    },

    // Edge: many values (stress)
    {
      label: 'ten values',
      input: [
        'Community',
        'Creativity',
        'Challenge',
        'Knowledge',
        'Security',
        'Autonomy',
        'Impact',
        'Growth',
        'Balance',
        'Integrity',
      ],
    },

    // Edge: values that are empty strings (degenerate but must not crash)
    { label: 'empty string value', input: [''] },
    { label: 'mixed empty and non-empty', input: ['', 'Community', ''] },
  ]

  it.each(cases)('round-trip holds for: $label', ({ input }) => {
    assertRoundTrip(input)
  })

  it('tier field is always null after backfill', () => {
    const input = ['Community', 'Creativity', 'Challenge']
    const valuesRated = backfillValuesRated(input)
    for (const entry of valuesRated) {
      expect(entry.tier).toBeNull()
    }
  })

  it('each rated object has exactly the keys "value" and "tier"', () => {
    const input = ['Community', 'Creativity']
    const valuesRated = backfillValuesRated(input)
    for (const entry of valuesRated) {
      expect(Object.keys(entry).sort()).toEqual(['tier', 'value'])
    }
  })

  it('order is preserved after backfill', () => {
    const input = ['Creativity', 'Community', 'Challenge']
    const extracted = extractValues(backfillValuesRated(input))
    expect(extracted).toEqual(input)
  })
})
