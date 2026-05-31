'use client';

import { useEffect, useState } from 'react';
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
  const [starterSkills, setStarterSkills] = useState<EscoSkill[]>([]);
  const [searchResults, setSearchResults] = useState<EscoSkill[]>([]);
  const [isLoadingStarter, setIsLoadingStarter] = useState(false);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  useEffect(() => {
    if (isOpen) return;
    setStarterSkills([]);
    setSearchResults([]);
    setIsLoadingStarter(false);
    setIsLoadingSearch(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || hasQuery) return;

    const controller = new AbortController();
    setIsLoadingStarter(true);

    void fetchStarterSkills(locale, STARTER_SKILL_LIMIT, controller.signal)
      .then(setStarterSkills)
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStarterSkills([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingStarter(false);
      });

    return () => controller.abort();
  }, [isOpen, hasQuery, locale]);

  useEffect(() => {
    if (!isOpen || !hasQuery) {
      setSearchResults([]);
      setIsLoadingSearch(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsLoadingSearch(true);
      void fetchSkillSearchResults(trimmedQuery, locale, SEARCH_RESULT_LIMIT, controller.signal)
        .then(setSearchResults)
        .catch((error) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setSearchResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoadingSearch(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isOpen, hasQuery, trimmedQuery, locale]);

  return {
    skills: hasQuery ? searchResults : starterSkills,
    hasQuery,
    isLoading: hasQuery ? isLoadingSearch : isLoadingStarter,
  };
}
