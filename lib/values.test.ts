import { describe, it, expect } from 'vitest'
import { VALUES_DICTIONARY, VALUES_LIST, getValueDefinition } from './values'

describe('VALUES_DICTIONARY', () => {
  it('contains a non-empty set of values', () => {
    expect(Object.keys(VALUES_DICTIONARY).length).toBeGreaterThan(0)
  })

  it('every entry has a description and example string', () => {
    for (const [key, def] of Object.entries(VALUES_DICTIONARY)) {
      expect(def.description, `${key} description`).toBeTruthy()
      expect(typeof def.description).toBe('string')
      expect(def.example, `${key} example`).toBeTruthy()
      expect(typeof def.example).toBe('string')
    }
  })
})

describe('VALUES_LIST', () => {
  it('is an array matching the dictionary keys', () => {
    expect(VALUES_LIST).toEqual(Object.keys(VALUES_DICTIONARY))
  })

  it('contains well-known values', () => {
    expect(VALUES_LIST).toContain('Community')
    expect(VALUES_LIST).toContain('Creativity')
    expect(VALUES_LIST).toContain('Challenge')
  })
})

describe('getValueDefinition', () => {
  it('returns the correct definition for a known value', () => {
    const def = getValueDefinition('Community')
    expect(def.description).toContain('community')
  })

  it('returns a default definition for an unknown value', () => {
    const def = getValueDefinition('TotallyMadeUp')
    expect(def.description).toBeTruthy()
    expect(def.example).toBeTruthy()
  })

  it('returns the same default for any unknown value', () => {
    const a = getValueDefinition('Foo')
    const b = getValueDefinition('Bar')
    expect(a).toEqual(b)
  })
})
