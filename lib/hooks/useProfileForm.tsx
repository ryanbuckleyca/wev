'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useProfile } from '@/lib/hooks/useProfile';
import { useRankedList } from '@/lib/hooks/useRankedList';
import { type EscoSkill } from '@/lib/types/skills';
import { type WorkValue, buildWorkValues, getValueDefinition } from '@/lib/values';
import { normalizeWorkTypes, type WorkType } from '@/lib/work-types';
import { type RatedValue, type RatedSkill } from '@/lib/value-ratings';
import { adjustCutoffOnRemove, adjustCutoffOnReorder } from '@/lib/ranked-list';
import toast from 'react-hot-toast';

export { adjustCutoffOnRemove, adjustCutoffOnReorder };

/** Must match DB `profiles_skills_max_10_check` and `profiles_skills_rated_max_10_check`. */
export const MAX_PROFILE_SKILLS = 10;
/** Must match DB `profiles_values_max_5_check` and `profiles_values_rated_max_5_check`. */
export const MAX_PROFILE_VALUES = 5;
export const MAX_PROFILE_WORK_ENV_CHARS = 1500;

// ─── Skills API helpers ───────────────────────────────────────────────────────

type RawSkillRow = {
  concept_uri: string;
  term: string;
  definition: string | null;
  skill_type: string | null;
  reuse_level: string | null;
};

type RawSkillLibraryRow = {
  uri: string;
  term: string;
  definition: string | null;
  type: string | null;
  level: string | null;
  aliases?: string[];
};

function toEscoSkill(s: RawSkillRow): EscoSkill {
  return {
    uri: s.concept_uri,
    preferredLabel: { en: s.term, fr: s.term },
    description: { en: s.definition, fr: s.definition },
    skillType: s.skill_type as EscoSkill['skillType'],
    reuseLevel: s.reuse_level as EscoSkill['reuseLevel'],
  };
}

function toEscoSkillFromLibrary(s: RawSkillLibraryRow): EscoSkill {
  return {
    uri: s.uri,
    preferredLabel: { en: s.term, fr: s.term },
    description: { en: s.definition, fr: s.definition },
    skillType: s.type as EscoSkill['skillType'],
    reuseLevel: s.level as EscoSkill['reuseLevel'],
    aliases: s.aliases,
  };
}

async function fetchSkillsByUri(uris: string[], locale: string): Promise<EscoSkill[]> {
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

function partitionByRating(
  skills: EscoSkill[],
  skillsRated: RatedSkill[],
): { sorted: EscoSkill[]; cutoff: number } {
  const rankMap = new Map(skillsRated.map((sr) => [sr.skill, sr.rank]));
  const ranked: EscoSkill[] = [];
  const unranked: EscoSkill[] = [];
  for (const s of skills) {
    if (rankMap.get(s.uri) != null) ranked.push(s);
    else unranked.push(s);
  }
  ranked.sort((a, b) => rankMap.get(a.uri)! - rankMap.get(b.uri)!);
  return { sorted: [...ranked, ...unranked], cutoff: ranked.length };
}

// ─── Profile validation ───────────────────────────────────────────────────────

type ValidationError = { key: string; params?: Record<string, string | number> };

export function validateProfileLimits(
  selectedValues: string[],
  selectedSkills: EscoSkill[],
  workEnvironmentLength: number,
): ValidationError | null {
  if (selectedValues.length > MAX_PROFILE_VALUES) {
    return {
      key: 'valuesMaxExceeded',
      params: { max: MAX_PROFILE_VALUES, current: selectedValues.length - MAX_PROFILE_VALUES },
    };
  }
  if (selectedSkills.length > MAX_PROFILE_SKILLS) {
    return {
      key: 'skillsMaxExceeded',
      params: { max: MAX_PROFILE_SKILLS, current: selectedSkills.length - MAX_PROFILE_SKILLS },
    };
  }
  if (workEnvironmentLength > MAX_PROFILE_WORK_ENV_CHARS) {
    return { key: 'workEnvironmentMaxExceeded', params: { max: MAX_PROFILE_WORK_ENV_CHARS } };
  }
  return null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProfileForm(userId: string | undefined, locale: 'en' | 'fr') {
  const t = useTranslations('profile');
  const tValues = useTranslations('values');
  const {
    profile,
    loading: profileLoading,
    error: profileError,
    updateProfile,
  } = useProfile(userId);

  const [isSaving, setIsSaving] = useState(false);
  const [allSkills, setAllSkills] = useState<EscoSkill[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    bio: '',
    work_types: [] as WorkType[],
    ideal_work_environment: '',
  });

  const skills = useRankedList<EscoSkill>((s) => s.uri);
  const values = useRankedList<string>((v) => v);

  const workValues: WorkValue[] = useMemo(() => {
    const tCurrent = (key: string, opts?: { defaultValue: string }) => tValues(key, opts ?? {});
    const tFallback = (key: string, opts?: { defaultValue: string }) => {
      const [id, field] = key.split('.');
      if (field === 'name') return opts?.defaultValue ?? id;
      const def = getValueDefinition(id);
      if (field === 'description') return def.description;
      return opts?.defaultValue ?? '';
    };
    return locale === 'en'
      ? buildWorkValues(tCurrent, tFallback)
      : buildWorkValues(tFallback, tCurrent);
  }, [tValues, locale]);

  // ─── Hydrate from profile ─────────────────────────────────────────────

  useEffect(() => {
    if (!profile) return;

    setFormData({
      full_name: profile.full_name || '',
      bio: profile.bio || '',
      work_types: normalizeWorkTypes(profile.work_types),
      ideal_work_environment: profile.ideal_work_environment || '',
    });

    const pvr = profile.values_rated;
    if (pvr && pvr.length > 0) {
      const ranked = [...pvr].filter((rv) => rv.rank != null).sort((a, b) => a.rank! - b.rank!);
      const unranked = pvr.filter((rv) => rv.rank == null);
      values.setItems([...ranked.map((rv) => rv.value), ...unranked.map((rv) => rv.value)]);
      values.setCutoff(ranked.length);
    } else {
      values.setItems(profile.values || []);
      values.setCutoff(0);
    }

    const profileSkills = Array.from(new Set(profile.skills || [])).slice(0, MAX_PROFILE_SKILLS);
    if (profileSkills.length === 0) {
      skills.setItems([]);
      skills.setCutoff(0);
      return;
    }

    void fetchSkillsByUri(profileSkills, locale)
      .then((fetched) => {
        const psr = profile.skills_rated;
        if (psr && psr.length > 0) {
          const { sorted, cutoff } = partitionByRating(fetched, psr);
          skills.setItems(sorted);
          skills.setCutoff(cutoff);
        } else {
          skills.setItems(fetched);
          skills.setCutoff(0);
        }
      })
      .catch(() => {
        skills.setItems([]);
        skills.setCutoff(0);
      });
  }, [profile, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Skills library ───────────────────────────────────────────────────

  useEffect(() => {
    setIsLibraryLoading(true);
    fetch(`/api/skills/all?locale=${locale}&cb=${Date.now()}`)
      .then((res) => (res.ok ? res.json() : { skills: [] }))
      .then((data: { skills?: RawSkillLibraryRow[] }) =>
        setAllSkills((data.skills || []).map(toEscoSkillFromLibrary)),
      )
      .catch((err) => console.error('Failed to pre-fetch skills library:', err))
      .finally(() => setIsLibraryLoading(false));
  }, [locale]);

  // ─── Save ─────────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    const validationError = validateProfileLimits(
      values.items,
      skills.items,
      formData.ideal_work_environment.length,
    );
    if (validationError) {
      toast.error(t(validationError.key, validationError.params ?? {}));
      return;
    }

    setIsSaving(true);
    try {
      const valuesRated: RatedValue[] = values.items.map((v, i) =>
        i < values.cutoff ? { value: v, rank: i + 1 } : { value: v },
      );
      const skillsRated: RatedSkill[] = skills.items.map((s, i) =>
        i < skills.cutoff ? { skill: s.uri, rank: i + 1 } : { skill: s.uri },
      );

      await updateProfile({
        full_name: formData.full_name || null,
        bio: formData.bio || null,
        values: values.items.slice(0, MAX_PROFILE_VALUES),
        values_rated: valuesRated,
        skills: skills.items.map((s) => s.uri).slice(0, MAX_PROFILE_SKILLS),
        skills_rated: skillsRated,
        work_types: normalizeWorkTypes(formData.work_types),
        ideal_work_environment: formData.ideal_work_environment.trim() || null,
      });
      toast.success(t('updateSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('updateFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return {
    profile,
    profileLoading,
    profileError,
    formData,
    setFormData,
    selectedSkills: skills.items,
    skillCutoff: skills.cutoff,
    allSkills,
    isLibraryLoading,
    handleSkillToggle: skills.toggle,
    handleSkillReorder: skills.reorder,
    handleSkillRemove: skills.remove,
    workValues,
    selectedValues: values.items,
    valueCutoff: values.cutoff,
    handleValueToggle: values.toggle,
    handleValueReorder: values.reorder,
    handleValueRemove: values.remove,
    isSaving,
    handleSaveProfile,
  };
}
