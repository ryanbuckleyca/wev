import type { Database } from '@/lib/supabase/database.types';

type SseDetails = NonNullable<Database['public']['Tables']['organizations']['Row']['sse_details']>;

/** Admin-authored SSE metadata when an admin sets or changes is_sse. */
export function buildAdminSseFields(isSse: boolean): {
  sse_rating: 'weak_yes' | 'no';
  sse_details: SseDetails;
} {
  return {
    sse_rating: isSse ? 'weak_yes' : 'no',
    sse_details: {
      reviewed: true,
      classified_at: new Date().toISOString(),
      confidence: 1,
      reasoning: isSse
        ? 'Marked as solidarity economy organization by admin.'
        : 'Not marked as solidarity economy organization by admin.',
      must_haves_met: [],
      nice_to_haves_met: [],
      flags: ['admin_override'],
    },
  };
}
