'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from '@/i18n/navigation';
import { type JobPosting } from '@/lib/supabase';

/**
 * Hook to manage the optimistic bookmarking logic and Supabase persistence.
 */
export function useBookmarkAction(
  job: JobPosting,
  userId: string | null,
  initialBookmarked: boolean,
  onToggle?: (job: JobPosting, bookmarked: boolean) => void,
) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Sync internal state with external prop changes (e.g. after a re-fetch)
  useEffect(() => {
    setBookmarked(initialBookmarked);
  }, [initialBookmarked]);

  const toggleBookmark = async () => {
    if (!userId) {
      router.push('/login');
      return;
    }

    const newState = !bookmarked;

    // Optimistic UI update
    setBookmarked(newState);
    onToggle?.(job, newState);

    setIsLoading(true);
    const supabase = createClient();

    try {
      if (newState) {
        const { error } = await supabase
          .from('bookmarks')
          .insert([{ user_id: userId, job_id: job.id }]);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', userId)
          .eq('job_id', job.id);
        if (error) throw error;
      }
    } catch (err) {
      console.error('Bookmark update failed:', err);
      // Rollback on failure
      setBookmarked(!newState);
      onToggle?.(job, !newState);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    bookmarked,
    isLoading,
    toggleBookmark,
  };
}
