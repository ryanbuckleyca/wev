/**
 * Integration tests for the full profile save/load cycle with rated values.
 *
 * These tests verify the round-trip pipeline for `values_rated` by testing
 * the pure logic extracted from `handleSaveProfile` and the hydration `useEffect`
 * in `useProfileForm`, without requiring React rendering or a real Supabase connection.
 *
 * Requirements: 2.5, 2.6, 2.7, 4.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type RatedValue } from '@/lib/value-ratings';
import { type Profile, type ProfileUpdateData } from '@/lib/supabase/profiles';
import { MAX_PROFILE_VALUES } from '@/lib/hooks/useProfileForm';

// ─── Helpers mirroring useProfileForm logic ──────────────────────────────────

/**
 * Mirrors the save payload construction in handleSaveProfile.
 * Returns what would be passed to updateProfile.
 */
function buildSavePayload(
  selectedValues: string[],
  valuesRated: RatedValue[],
  overrides: Partial<ProfileUpdateData> = {},
): ProfileUpdateData {
  const selectedValuesSet = new Set(selectedValues.slice(0, MAX_PROFILE_VALUES));
  const filteredValuesRated = valuesRated.filter((rv) => selectedValuesSet.has(rv.value));
  return {
    values: Array.from(selectedValuesSet),
    values_rated: filteredValuesRated,
    ...overrides,
  };
}

/**
 * Mirrors the hydration logic in the useEffect of useProfileForm.
 * Returns the valuesRated state that would be set after loading a profile.
 */
function hydrateValuesRated(profile: Pick<Profile, 'values' | 'values_rated'>): RatedValue[] {
  const profileValuesRated = profile.values_rated;
  if (profileValuesRated && profileValuesRated.length > 0) {
    return profileValuesRated;
  }
  return (profile.values || []).map((v) => ({ value: v }));
}

// ─── Mock Supabase helpers ────────────────────────────────────────────────────

function createMockUpdateProfile() {
  let capturedPayload: ProfileUpdateData | null = null;

  const mockUpdateProfile = vi.fn(async (data: ProfileUpdateData): Promise<Profile | null> => {
    capturedPayload = data;
    return {
      id: 'user-123',
      full_name: null,
      bio: null,
      values: data.values ?? [],
      values_rated: data.values_rated ?? null,
      skills: data.skills ?? [],
      skills_rated: data.skills_rated ?? null,
      work_types: data.work_types ?? [],
      ideal_work_environment: null,
      profile_photo_url: null,
      lat: null,
      lng: null,
      location_display_name: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  return { mockUpdateProfile, getCaptured: () => capturedPayload };
}

function createMockGetProfile(savedProfile: Profile) {
  return vi.fn(async (): Promise<Profile | null> => savedProfile);
}

async function saveAndReload(
  selectedValues: string[],
  valuesRated: RatedValue[],
): Promise<{ captured: ProfileUpdateData; hydrated: RatedValue[] }> {
  const savePayload = buildSavePayload(selectedValues, valuesRated);
  const { mockUpdateProfile, getCaptured } = createMockUpdateProfile();
  const savedProfile = await mockUpdateProfile(savePayload);
  const reloadedProfile = await createMockGetProfile(savedProfile!)();
  return {
    captured: getCaptured()!,
    hydrated: hydrateValuesRated(reloadedProfile!),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Profile save/load cycle — values_rated round-trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test 1: save rated values → reload profile → values_rated matches
   *
   * Requirements 2.5, 2.6, 4.5
   */
  describe('save rated values → reload profile → values_rated matches', () => {
    it('round-trips a fully rated values_rated array', async () => {
      const selectedValues = ['Community', 'Creativity', 'Autonomy'];
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Autonomy', rank: 3 },
      ];

      const { hydrated } = await saveAndReload(selectedValues, valuesRated);
      expect(hydrated).toEqual(valuesRated);
    });

    it('round-trips a mix of rated and unrated values', async () => {
      const selectedValues = ['Community', 'Creativity', 'Autonomy'];
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity' },
        { value: 'Autonomy', rank: 3 },
      ];

      const { hydrated } = await saveAndReload(selectedValues, valuesRated);
      expect(hydrated).toEqual(valuesRated);
    });

    it('round-trips an empty values_rated when no values are selected', async () => {
      const { hydrated } = await saveAndReload([], []);
      expect(hydrated).toEqual([]);
    });

    it('excludes deselected values from the saved values_rated', async () => {
      const selectedValues = ['Community', 'Autonomy'];
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Autonomy', rank: 3 },
      ];

      const { captured, hydrated } = await saveAndReload(selectedValues, valuesRated);

      expect(captured.values_rated).not.toContainEqual(
        expect.objectContaining({ value: 'Creativity' }),
      );
      expect(hydrated).toHaveLength(2);
      expect(hydrated.map((rv) => rv.value)).toEqual(['Community', 'Autonomy']);
    });
  });

  /**
   * Test 2: values array matches keys in values_rated
   *
   * Requirements 2.6, 2.7, 4.5
   */
  describe('values array matches keys in values_rated', () => {
    it('values contains exactly the same IDs as values_rated[*].value', async () => {
      const selectedValues = ['Community', 'Creativity', 'Autonomy'];
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Autonomy' },
      ];

      const savePayload = buildSavePayload(selectedValues, valuesRated);
      const { mockUpdateProfile } = createMockUpdateProfile();
      await mockUpdateProfile(savePayload);

      const savedValues = savePayload.values ?? [];
      const savedValuesRatedKeys = (savePayload.values_rated ?? []).map((rv) => rv.value);

      expect(new Set(savedValues)).toEqual(new Set(savedValuesRatedKeys));
    });

    it('values and values_rated keys stay in sync after deselection', async () => {
      const selectedValues = ['Community', 'Autonomy'];
      const valuesRated: RatedValue[] = [
        { value: 'Community', rank: 1 },
        { value: 'Creativity', rank: 2 },
        { value: 'Autonomy', rank: 3 },
      ];

      const savePayload = buildSavePayload(selectedValues, valuesRated);

      const savedValues = savePayload.values ?? [];
      const savedValuesRatedKeys = (savePayload.values_rated ?? []).map((rv) => rv.value);

      expect(new Set(savedValues)).toEqual(new Set(savedValuesRatedKeys));
      expect(savedValues).not.toContain('Creativity');
      expect(savedValuesRatedKeys).not.toContain('Creativity');
    });

    it('values and values_rated keys are both empty when nothing is selected', async () => {
      const savePayload = buildSavePayload([], []);

      expect(savePayload.values).toEqual([]);
      expect(savePayload.values_rated).toEqual([]);
    });

    it('values contains no duplicates even if selectedValues had duplicates', async () => {
      const selectedValues = ['Community', 'Community', 'Creativity'];
      const valuesRated: RatedValue[] = [{ value: 'Community', rank: 1 }, { value: 'Creativity' }];

      const savePayload = buildSavePayload(selectedValues, valuesRated);

      const savedValues = savePayload.values ?? [];
      expect(savedValues).toHaveLength(new Set(savedValues).size);
      expect(new Set(savedValues)).toEqual(
        new Set((savePayload.values_rated ?? []).map((rv) => rv.value)),
      );
    });

    it('both values and values_rated are written on every save (backward compat)', async () => {
      const selectedValues = ['Community'];
      const valuesRated: RatedValue[] = [{ value: 'Community', rank: 1 }];

      const savePayload = buildSavePayload(selectedValues, valuesRated);
      const { mockUpdateProfile, getCaptured } = createMockUpdateProfile();
      await mockUpdateProfile(savePayload);

      const captured = getCaptured()!;
      expect(captured).toHaveProperty('values');
      expect(captured).toHaveProperty('values_rated');
      expect(captured.values).toEqual(['Community']);
      expect(captured.values_rated).toEqual([{ value: 'Community', rank: 1 }]);
    });
  });

  /**
   * Hydration fallback: when values_rated is absent, backfill from values
   *
   * Requirement 2.9
   */
  describe('hydration fallback — backfill from values when values_rated is absent', () => {
    it('backfills unrated entries from values when values_rated is null', () => {
      const profile: Pick<Profile, 'values' | 'values_rated'> = {
        values: ['Community', 'Creativity'],
        values_rated: null,
      };

      const hydrated = hydrateValuesRated(profile);

      expect(hydrated).toEqual([{ value: 'Community' }, { value: 'Creativity' }]);
    });

    it('backfills unrated entries from values when values_rated is empty', () => {
      const profile: Pick<Profile, 'values' | 'values_rated'> = {
        values: ['Community'],
        values_rated: [],
      };

      const hydrated = hydrateValuesRated(profile);

      expect(hydrated).toEqual([{ value: 'Community' }]);
    });

    it('prefers values_rated over values when values_rated is populated', () => {
      const profile: Pick<Profile, 'values' | 'values_rated'> = {
        values: ['Community', 'Creativity'],
        values_rated: [
          { value: 'Community', rank: 1 },
          { value: 'Creativity', rank: 2 },
        ],
      };

      const hydrated = hydrateValuesRated(profile);

      expect(hydrated).toEqual(profile.values_rated);
    });
  });
});
