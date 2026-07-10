import type { ReactNode } from 'react';
import type { SkillLabel } from '@/lib/bulletin/types';
import type { JobMatchData } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase/profiles';

export interface SkillLabelMaps {
  terms: Record<string, string>;
  defs: Record<string, string>;
}

export interface RoundedMatchScores {
  total: number;
  values: number;
  skills: number;
  workType?: number;
  location?: number;
}

export interface ProfileMatchPreferences {
  workTypes: string[];
  hasLocationValue: boolean;
}

export function buildSkillLabelMaps(
  skills: string[],
  source: Record<string, SkillLabel> = {},
): SkillLabelMaps {
  const terms: Record<string, string> = {};
  const defs: Record<string, string> = {};
  for (const uri of skills) {
    const label = source[uri];
    const lastPart = uri.includes('/') ? uri.split('/').pop() : uri;
    const fallbackTerm =
      lastPart && uri.includes('/') ? lastPart.replace(/-/g, ' ') : (lastPart ?? uri);
    terms[uri] = label?.term ?? fallbackTerm;
    const parts = [label?.definition, label?.scope_note].filter(Boolean);
    if (parts.length > 0) defs[uri] = parts.join('<br/><br/>');
  }
  return { terms, defs };
}

export function buildRoundedMatchScores(match: JobMatchData): RoundedMatchScores {
  const round = (val: number | null | undefined) => (val != null ? Math.round(val * 100) : 0);
  return {
    total: round(match.score),
    values: round(match.value_score),
    skills: round(match.skill_score),
    workType: match.work_type_score != null ? round(match.work_type_score) : undefined,
    location: match.location_score != null ? round(match.location_score) : undefined,
  };
}

export function buildProfileMatchPreferences(profile: Profile | null): ProfileMatchPreferences {
  const workTypes = profile?.work_types ?? [];
  const hasLocationValue =
    (profile?.values ?? []).some((v) => v.toLowerCase() === 'location') ||
    (profile?.values_rated ?? []).some((rv) => rv.value.toLowerCase() === 'location');
  return { workTypes, hasLocationValue };
}

export interface JobMatchTooltipInput {
  match: JobMatchData;
  scoreData: RoundedMatchScores;
  values: string[];
  skills: string[];
  skillTerms: Record<string, string>;
  workType?: 'remote' | 'hybrid' | 'office' | null;
  municipality?: string | null;
  profilePreferences: ProfileMatchPreferences;
}

/** Props bag for MatchDetailsTooltip — import the component at the call site. */
export type JobMatchTooltipProps = {
  totalMatchPercentage: number;
  valueMatchPercentage: number;
  skillMatchPercentage: number;
  workTypeMatchPercentage?: number;
  locationMatchPercentage?: number;
  jobWorkType?: 'remote' | 'hybrid' | 'office' | null;
  jobMunicipality?: string | null;
  profileWorkTypes: string[];
  profileHasLocationValue: boolean;
  values: string[];
  skills: string[];
  sharedValues: string[];
  sharedSkills: string[];
  skillTerms: Record<string, string>;
};

export function buildJobMatchTooltipProps(input: JobMatchTooltipInput): JobMatchTooltipProps {
  const { match, scoreData, values, skills, skillTerms, workType, municipality, profilePreferences } =
    input;
  return {
    totalMatchPercentage: scoreData.total,
    valueMatchPercentage: scoreData.values,
    skillMatchPercentage: scoreData.skills,
    workTypeMatchPercentage: scoreData.workType,
    locationMatchPercentage: scoreData.location,
    jobWorkType: workType ?? null,
    jobMunicipality: municipality ?? null,
    profileWorkTypes: profilePreferences.workTypes,
    profileHasLocationValue: profilePreferences.hasLocationValue,
    values,
    skills,
    sharedValues: match.shared_values || [],
    sharedSkills: match.shared_skills || [],
    skillTerms,
  };
}
