'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useProfile } from '@/contexts/ProfileContext';
import { useRankedList } from '@/lib/hooks/useRankedList';
import { type EscoSkill } from '@/lib/types/skills';
import { type WorkValue, buildWorkValues, getValueDefinition } from '@/lib/values';
import type { CvImportMetadata } from '@/lib/supabase/profiles';
import { normalizeWorkTypes, type WorkType } from '@/lib/work-types';
import { type RatedValue, type RatedSkill } from '@/lib/value-ratings';
import { adjustCutoffOnRemove, adjustCutoffOnReorder } from '@/lib/ranked-list';
import {
  MAX_PROFILE_SKILLS,
  MAX_PROFILE_VALUES,
  partitionByRating,
  validateProfileLimits,
} from '@/lib/profile/profileMapping';
import { useSkillsLibrary, fetchSkillsByUri } from '@/lib/hooks/useSkillsLibrary';
import notify from '@/lib/toast';

export type LocationState = {
  lat: number;
  lng: number;
  display_name: string;
  name: string;
  province: string;
};

export { adjustCutoffOnRemove, adjustCutoffOnReorder, MAX_PROFILE_SKILLS, MAX_PROFILE_VALUES };

export function useProfileForm(locale: 'en' | 'fr') {
  const t = useTranslations('profile');
  const tValues = useTranslations('values');
  const { profile, loading: profileLoading, error: profileError, updateProfile } = useProfile();

  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    bio: '',
    work_types: [] as WorkType[],
    location: null as LocationState | null,
  });

  const { allSkills, isLoading: isLibraryLoading } = useSkillsLibrary(locale);
  const skills = useRankedList<EscoSkill>((s) => s.uri);
  const values = useRankedList<string>((v) => v);

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
    if (!profile) return;

    const hydrateKey = `${profile.id}:${profile.updated_at}:${locale}`;
    if (hydratedKeyRef.current === hydrateKey) return;
    hydratedKeyRef.current = hydrateKey;

    setFormData({
      full_name: profile.full_name || '',
      bio: profile.bio || '',
      work_types: normalizeWorkTypes(profile.work_types),
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
  }, [profile, locale, values, skills]);

  // ─── Actions ──────────────────────────────────────────────────────────

  const handleWorkTypeToggle = useCallback((workType: WorkType) => {
    setFormData((prev) => ({
      ...prev,
      work_types: prev.work_types.includes(workType)
        ? prev.work_types.filter((wt) => wt !== workType)
        : [...prev.work_types, workType],
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
        values_rated: valuesRated,
        skills: skills.items.map((s) => s.uri).slice(0, MAX_PROFILE_SKILLS),
        skills_rated: skillsRated,
        work_types: normalizeWorkTypes(formData.work_types),
        lat: formData.location?.lat ?? null,
        lng: formData.location?.lng ?? null,
        municipality: formData.location?.name ?? null,
        province: formData.location?.province ?? null,
        location_display_name: formData.location?.display_name ?? null,
      });
      notify.success(t('updateSuccess'));
      void fetch('/api/matches/recalculate-mine', { method: 'POST' });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('updateFailed'));
    } finally {
      setIsSaving(false);
    }
  }, [formData, values, skills, updateProfile, t]);

  const handleSaveCvImport = useCallback(
    async ({
      nextSkills,
      nextValues,
      skillCutoff,
      valueCutoff,
      cvImport,
    }: {
      nextSkills: EscoSkill[];
      nextValues: string[];
      skillCutoff: number;
      valueCutoff: number;
      cvImport: CvImportMetadata;
    }) => {
      const error = validateProfileLimits(nextValues.length, nextSkills.length);
      if (error) {
        notify.error(t(error.key, error.params ?? {}));
        return;
      }

      setIsSaving(true);
      try {
        const valuesRated: RatedValue[] = nextValues.map((v, i) =>
          i < valueCutoff ? { value: v, rank: i + 1 } : { value: v },
        );
        const skillsRated: RatedSkill[] = nextSkills.map((s, i) =>
          i < skillCutoff ? { skill: s.uri, rank: i + 1 } : { skill: s.uri },
        );

        await updateProfile({
          full_name: formData.full_name || null,
          bio: formData.bio || null,
          values: nextValues.slice(0, MAX_PROFILE_VALUES),
          values_rated: valuesRated,
          skills: nextSkills.map((s) => s.uri).slice(0, MAX_PROFILE_SKILLS),
          skills_rated: skillsRated,
          work_types: normalizeWorkTypes(formData.work_types),
          lat: formData.location?.lat ?? null,
          lng: formData.location?.lng ?? null,
          municipality: formData.location?.name ?? null,
          province: formData.location?.province ?? null,
          location_display_name: formData.location?.display_name ?? null,
          cv_import: cvImport,
        });

        skills.setItems(nextSkills);
        skills.setCutoff(skillCutoff);
        values.setItems(nextValues);
        values.setCutoff(valueCutoff);

        notify.success(t('cvImportSuccess'));
        void fetch('/api/matches/recalculate-mine', { method: 'POST' });
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t('updateFailed'));
      } finally {
        setIsSaving(false);
      }
    },
    [formData, skills, t, updateProfile, values],
  );

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
    handleSaveCvImport,
    handleWorkTypeToggle,
  };
}
