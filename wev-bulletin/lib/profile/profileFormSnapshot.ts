import type { CvImportMetadata } from '@/lib/cv/types';
import { normalizeLanguages } from '@/lib/languages';
import type { EscoSkill } from '@/lib/types/skills';
import { type RatedSkill, type RatedValue } from '@/lib/value-ratings';
import { normalizeWorkTypes, type WorkType } from '@/lib/work-types';
import type { LocationState } from '@/lib/hooks/useProfileForm';
import { MAX_PROFILE_SKILLS, MAX_PROFILE_VALUES } from '@/lib/profile/profileMapping';

export type ProfileFormSnapshotInput = {
  formData: {
    full_name: string;
    bio: string;
    work_types: WorkType[];
    preferred_languages: string[];
    location: LocationState | null;
    cv_import: CvImportMetadata | null;
  };
  valueItems: string[];
  valueCutoff: number;
  skillItems: EscoSkill[];
  skillCutoff: number;
};

function buildComparablePayload({
  formData,
  valueItems,
  valueCutoff,
  skillItems,
  skillCutoff,
}: ProfileFormSnapshotInput) {
  const valuesRated: RatedValue[] = valueItems.map((v, i) =>
    i < valueCutoff ? { value: v, rank: i + 1 } : { value: v },
  );
  const skillsRated: RatedSkill[] = skillItems.map((s, i) =>
    i < skillCutoff ? { skill: s.uri, rank: i + 1 } : { skill: s.uri },
  );

  return {
    full_name: formData.full_name || null,
    bio: formData.bio || null,
    values: valueItems.slice(0, MAX_PROFILE_VALUES),
    values_rated: valuesRated,
    skills: skillItems.map((s) => s.uri).slice(0, MAX_PROFILE_SKILLS),
    skills_rated: skillsRated,
    work_types: normalizeWorkTypes(formData.work_types),
    lat: formData.location?.lat ?? null,
    lng: formData.location?.lng ?? null,
    municipality: formData.location?.name ?? null,
    province: formData.location?.province ?? null,
    location_display_name: formData.location?.display_name ?? null,
    cv_import: formData.cv_import,
    preferred_languages:
      formData.preferred_languages.length > 0
        ? normalizeLanguages(formData.preferred_languages)
        : null,
  };
}

export function serializeProfileFormState(input: ProfileFormSnapshotInput): string {
  return JSON.stringify(buildComparablePayload(input));
}
