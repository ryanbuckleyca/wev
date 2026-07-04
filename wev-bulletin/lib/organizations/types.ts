import type { Database } from '@/lib/supabase/database.types';

export type OrgRecord = Database['public']['Tables']['organizations']['Row'];

export interface OrgIndexEntry extends OrgRecord {
  active_job_count: number;
}

export interface OrgJobPosting {
  id: string;
  job_title: string;
  listing_url: string;
  date_posted: string | null;
  employment_type: string | null;
  location: string | null;
  work_type: string | null;
}
