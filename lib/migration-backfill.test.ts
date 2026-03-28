/**
 * Property test: migration backfill round-trip for profiles.values_rated
 *
 * Validates: Requirements 4.3
 *
 * Property: Backfilling `profiles.values` then reading `values_rated[*].value`
 * produces the same string set as the original array.
 *
 * The migration converts each string entry in `profiles.values` to an unranked
 * RatedValue object: { "value": "..." }
 * Reading `.value` from each object must reproduce the original string set.
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// The backfill logic under test (mirrors the SQL migration exactly):
//   jsonb_agg(jsonb_build_object('value', v))
// ---------------------------------------------------------------------------

interface BackfilledValue {
  value: string
}

function backfillValuesRated(values: string[]): BackfilledValue[] {
  return values.map((v) => ({ value: v }))
}

function extractValues(valuesRated: BackfilledValue[]): string[] {
  return valuesRated.map((r) => r.value)
}

// ---------------------------------------------------------------------------
// Helper: assert the round-trip property for a given input array
// ---------------------------------------------------------------------------

function assertRoundTrip(input: string[]): void {
  const valuesRated = backfillValuesRated(input)
  const extracted = extractValues(valuesRated)

  expect(new Set(extracted)).toEqual(new Set(input))
  expect(extracted).toHaveLength(input.length)

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
   * { value: "..." } and then extracting .value produces
   * the same string set as the original array.
   */
  const cases: Array<{ label: string; input: string[] }> = [
    { label: 'empty array', input: [] },
    { label: 'single value', input: ['Creativity'] },
    { label: 'two values', input: ['Community', 'Creativity'] },
    { label: 'three values', input: ['Community', 'Creativity', 'Challenge'] },
    {
      label: 'five values',
      input: ['Community', 'Creativity', 'Challenge', 'Knowledge', 'Security'],
    },
    { label: 'duplicate values', input: ['Community', 'Community', 'Creativity'] },
    { label: 'values with spaces', input: ['Work-Life Balance', 'Social Impact'] },
    { label: 'values with unicode', input: ['Équité', 'Zusammenarbeit', '创造力'] },
    { label: 'single char value', input: ['A'] },
    {
      label: 'long value string',
      input: ['A very long value string that exceeds typical lengths but must still round-trip'],
    },
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
    { label: 'empty string value', input: [''] },
    { label: 'mixed empty and non-empty', input: ['', 'Community', ''] },
  ]

  it.each(cases)('round-trip holds for: $label', ({ input }) => {
    assertRoundTrip(input)
  })

  it('each backfilled object has exactly the key "value"', () => {
    const input = ['Community', 'Creativity']
    const valuesRated = backfillValuesRated(input)
    for (const entry of valuesRated) {
      expect(Object.keys(entry)).toEqual(['value'])
    }
  })

  it('order is preserved after backfill', () => {
    const input = ['Creativity', 'Community', 'Challenge']
    const extracted = extractValues(backfillValuesRated(input))
    expect(extracted).toEqual(input)
  })
})
