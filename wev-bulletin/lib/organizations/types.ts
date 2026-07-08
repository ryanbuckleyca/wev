import type { Database } from '@/lib/supabase/database.types';

export type OrgRecord = Database['public']['Tables']['organizations']['Row'];

export interface OrgIndexEntry extends OrgRecord {
  active_job_count: number;
  total_count: number;
  value_score: number | null;
  shared_values: string[] | null;
}

type JobRow = Database['public']['Tables']['jobs']['Row'];

export interface OrgJobPosting {
  id: JobRow['id']; // string (UUID) — mirrors jobs.id in database.types.ts
  job_title: string;
  listing_url: string | null;
  date_posted: string | null;
  employment_type: string | null;
  location: string | null;
  work_type: string | null;
}
