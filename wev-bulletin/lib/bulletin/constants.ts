export const BULLETIN_CACHE_TAG = 'bulletin-jobs';

/** Jobs older than this are never shown in the bulletin. */
export const JOBS_MAX_AGE_MS = 28 * 24 * 60 * 60 * 1000;

export const JOBS_SELECT_COLUMNS =
  'id, job_title, organization, location, municipality, province, work_type, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse, source_id, sources(name), values, skills, unit_text, min_value, max_value, hours_per_week' as const;

export const POSTED_WITHIN_DAYS = {
  '1-week': 7,
  '2-weeks': 14,
  '3-weeks': 21,
  '1-month': 30,
} as const;
