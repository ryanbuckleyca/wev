'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useProfile } from '@/contexts/ProfileContext';
import { useRankedList } from '@/lib/hooks/useRankedList';
import { fetchSkillsByUri } from '@/lib/skills/client';
import { type EscoSkill } from '@/lib/types/skills';
import { type WorkValue, buildWorkValues, getValueDefinition } from '@/lib/values';
import type { CvImportMetadata } from '@/lib/cv/types';
import { normalizeWorkTypes, type WorkType } from '@/lib/work-types';
import { isSupportedLanguage, normalizeLanguages } from '@/lib/languages';
import { type RatedValue, type RatedSkill } from '@/lib/value-ratings';
import { adjustCutoffOnRemove, adjustCutoffOnReorder } from '@/lib/ranked-list';
import {
  MAX_PROFILE_SKILLS,
  MAX_PROFILE_VALUES,
  partitionByRating,
  validateProfileLimits,
} from '@/lib/profile/profileMapping';
import notify from '@/lib/toast';

export type LocationState = {
  lat: number;
  lng: number;
  display_name: string;
  name: string;
  province: string;
};

export { adjustCutoffOnRemove, adjustCutoffOnReorder, MAX_PROFILE_SKILLS, MAX_PROFILE_VALUES };

export type CvImportStateUpdate<T> = {
  items: T[];
  cutoff: number;
};

type ProfileFormData = {
  full_name: string;
  bio: string;
  work_types: WorkType[];
  preferred_languages: string[];
  location: LocationState | null;
  cv_import: CvImportMetadata | null;
};

function stableStringify(value: unknown): string {
  if (typeof value === 'undefined') return 'undefined';
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    return serialized ?? String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);

  return `{${entries.join(',')}}`;
}

function normalizeLocationForSnapshot(location: LocationState | null) {
  if (!location) return null;

  return {
    display_name: location.display_name,
    lat: location.lat,
    lng: location.lng,
    name: location.name,
    province: location.province,
  };
}

function createProfileFormSnapshot({
  formData,
  skillCutoff,
  skillUris,
  valueCutoff,
  valueItems,
}: {
  formData: ProfileFormData;
  skillCutoff: number;
  skillUris: string[];
  valueCutoff: number;
  valueItems: string[];
}) {
  return stableStringify({
    bio: formData.bio,
    cv_import: formData.cv_import,
    full_name: formData.full_name,
    location: normalizeLocationForSnapshot(formData.location),
    preferred_languages: [...normalizeLanguages(formData.preferred_languages)].sort(),
    skillCutoff,
    skillUris,
    valueCutoff,
    valueItems,
    work_types: [...normalizeWorkTypes(formData.work_types)].sort(),
  });
}

/**
 * Resolves the next state for a ranked list (skills or values) after a CV import.
 * If the imported list is empty, we keep the current items and cutoff.
 * If the imported list is non-empty, we replace the items and set the cutoff to the new length.
 */
export function resolveCvImportState<T>(
  currentItems: T[],
  currentCutoff: number,
  importedItems: T[],
): CvImportStateUpdate<T> {
  if (importedItems.length === 0) {
    return { items: currentItems, cutoff: currentCutoff };
  }
  return { items: importedItems, cutoff: importedItems.length };
}

export function useProfileForm(locale: 'en' | 'fr') {
  const t = useTranslations('profile');
  const tValues = useTranslations('values');
  const { profile, loading: profileLoading, error: profileError, updateProfile } = useProfile();

  const [isSaving, setIsSaving] = useState(false);
  const [isHydratingProfile, setIsHydratingProfile] = useState(true);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    bio: '',
    work_types: [] as WorkType[],
    preferred_languages: [] as string[],
    location: null as LocationState | null,
    cv_import: null as CvImportMetadata | null,
  });

  const skills = useRankedList<EscoSkill>((s) => s.uri);
  const values = useRankedList<string>((v) => v);
  const setSkillItems = skills.setItems;
  const setSkillCutoff = skills.setCutoff;
  const setValueItems = values.setItems;
  const setValueCutoff = values.setCutoff;

  // Track the last profile snapshot we hydrated from
  const hydratedKeyRef = useRef<string | null>(null);

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
    if (!profile) {
      setLastSavedSnapshot(null);
      setIsHydratingProfile(false);
      return;
    }

    const hydrateKey = `${profile.id}:${profile.updated_at}:${locale}`;
    if (hydratedKeyRef.current === hydrateKey) return;
    hydratedKeyRef.current = hydrateKey;
    setIsHydratingProfile(true);

    const nextFormData = {
      full_name: profile.full_name || '',
      bio: profile.bio || '',
      work_types: normalizeWorkTypes(profile.work_types),
      preferred_languages: normalizeLanguages(profile.preferred_languages),
      location:
        profile.lat != null && profile.lng != null && profile.location_display_name
          ? {
              lat: profile.lat,
              lng: profile.lng,
              display_name: profile.location_display_name,
              name: profile.municipality ?? '',
              province: profile.province ?? '',
            }
          : null,
      cv_import: profile.cv_import ?? null,
    };
    setFormData(nextFormData);

    // Hydrate Values
    const pvr = profile.values_rated;
    let nextValueItems: string[];
    let nextValueCutoff: number;
    if (pvr && pvr.length > 0) {
      const ranked = [...pvr].filter((rv) => rv.rank != null).sort((a, b) => a.rank! - b.rank!);
      const unranked = pvr.filter((rv) => rv.rank == null);
      nextValueItems = [...ranked.map((rv) => rv.value), ...unranked.map((rv) => rv.value)];
      nextValueCutoff = ranked.length;
    } else {
      nextValueItems = profile.values || [];
      nextValueCutoff = 0;
    }
    setValueItems(nextValueItems);
    setValueCutoff(nextValueCutoff);

    // Hydrate Skills
    const profileSkills = Array.from(new Set(profile.skills || [])).slice(0, MAX_PROFILE_SKILLS);
    let cancelled = false;

    const saveHydratedSnapshot = (skillUris: string[], skillCutoff: number) => {
      setLastSavedSnapshot(
        createProfileFormSnapshot({
          formData: nextFormData,
          skillCutoff,
          skillUris,
          valueCutoff: nextValueCutoff,
          valueItems: nextValueItems,
        }),
      );
      setIsHydratingProfile(false);
    };

    if (profileSkills.length === 0) {
      setSkillItems([]);
      setSkillCutoff(0);
      saveHydratedSnapshot([], 0);
      return () => {
        cancelled = true;
      };
    }

    void fetchSkillsByUri(profileSkills, locale)
      .then((fetched) => {
        if (cancelled) return;

        const psr = profile.skills_rated;
        let nextSkillItems: EscoSkill[];
        let nextSkillCutoff: number;
        if (psr && psr.length > 0) {
          const { sorted, cutoff } = partitionByRating(fetched, psr);
          nextSkillItems = sorted;
          nextSkillCutoff = cutoff;
        } else {
          nextSkillItems = fetched;
          nextSkillCutoff = 0;
        }

        setSkillItems(nextSkillItems);
        setSkillCutoff(nextSkillCutoff);
        saveHydratedSnapshot(
          nextSkillItems.map((skill) => skill.uri),
          nextSkillCutoff,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSkillItems([]);
        setSkillCutoff(0);
        saveHydratedSnapshot([], 0);
      });

    return () => {
      cancelled = true;
    };
  }, [profile, locale, setSkillCutoff, setSkillItems, setValueCutoff, setValueItems]);

  const currentSnapshot = useMemo(
    () =>
      createProfileFormSnapshot({
        formData,
        skillCutoff: skills.cutoff,
        skillUris: skills.items.map((skill) => skill.uri),
        valueCutoff: values.cutoff,
        valueItems: values.items,
      }),
    [formData, skills.cutoff, skills.items, values.cutoff, values.items],
  );

  const isDirty =
    !isHydratingProfile && lastSavedSnapshot !== null && currentSnapshot !== lastSavedSnapshot;

  // ─── Actions ──────────────────────────────────────────────────────────

  const handleWorkTypeToggle = useCallback((workType: WorkType) => {
    setFormData((prev) => ({
      ...prev,
      work_types: prev.work_types.includes(workType)
        ? prev.work_types.filter((wt) => wt !== workType)
        : [...prev.work_types, workType],
    }));
  }, []);

  const handleLanguageToggle = useCallback((lang: string) => {
    if (!isSupportedLanguage(lang)) return;
    setFormData((prev) => ({
      ...prev,
      preferred_languages: prev.preferred_languages.includes(lang)
        ? prev.preferred_languages.filter((l) => l !== lang)
        : [...prev.preferred_languages, lang],
    }));
  }, []);

  const handleSaveProfile = useCallback(async () => {
    const error = validateProfileLimits(values.items.length, skills.items.length);
    if (error) {
      notify.error(t(error.key, error.params ?? {}));
      return;
    }

    const savedSnapshot = currentSnapshot;

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
        lat: formData.location?.lat ?? null,
        lng: formData.location?.lng ?? null,
        municipality: formData.location?.name ?? null,
        province: formData.location?.province ?? null,
        location_display_name: formData.location?.display_name ?? null,
        cv_import: formData.cv_import,
        preferred_languages:
          formData.preferred_languages.length > 0 ? formData.preferred_languages : null,
      });
      notify.success(t('updateSuccess'));
      void fetch('/api/matches/recalculate-mine', { method: 'POST' });
      setLastSavedSnapshot(savedSnapshot);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('updateFailed'));
    } finally {
      setIsSaving(false);
    }
  }, [currentSnapshot, formData, values, skills, updateProfile, t]);

  const handleApplyCvImport = useCallback(
    ({
      skills: nextSkills,
      values: nextValues,
      cvImport,
    }: {
      skills: EscoSkill[];
      values: string[];
      cvImport: CvImportMetadata;
      warnings: string[];
    }) => {
      // Apply to local state so the user can review before saving.
      // Keep in-progress manual selections when the CV returns an empty list
      // for a category, while still replacing that category on non-empty imports.
      const nextSkillsState = resolveCvImportState(skills.items, skills.cutoff, nextSkills);
      setSkillItems(nextSkillsState.items);
      setSkillCutoff(nextSkillsState.cutoff);

      const nextValuesState = resolveCvImportState(values.items, values.cutoff, nextValues);
      setValueItems(nextValuesState.items);
      setValueCutoff(nextValuesState.cutoff);

      setFormData((prev) => ({ ...prev, cv_import: cvImport }));

      notify.success(t('cvImportSuccess'));
    },
    [skills, values, t],
  );

  return {
    profile,
    profileLoading,
    profileError,
    formData,
    setFormData,
    selectedSkills: skills.items,
    skillCutoff: skills.cutoff,
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
    handleApplyCvImport,
    handleWorkTypeToggle,
    handleLanguageToggle,
    isDirty,
  };
}
