import type { Database } from '@/lib/supabase/database.types';

export type OrgRecord = Database['public']['Tables']['organizations']['Row'];

/**
 * Fields returned by the get_active_organizations RPC for each index entry.
 * Deliberately limited to what the index page and org cards actually use —
 * avoids transferring heavy jsonb blobs (sse_details, values_rated) on every
 * index load. The RPC still returns them; they're just not typed here.
 *
 * If you add a field here, make sure the RPC SELECT list includes it.
 */
export interface OrgIndexEntry {
  id: OrgRecord['id'];
  name: OrgRecord['name'];
  slug: OrgRecord['slug'];
  description: OrgRecord['description'];
  mission_statement: OrgRecord['mission_statement'];
  website: OrgRecord['website'];
  location: OrgRecord['location'];
  is_sse: OrgRecord['is_sse'];
  type: OrgRecord['type'];
  sector_id: OrgRecord['sector_id'];
  values_list: OrgRecord['values_list'];
  // RPC-computed fields
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
  municipality?: string | null;
  skills?: string[] | null;
  values?: string[] | null;
  skill_labels?: Record<
    string,
    { term: string; definition: string | null; scope_note: string | null }
  >;
}
