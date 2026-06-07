import { type EscoSkill } from '@/lib/types/skills';
import { type RatedSkill } from '@/lib/value-ratings';

export const MAX_PROFILE_SKILLS = 10;
export const MAX_PROFILE_VALUES = 5;

/**
 * Partitions a list of skills into ranked and unranked based on profile data.
 */
export function partitionByRating(
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

export type ValidationError = { key: string; params?: Record<string, string | number> };

/**
 * Validates that the profile selections are within allowed limits.
 */
export function validateProfileLimits(
  selectedValuesCount: number,
  selectedSkillsCount: number,
): ValidationError | null {
  if (selectedValuesCount > MAX_PROFILE_VALUES) {
    return {
      key: 'valuesMaxExceeded',
      params: { max: MAX_PROFILE_VALUES, current: selectedValuesCount - MAX_PROFILE_VALUES },
    };
  }
  if (selectedSkillsCount > MAX_PROFILE_SKILLS) {
    return {
      key: 'skillsMaxExceeded',
      params: { max: MAX_PROFILE_SKILLS, current: selectedSkillsCount - MAX_PROFILE_SKILLS },
    };
  }
  return null;
}
