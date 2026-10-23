'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  SOFT_PROFILE_SKILLS,
  MAX_PROFILE_VALUES,
  partitionByRating,
  validateProfileLimits,
} from '@/lib/profile/profileMapping';
import notify from '@/lib/toast';
import { useUnsavedChangesWarning } from '@/lib/hooks/useUnsavedChangesWarning';
import { serializeProfileFormState } from '@/lib/profile/profileFormSnapshot';

export type LocationState = {
  lat: number;
  lng: number;
  display_name: string;
  name: string;
  province: string;
};

export {
  adjustCutoffOnRemove,
  adjustCutoffOnReorder,
  MAX_PROFILE_SKILLS,
  SOFT_PROFILE_SKILLS,
  MAX_PROFILE_VALUES,
};

export type CvImportStateUpdate<T> = {
  items: T[];
  cutoff: number;
};

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
  const [hydrationComplete, setHydrationComplete] = useState(false);
  const [baselineSnapshot, setBaselineSnapshot] = useState<string | null>(null);
  const baselineKeyRef = useRef<string | null>(null);
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

  // Track the last profile snapshot we hydrated from
  const hydratedKeyRef = useRef<string | null>(null);
  // Bumped on local skill edits so in-flight post-save hydrations cannot overwrite them.
  const skillsHydrationEpochRef = useRef(0);

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

    const hydrateKey = `${profile.id}:${profile.updated_at}:${locale}`;
    if (hydratedKeyRef.current === hydrateKey) return;
    hydratedKeyRef.current = hydrateKey;
    baselineKeyRef.current = null;
    setHydrationComplete(false);

    setFormData({
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
    });

    // Hydrate Values
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

    // Hydrate Skills
    const profileSkills = Array.from(new Set(profile.skills || [])).slice(0, MAX_PROFILE_SKILLS);
    if (profileSkills.length === 0) {
      skills.setItems([]);
      skills.setCutoff(0);
      setHydrationComplete(true);
      return;
    }

    const skillsEpochAtStart = skillsHydrationEpochRef.current;
    void fetchSkillsByUri(profileSkills, locale)
      .then((fetched) => {
        if (skillsEpochAtStart !== skillsHydrationEpochRef.current) {
          // A local edit landed while this fetch was in flight. Preserve the
          // edited skills in form state, but record the server-fetched skills
          // as the saved baseline so isDirty can detect the unsaved change.
          const psr = profile.skills_rated;
          let savedSkills: EscoSkill[];
          let savedCutoff: number;
          if (psr && psr.length > 0) {
            const { sorted, cutoff } = partitionByRating(fetched, psr);
            savedSkills = sorted;
            savedCutoff = cutoff;
          } else {
            savedSkills = fetched;
            savedCutoff = 0;
          }
          const savedBaseline = serializeProfileFormState({
            formData: {
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
            },
            valueItems: values.items,
            valueCutoff: values.cutoff,
            skillItems: savedSkills,
            skillCutoff: savedCutoff,
          });
          baselineKeyRef.current = `${profile.id}:${profile.updated_at}:${locale}`;
          setBaselineSnapshot(savedBaseline);
          return;
        }

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
        if (skillsEpochAtStart !== skillsHydrationEpochRef.current) return;
        skills.setItems([]);
        skills.setCutoff(0);
      })
      .finally(() => {
        // Always mark hydration complete so isDirty can fire even when a local
        // edit blocked the setItems above. The edited skills are already in state.
        setHydrationComplete(true);
      });
  }, [profile, locale, values, skills]);

  const currentSnapshot = useMemo(() => {
    if (!profile || profileLoading || !hydrationComplete) return null;
    return serializeProfileFormState({
      formData,
      valueItems: values.items,
      valueCutoff: values.cutoff,
      skillItems: skills.items,
      skillCutoff: skills.cutoff,
    });
  }, [
    profile,
    profileLoading,
    hydrationComplete,
    formData,
    values.items,
    values.cutoff,
    skills.items,
    skills.cutoff,
  ]);

  useEffect(() => {
    if (!profile || !hydrationComplete || currentSnapshot === null) return;

    const hydrationKey = `${profile.id}:${profile.updated_at}:${locale}`;
    if (baselineKeyRef.current === hydrationKey) return;

    baselineKeyRef.current = hydrationKey;
    setBaselineSnapshot(currentSnapshot);
  }, [profile, locale, hydrationComplete, currentSnapshot]);

  const isDirty =
    hydrationComplete &&
    currentSnapshot !== null &&
    baselineSnapshot !== null &&
    currentSnapshot !== baselineSnapshot;

  useUnsavedChangesWarning(isDirty, t('unsavedChangesWarning'));

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
        values_rated: valuesRated.slice(0, MAX_PROFILE_VALUES),
        skills: skills.items.map((s) => s.uri).slice(0, MAX_PROFILE_SKILLS),
        skills_rated: skillsRated.slice(0, MAX_PROFILE_SKILLS),
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
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('updateFailed'));
    } finally {
      setIsSaving(false);
    }
  }, [formData, values, skills, updateProfile, t]);

  const bumpSkillsHydrationEpoch = useCallback(() => {
    skillsHydrationEpochRef.current += 1;
  }, []);

  const handleSkillToggle = useCallback(
    (item: EscoSkill) => {
      bumpSkillsHydrationEpoch();
      skills.toggle(item);
    },
    [bumpSkillsHydrationEpoch, skills],
  );

  const handleSkillReorder = useCallback(
    (from: number, to: number, explicitCutoff?: number) => {
      bumpSkillsHydrationEpoch();
      skills.reorder(from, to, explicitCutoff);
    },
    [bumpSkillsHydrationEpoch, skills],
  );

  const handleSkillRemove = useCallback(
    (id: string) => {
      bumpSkillsHydrationEpoch();
      skills.remove(id);
    },
    [bumpSkillsHydrationEpoch, skills],
  );

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
      // Only bump the epoch when the CV actually replaces the skill list. When it
      // returns empty and keeps the current list, leave any pending saved-skill
      // hydration unblocked so it can complete normally.
      if (nextSkills.length > 0) bumpSkillsHydrationEpoch();
      skills.setItems(nextSkillsState.items);
      skills.setCutoff(nextSkillsState.cutoff);

      const nextValuesState = resolveCvImportState(values.items, values.cutoff, nextValues);
      values.setItems(nextValuesState.items);
      values.setCutoff(nextValuesState.cutoff);

      setFormData((prev) => ({ ...prev, cv_import: cvImport }));

      notify.success(t('cvImportSuccess'));
    },
    [bumpSkillsHydrationEpoch, skills, values, t],
  );

  return {
    profile,
    profileLoading,
    profileError,
    isDirty,
    formData,
    setFormData,
    selectedSkills: skills.items,
    skillCutoff: skills.cutoff,
    handleSkillToggle,
    handleSkillReorder,
    handleSkillRemove,
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
  };
}
