'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Profile-derived default filter values. Only non-empty dimensions are seeded.
 */
export interface ProfileFilterSeed {
  workTypes: string[];
  province: string | null;
  municipality: string | null;
  languages: string[];
}

export interface ProfileFilterSetters {
  setWorkTypes: (value: string[]) => void;
  setProvinces: (value: string[]) => void;
  setMunicipalities: (value: string[]) => void;
  setLanguages: (value: string[]) => void;
}

/**
 * Current URL-derived selections, used to detect when a seed has actually
 * landed in the URL so we don't fetch the unseeded set first.
 */
export interface ProfileFilterCurrent {
  workTypes: string[];
  provinces: string[];
  municipalities: string[];
  languages: string[];
}

export interface UseProfileFilterDefaultsArgs {
  /** True when there is a logged-in user whose profile defaults may apply. */
  enabled: boolean;
  /** True once auth + profile have finished loading (seed values are final). */
  resolved: boolean;
  seed: ProfileFilterSeed;
  current: ProfileFilterCurrent;
  setters: ProfileFilterSetters;
}

interface UrlPresence {
  workType: boolean;
  province: boolean;
  municipality: boolean;
  lang: boolean;
}

interface ExpectedSeed {
  workTypes?: string[];
  provinces?: string[];
  municipalities?: string[];
  languages?: string[];
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function readPresence(searchParams: URLSearchParams | null): UrlPresence {
  return {
    workType: searchParams?.has('workType') ?? false,
    province: searchParams?.has('province') ?? false,
    municipality: searchParams?.has('municipality') ?? false,
    lang: (searchParams?.has('lang') ?? false) || (searchParams?.has('langs') ?? false),
  };
}

/**
 * Seeds profile-based default filters into the URL exactly once per mount, then
 * never touches them again. This is the single place profile preferences are
 * turned into filter state — after seeding, the URL is the only source of truth,
 * so clearing a filter stays cleared (it can never be re-applied by this hook).
 *
 * Returns `filtersReady`: a latched flag that is true once the initial filter
 * state is final (either the URL as-is, or the seeded defaults have landed).
 * Callers gate the first data fetch on this so the unseeded set is never shown.
 */
export function useProfileFilterDefaults({
  enabled,
  resolved,
  seed,
  current,
  setters,
}: UseProfileFilterDefaultsArgs): boolean {
  const searchParams = useSearchParams();

  // Capture which filter params were present in the URL at mount. Seeding only
  // fills dimensions the user did not already specify, and this snapshot must be
  // stable (seeding itself mutates the live params).
  const [presence] = useState(() => readPresence(searchParams));

  const phaseRef = useRef<'init' | 'seeding' | 'done'>('init');
  const expectedRef = useRef<ExpectedSeed | null>(null);

  // When every seedable dimension is already in the URL there is nothing to
  // seed, so the initial state is final immediately (no need to await profile).
  const [ready, setReady] = useState<boolean>(
    () => presence.workType && presence.province && presence.municipality && presence.lang,
  );

  useEffect(() => {
    if (phaseRef.current === 'done') return;

    // No logged-in user: nothing to seed once auth has resolved.
    if (!enabled) {
      if (resolved) {
        phaseRef.current = 'done';
        setReady(true);
      }
      return;
    }

    // Logged in but auth/profile still loading: wait for final seed values.
    if (!resolved) return;

    if (phaseRef.current === 'init') {
      const expected: ExpectedSeed = {};

      if (!presence.workType && seed.workTypes.length > 0) {
        setters.setWorkTypes(seed.workTypes);
        expected.workTypes = seed.workTypes;
      }
      if (!presence.province && seed.province) {
        setters.setProvinces([seed.province]);
        expected.provinces = [seed.province];
      }
      if (!presence.municipality && seed.municipality) {
        setters.setMunicipalities([seed.municipality]);
        expected.municipalities = [seed.municipality];
      }
      if (!presence.lang && seed.languages.length > 0) {
        setters.setLanguages(seed.languages);
        expected.languages = seed.languages;
      }

      if (Object.keys(expected).length === 0) {
        phaseRef.current = 'done';
        setReady(true);
        return;
      }

      expectedRef.current = expected;
      phaseRef.current = 'seeding';
      return;
    }

    // Phase 'seeding': mark ready only once the URL reflects the seed, so the
    // first fetch uses the seeded filters (avoids a flash of the unseeded set).
    const expected = expectedRef.current ?? {};
    const landed =
      (!expected.workTypes || sameSet(current.workTypes, expected.workTypes)) &&
      (!expected.provinces || sameSet(current.provinces, expected.provinces)) &&
      (!expected.municipalities || sameSet(current.municipalities, expected.municipalities)) &&
      (!expected.languages || sameSet(current.languages, expected.languages));

    if (landed) {
      phaseRef.current = 'done';
      setReady(true);
    }
  }, [enabled, resolved, seed, current, setters, presence]);

  return ready;
}
