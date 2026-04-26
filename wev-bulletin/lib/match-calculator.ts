import { supabaseServer } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

/**
 * Calculate matches for a single user against all jobs.
 *
 * This function handles background recalculation by calling the database RPC:
 * `recalculate_matches_for_user(p_user_id UUID)`
 *
 * The underlying Postgres logic incorporates:
 * 1. **Values (55%)**: exact overlap and ranked confidence weights.
 * 2. **Skills (35%)**: exact URI matches and semantic vector similarity (pgvector).
 * 3. **Work Type (5%)**: matching discrete work modalities (remote, hybrid, etc).
 * 4. **Location (5%)**: Canadian-tuned distance scoring and municipality logic.
 */
export async function calculateUserMatches(userId: string): Promise<void> {
  try {
    const { error } = await supabaseServer.rpc('recalculate_matches_for_user', {
      p_user_id: userId,
    });

    if (error) {
      logger.error({ err: error, userId }, 'Error calling recalculate_matches_for_user RPC');
    }
  } catch (error) {
    logger.error({ err: error, userId }, 'Exception in calculateUserMatches');
  }
}

/**
 * Calculate matches for a single job against all users.
 *
 * This function handles background recalculation by calling the database RPC:
 * `recalculate_matches_for_job(p_job_id UUID)`
 *
 * Note: This internally iterates over relevant users and computes the full
 * dimension matrix as defined in the user-recalculation function.
 */
export async function calculateJobMatches(jobId: string): Promise<void> {
  try {
    const { error } = await supabaseServer.rpc('recalculate_matches_for_job', {
      p_job_id: jobId,
    });

    if (error) {
      logger.error({ err: error, jobId }, 'Error calling recalculate_matches_for_job RPC');
    }
  } catch (error) {
    logger.error({ err: error, jobId }, 'Exception in calculateJobMatches');
  }
}
