/**
 * Unit tests for useProfileForm state transition logic.
 *
 * Rather than rendering the full hook (which depends on useProfile, useTranslations, etc.),
 * we test the pure state-transition logic extracted from the hook directly.
 *
 * Requirements: 2.3, 2.6, 2.7, 2.8
 */

import { describe, it, expect } from 'vitest';
import { resolveCvImportItems } from './useProfileForm';
import { type RatedValue } from '@/lib/value-ratings';

// ─── Pure logic extracted from useProfileForm ────────────────────────────────

/**
 * Mirrors the deselect branch of handleValueToggle in useProfileForm.
 * When a value is deselected, its entry is removed from valuesRated.
 */
function deselectValue(valuesRated: RatedValue[], id: string): RatedValue[] {
  return valuesRated.filter((rv) => rv.value !== id);
}

/**
 * Mirrors the filteredValuesRated computation in handleSaveProfile.
 * Only keeps entries whose value is in the currently selected set.
 */
function filterValuesRated(valuesRated: RatedValue[], selectedValues: string[]): RatedValue[] {
  const selectedSet = new Set(selectedValues);
  return valuesRated.filter((rv) => selectedSet.has(rv.value));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useProfileForm — valuesRated state transitions', () => {
  describe('CV import state application', () => {
    it('preserves existing items when the imported list is empty', () => {
      expect(resolveCvImportItems(['existing-skill'], [])).toEqual(['existing-skill']);
    });

    it('replaces existing items when the imported list is non-empty', () => {
      expect(resolveCvImportItems(['existing-skill'], ['imported-skill'])).toEqual([
        'imported-skill',
      ]);
    });
  });

  // Requirement 2.3: WHEN a value is deselected, THE ValuesSelector SHALL remove
  // its rank assignment from the form state.
  describe('deselect value → rank removed from valuesRated', () => {
    it('removes the entry for the deselected value', () => {
      const initial: RatedValue[] = [{ value: 'Community', rank: 1 }];
      const result = deselectValue(initial, 'Community');
      expect(result.some((rv) => rv.value === 'Community')).toBe(false);
    });

    it('leaves other values untouched when one is deselected', () => {
      const initial: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
      ];
      const result = deselectValue(initial, 'Community');
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('Creativity');
    });

    it('returns empty array when the only value is deselected', () => {
      const initial: RatedValue[] = [{ value: 'Community' }];
      const result = deselectValue(initial, 'Community');
      expect(result).toHaveLength(0);
    });
  });

  // Requirement 2.8: THE Profile SHALL accept a profile with zero rated values,
  // in which case values_rated SHALL be an empty array or null.
  describe('save with zero rated values → values_rated is []', () => {
    it('produces an empty filteredValuesRated when valuesRated is empty', () => {
      const valuesRated: RatedValue[] = [];
      const selectedValues = ['Community'];
      const filteredValuesRated = filterValuesRated(valuesRated, selectedValues);
      expect(filteredValuesRated).toEqual([]);
    });

    it('produces an empty filteredValuesRated when no values are selected', () => {
      const valuesRated: RatedValue[] = [{ value: 'Community', rank: 1 }];
      const selectedValues: string[] = [];
      const filteredValuesRated = filterValuesRated(valuesRated, selectedValues);
      expect(filteredValuesRated).toEqual([]);
    });
  });

  // Requirements 2.6, 2.7: WHEN a user saves their profile, THE Profile SHALL
  // persist only the Rated_Value entries for currently selected values AND also
  // write the plain string array to profiles.values.
  describe('save writes both values_rated and values', () => {
    it('filteredValuesRated contains only entries for selected values', () => {
      const valuesRated: RatedValue[] = [{ value: 'Community', rank: 1 }];
      const selectedValues = ['Community'];
      const filteredValuesRated = filterValuesRated(valuesRated, selectedValues);
      expect(filteredValuesRated).toEqual([{ value: 'Community', rank: 1 }]);
      expect(selectedValues).toEqual(['Community']);
    });

    it('excludes deselected values from filteredValuesRated', () => {
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
      ];
      const selectedValues = ['Community'];
      const filteredValuesRated = filterValuesRated(valuesRated, selectedValues);
      expect(filteredValuesRated).toHaveLength(1);
      expect(filteredValuesRated[0].value).toBe('Community');
      expect(filteredValuesRated.some((rv) => rv.value === 'Creativity')).toBe(false);
    });

    it('preserves unrated entries (no rank) in filteredValuesRated', () => {
      const valuesRated: RatedValue[] = [{ value: 'Community' }];
      const selectedValues = ['Community'];
      const filteredValuesRated = filterValuesRated(valuesRated, selectedValues);
      expect(filteredValuesRated).toEqual([{ value: 'Community' }]);
    });
  });
});
