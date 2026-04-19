import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  fetchSkillLabels,
  fetchLastScrapeTime,
  fetchBulletinFilterOptions,
  BULLETIN_CACHE_TAG,
} from '@/lib/bulletin/server-data';
import { parseLocale } from '@/lib/resolve-skill-labels';
import { queryBulletinJobs } from '@/lib/bulletin/query-builder';
import type { BulletinFilters, JobSortOption } from '@/lib/bulletin/job-query';
import { POSTED_WITHIN_FILTER_OPTIONS, JOB_SORT_OPTIONS } from '@/lib/bulletin/job-query';

// Re-export so /api/revalidate-jobs and /api/bulletin/jobs/[id] can reference the same tag.
export { BULLETIN_CACHE_TAG };

/**
 * Parse a comma-separated query parameter into a string array.
 * Returns an empty array if the param is missing or empty.
 */
function parseArrayParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = parseLocale(searchParams.get('locale'));

    // ── Parse filter params ──────────────────────────────────────────────
    const rawSort = searchParams.get('sort') ?? 'date-desc';
    const sortBy: JobSortOption = (JOB_SORT_OPTIONS as readonly string[]).includes(rawSort)
      ? (rawSort as JobSortOption)
      : 'date-desc';

    const rawPostedWithin = searchParams.get('posted') ?? 'any';
    const postedWithin = (POSTED_WITHIN_FILTER_OPTIONS as readonly string[]).includes(
      rawPostedWithin,
    )
      ? (rawPostedWithin as (typeof POSTED_WITHIN_FILTER_OPTIONS)[number])
      : 'any';

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);

    const filters: BulletinFilters = {
      searchQuery: searchParams.get('q') ?? '',
      selectedOrganizations: parseArrayParam(searchParams.get('org')),
      selectedProvinces: parseArrayParam(searchParams.get('province')),
      selectedMunicipalities: parseArrayParam(searchParams.get('municipality')),
      selectedEmploymentTypes: parseArrayParam(searchParams.get('employment')),
      selectedSources: parseArrayParam(searchParams.get('source')),
      selectedWorkTypes: parseArrayParam(searchParams.get('workType')),
      showOnlySse: searchParams.get('sse') !== 'false',
      showJobsWithoutSalary: searchParams.get('salary') !== 'false',
      postedWithin,
    };

    // ── Execute queries in parallel ──────────────────────────────────────
    // Use per-request user-scoped client so the View's auth.uid() resolves.
    const supabase = await createClient();

    const [queryResult, skillLabels, lastScrapeTime, filterOptions] = await Promise.all([
      queryBulletinJobs(supabase, { filters, sortBy, page, locale }),
      fetchSkillLabels(locale),
      fetchLastScrapeTime(),
      fetchBulletinFilterOptions(),
    ]);

    // ── Map View rows to the expected JobPosting shape ────────────────────
    const jobs = queryResult.jobs.map((row) => {
      // source_name comes from the View; map it to 'source' for client compat
      const { source_name, match_score, match_value_score, match_skill_score, ...rest } =
        row as Record<string, unknown>;
      return {
        ...rest,
        source: source_name ?? null,
      };
    });

    return NextResponse.json(
      {
        jobs,
        totalCount: queryResult.totalCount,
        lastScrapeTime,
        skillLabels,
        filterOptions,
      },
      {
        headers: {
          // Per-request results — short cache to reduce DB hits for identical
          // rapid-fire requests (e.g. pagination clicks), but not long-lived.
          'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bulletin';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
