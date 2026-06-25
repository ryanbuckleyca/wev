import { describe, it, expect } from 'vitest';
import {
  VALUES_DICTIONARY,
  VALUES_LIST,
  VALUE_CATEGORIES,
  VALUE_TO_CATEGORY,
  buildWorkValues,
  getValueDefinition,
  type Value,
} from './values';

describe('VALUES_DICTIONARY', () => {
  it('contains a non-empty set of values', () => {
    expect(Object.keys(VALUES_DICTIONARY).length).toBeGreaterThan(0);
  });

  it('every entry has a description and example string', () => {
    const entries = Object.entries(VALUES_DICTIONARY);
    const invalidEntries = entries.filter(
      ([, def]) =>
        typeof def.description !== 'string' ||
        !def.description ||
        typeof def.example !== 'string' ||
        !def.example,
    );
    expect(invalidEntries).toEqual([]);
  });
});

describe('VALUES_LIST', () => {
  it('is an array matching the dictionary keys', () => {
    expect(VALUES_LIST).toEqual(Object.keys(VALUES_DICTIONARY));
  });

  it('contains well-known values', () => {
    expect(VALUES_LIST).toContain('Community');
    expect(VALUES_LIST).toContain('Creativity');
    expect(VALUES_LIST).toContain('Challenge');
  });
});

describe('getValueDefinition', () => {
  it('returns the correct definition for a known value', () => {
    const def = getValueDefinition('Community');
    expect(def.description).toContain('impact');
  });

  it('returns a default definition for an unknown value', () => {
    const def = getValueDefinition('TotallyMadeUp');
    expect(def.description).toBeTruthy();
    expect(def.example).toBeTruthy();
  });

  it('returns the same default for any unknown value', () => {
    const a = getValueDefinition('Foo');
    const b = getValueDefinition('Bar');
    expect(a).toEqual(b);
  });
});

// Feature: values-list-migration, Property 4: buildWorkValues returns exactly 54 items with correct category assignments
describe('buildWorkValues (P4)', () => {
  const mockT = (key: string, opts?: { defaultValue: string }) => opts?.defaultValue ?? key;

  it('returns exactly 54 items', () => {
    // Validates: Requirements 4.1, 4.2
    const result = buildWorkValues(mockT, mockT);
    expect(result.length).toBe(54);
  });

  it('each item category matches VALUE_CATEGORIES[VALUE_TO_CATEGORY[item.id]]', () => {
    // Validates: Requirements 4.1, 4.2
    const result = buildWorkValues(mockT, mockT);
    for (const item of result) {
      const catKey = VALUE_TO_CATEGORY[item.id as Value];
      expect(catKey).toBeDefined();
      const expectedCategory = VALUE_CATEGORIES[catKey];
      expect(expectedCategory).toBeDefined();
      expect(item.category).toEqual(expectedCategory);
    }
  });
});

// Task 5.3 — Unit tests for spot-checks
describe('VALUES_LIST spot-checks', () => {
  it('has exactly 54 entries', () => {
    expect(VALUES_LIST.length).toBe(54);
  });

  it('does not contain Experience or Organization', () => {
    expect(VALUES_LIST).not.toContain('Experience');
    expect(VALUES_LIST).not.toContain('Organization');
  });
});

describe('VALUES_DICTIONARY spot-checks', () => {
  it('Advancement description contains "Growth"', () => {
    expect(VALUES_DICTIONARY['Advancement'].description).toContain('Growth');
  });

  it('Adventure exists (new value)', () => {
    expect(VALUES_DICTIONARY['Adventure']).toBeDefined();
  });

  it('Work-Life Balance exists (new value)', () => {
    expect(VALUES_DICTIONARY['Work-Life Balance']).toBeDefined();
  });

  it('does not contain Experience', () => {
    expect(Object.prototype.hasOwnProperty.call(VALUES_DICTIONARY, 'Experience')).toBe(false);
  });

  it('does not contain Organization', () => {
    expect(Object.prototype.hasOwnProperty.call(VALUES_DICTIONARY, 'Organization')).toBe(false);
  });
});

// Drift detection: VALUE_TO_CATEGORY must stay in sync with shared JSON categories
import sharedValues from '@shared/taxonomy/work_values.json';

describe('VALUE_TO_CATEGORY ↔ shared JSON sync', () => {
  it('every JSON label has a matching entry in VALUE_TO_CATEGORY', () => {
    const missing = sharedValues
      .map((v) => v.label)
      .filter((label) => !(label in VALUE_TO_CATEGORY));
    expect(missing).toEqual([]);
  });

  it('every VALUE_TO_CATEGORY key exists in JSON', () => {
    const jsonLabels = new Set(sharedValues.map((v) => v.label));
    const extra = Object.keys(VALUE_TO_CATEGORY).filter((k) => !jsonLabels.has(k));
    expect(extra).toEqual([]);
  });

  it('category values match between VALUE_TO_CATEGORY and JSON', () => {
    const mismatches: string[] = [];
    for (const entry of sharedValues) {
      const tsCategory = VALUE_TO_CATEGORY[entry.label as Value];
      if (tsCategory !== entry.category) {
        mismatches.push(`${entry.label}: TS="${tsCategory}" JSON="${entry.category}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
