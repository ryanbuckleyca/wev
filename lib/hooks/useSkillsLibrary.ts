'use client';

import { useState, useEffect } from 'react';
import { type EscoSkill } from '@/lib/types/skills';
import {
  toEscoSkill,
  toEscoSkillFromLibrary,
  type RawSkillRow,
  type RawSkillLibraryRow,
} from '@/lib/profile/profileMapping';

/**
 * Fetches specific skills by their URIs from the API.
 */
export async function fetchSkillsByUri(uris: string[], locale: 'en' | 'fr'): Promise<EscoSkill[]> {
  if (uris.length === 0) return [];
  const res = await fetch(
    `/api/skills/by-uri?${new URLSearchParams({ uris: uris.join(','), locale })}`,
  );
  const body: { skills?: RawSkillRow[] } = res.ok ? await res.json() : { skills: [] };
  const seen = new Set<string>();
  return (body.skills || []).map(toEscoSkill).filter((s) => {
    if (seen.has(s.uri)) return false;
    seen.add(s.uri);
    return true;
  });
}

/**
 * Hook to manage the ESCO skill library fetching and caching.
 */
export function useSkillsLibrary(locale: 'en' | 'fr') {
  const [allSkills, setAllSkills] = useState<EscoSkill[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);

    // Fetch the full library for the searchable list
    fetch(`/api/skills/all?locale=${locale}&cb=${Date.now()}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : { skills: [] }))
      .then((data: { skills?: RawSkillLibraryRow[] }) =>
        setAllSkills((data.skills || []).map(toEscoSkillFromLibrary)),
      )
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Failed to pre-fetch skills library:', err);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [locale]);

  return {
    allSkills,
    isLoading,
  };
}
