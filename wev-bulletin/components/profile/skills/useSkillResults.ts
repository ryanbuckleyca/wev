'use client';

import { useAbortableFetch } from '@/hooks/useAbortableFetch';
import { fetchSkillSearchResults, fetchStarterSkills } from '@/lib/skills/client';
import type { EscoSkill } from '@/lib/types/skills';

const STARTER_SKILL_LIMIT = 10;
const SEARCH_RESULT_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 200;

interface UseSkillResultsArgs {
  isOpen: boolean;
  query: string;
  locale: 'en' | 'fr';
}

export function useSkillResults({ isOpen, query, locale }: UseSkillResultsArgs) {
  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  const {
    data: starterSkills,
    loading: isLoadingStarter,
    setData: setStarterSkills,
  } = useAbortableFetch(fetchStarterSkills, [locale, STARTER_SKILL_LIMIT], isOpen && !hasQuery);

  const {
    data: searchResults,
    loading: isLoadingSearch,
    setData: setSearchResults,
  } = useAbortableFetch(
    fetchSkillSearchResults,
    [trimmedQuery, locale, SEARCH_RESULT_LIMIT],
    isOpen && hasQuery,
    SEARCH_DEBOUNCE_MS,
  );

  return {
    skills: (hasQuery ? searchResults : starterSkills) ?? [],
    hasQuery,
    isLoading: hasQuery ? isLoadingSearch : isLoadingStarter,
  };
}
