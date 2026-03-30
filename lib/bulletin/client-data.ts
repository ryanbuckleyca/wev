import { createClient } from '@/lib/supabase/client';
import { parseDateString } from '@/lib/date-utils';

export function formatLastScrapeTime(
  rawScrapeTime: string | number | Date | null | undefined,
  locale: string,
): string | null {
  if (!rawScrapeTime) return null;

  let date: Date;
  if (typeof rawScrapeTime === 'string') {
    date = parseDateString(rawScrapeTime);
  } else {
    date = new Date(rawScrapeTime);
  }

  const dateLocale = locale === 'fr' ? 'fr-CA' : 'en-CA';
  return date.toLocaleString(dateLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  });
}

export async function fetchBookmarkedJobIds(
  userId: string,
  jobIds: string[],
): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set<string>();

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('bookmarks')
      .select('job_id')
      .eq('user_id', userId)
      .in('job_id', jobIds);

    if (error) {
      console.error('Error fetching bookmarks:', error);
      return new Set<string>();
    }

    return new Set((data ?? []).map((bookmark: { job_id: string }) => bookmark.job_id));
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    return new Set<string>();
  }
}
