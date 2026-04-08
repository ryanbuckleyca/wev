'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from '@/i18n/navigation';
import { type JobPosting } from '@/lib/supabase';
import { type User } from '@supabase/supabase-js';

/**
 * Hook to manage the optimistic bookmarking logic and Supabase persistence.
 */
export function useBookmarkAction(
  job: JobPosting,
  user: User | null,
  initialBookmarked: boolean,
  onToggle?: (job: JobPosting, bookmarked: boolean) => void,
) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const toggleBookmark = async () => {
    if (!user) {
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
          .insert([{ user_id: user.id, job_id: job.id }]);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', user.id)
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
