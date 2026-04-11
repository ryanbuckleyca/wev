import { createClient } from '@/lib/supabase/client';
import type { JobMatchData } from '@/lib/supabase';

type JobMatchRow = {
  job_id: string;
  score: number;
  value_score?: number | null;
  skill_score?: number | null;
  work_type_score?: number | null;
  location_score?: number | null;
  shared_values: string[];
  shared_skills?: string[];
};

const MATCH_SELECT =
  'job_id, score, value_score, skill_score, work_type_score, location_score, shared_values, shared_skills';

export function buildMatchMap(
  matches: JobMatchRow[] | null | undefined,
): Map<string, JobMatchData> {
  const matchMap = new Map<string, JobMatchData>();

  matches?.forEach((match) => {
    matchMap.set(match.job_id, {
      score: match.score,
      value_score: match.value_score,
      skill_score: match.skill_score,
      work_type_score: match.work_type_score,
      location_score: match.location_score,
      shared_values: match.shared_values ?? [],
      shared_skills: match.shared_skills ?? [],
    });
  });

  return matchMap;
}

export async function fetchMatchMapForJobs(
  userId: string,
  jobIds: string[],
): Promise<Map<string, JobMatchData>> {
  if (jobIds.length === 0) return new Map();

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('job_matches')
      .select(MATCH_SELECT)
      .eq('user_id', userId)
      .in('job_id', jobIds);

    if (error) {
      console.error('Error fetching match data:', error);
      return new Map();
    }

    return buildMatchMap(data);
  } catch (error) {
    console.error('Error fetching match data:', error);
    return new Map();
  }
}
