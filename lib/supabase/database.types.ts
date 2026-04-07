export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      bookmarks: {
        Row: {
          created_at: string;
          job_id: string;
          notes: string | null;
          tags: string[];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          job_id: string;
          notes?: string | null;
          tags?: string[];
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['bookmarks']['Insert']>;
        Relationships: [];
      };
      job_matches: {
        Row: {
          job_id: string;
          location_score: number | null;
          score: number;
          shared_skills: string[] | null;
          shared_values: string[];
          skill_score: number | null;
          updated_at: string;
          user_id: string;
          value_score: number | null;
          work_type_score: number | null;
        };
        Insert: {
          job_id: string;
          location_score?: number | null;
          score: number;
          shared_skills?: string[] | null;
          shared_values?: string[];
          skill_score?: number | null;
          updated_at?: string;
          user_id: string;
          value_score?: number | null;
          work_type_score?: number | null;
        };
        Update: Partial<Database['public']['Tables']['job_matches']['Insert']>;
        Relationships: [];
      };
      jobs: {
        Row: {
          close_date: string | null;
          compensation_meta: Json | null;
          date_posted: string | null;
          description: string | null;
          employment_type: string | null;
          external_job_id: string | null;
          extra: Json;
          geocode_accuracy_type: string | null;
          hours_per_week: number | null;
          id: string;
          is_remote: boolean | null;
          is_sse: boolean;
          job_title: string;
          language: string;
          lat: number | null;
          listing_url: string;
          lng: number | null;
          location: string | null;
          max_value: number | null;
          min_value: number | null;
          municipality: string | null;
          organization: string;
          province: string | null;
          scraped_at: string;
          source_id: string;
          sse_details: Json | null;
          sse_rating: string | null;
          skills: string[] | null;
          summary: string | null;
          unit_text: string | null;
          values: string[] | null;
          values_rated: Json | null;
          wage: string | null;
          work_type: 'hybrid' | 'office' | 'remote';
        };
        Insert: {
          close_date?: string | null;
          compensation_meta?: Json | null;
          date_posted?: string | null;
          description?: string | null;
          employment_type?: string | null;
          external_job_id?: string | null;
          extra?: Json;
          geocode_accuracy_type?: string | null;
          hours_per_week?: number | null;
          id: string;
          is_remote?: boolean | null;
          is_sse?: boolean;
          job_title: string;
          language?: string;
          lat?: number | null;
          listing_url: string;
          lng?: number | null;
          location?: string | null;
          max_value?: number | null;
          min_value?: number | null;
          municipality?: string | null;
          organization: string;
          province?: string | null;
          scraped_at?: string;
          source_id: string;
          sse_details?: Json | null;
          sse_rating?: string | null;
          skills?: string[] | null;
          summary?: string | null;
          unit_text?: string | null;
          values?: string[] | null;
          values_rated?: Json | null;
          wage?: string | null;
          work_type?: 'hybrid' | 'office' | 'remote';
        };
        Update: Partial<Database['public']['Tables']['jobs']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          bio: string | null;
          created_at: string | null;
          full_name: string | null;
          id: string;
          lat: number | null;
          lng: number | null;
          location_display_name: string | null;
          municipality: string | null;
          profile_photo_url: string | null;
          province: string | null;
          skills: string[] | null;
          skills_rated: Json | null;
          updated_at: string | null;
          values: string[];
          values_rated: Json | null;
          work_types: string[] | null;
        };
        Insert: {
          bio?: string | null;
          created_at?: string | null;
          full_name?: string | null;
          id: string;
          lat?: number | null;
          lng?: number | null;
          location_display_name?: string | null;
          municipality?: string | null;
          profile_photo_url?: string | null;
          province?: string | null;
          skills?: string[] | null;
          skills_rated?: Json | null;
          updated_at?: string | null;
          values?: string[];
          values_rated?: Json | null;
          work_types?: string[] | null;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      scrape_runs: {
        Row: {
          ended_at: string | null;
          errors: string | null;
          id: string;
          jobs_added: number | null;
          jobs_found: number | null;
          run_at: string | null;
          source_id: string | null;
          sources_with_errors: number;
          started_at: string;
          status: string;
          total_jobs_found: number;
          total_jobs_inserted: number;
          total_sources: number;
        };
        Insert: {
          ended_at?: string | null;
          errors?: string | null;
          id: string;
          jobs_added?: number | null;
          jobs_found?: number | null;
          run_at?: string | null;
          source_id?: string | null;
          sources_with_errors?: number;
          started_at?: string;
          status?: string;
          total_jobs_found?: number;
          total_jobs_inserted?: number;
          total_sources?: number;
        };
        Update: Partial<Database['public']['Tables']['scrape_runs']['Insert']>;
        Relationships: [];
      };
      sources: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          url: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id: string;
          name: string;
          url: string;
        };
        Update: Partial<Database['public']['Tables']['sources']['Insert']>;
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string | null;
          roles: string[] | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          roles?: string[] | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['user_roles']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}

export type PublicSchema = Database['public'];
export type PublicTableName = keyof PublicSchema['Tables'];
export type TableInsert<Name extends PublicTableName> = PublicSchema['Tables'][Name]['Insert'];
export type TableRow<Name extends PublicTableName> = PublicSchema['Tables'][Name]['Row'];
