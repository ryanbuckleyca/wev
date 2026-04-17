'use client';

import { useState } from 'react';
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

    try {
      const response = await fetch('/api/bookmarks/item', {
        method: newState ? 'POST' : 'DELETE',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        },
        body: JSON.stringify({ jobId: job.id }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Failed to update bookmark');
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
