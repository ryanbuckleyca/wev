'use client';

import { useLocale } from 'next-intl';
import BulletinPageView from '@/components/BulletinPageView';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useBulletinData } from '@/lib/hooks/useBulletinData';
import { useBulletinFilters } from '@/lib/hooks/useBulletinFilters';
import { useLikelySession } from '@/lib/hooks/useLikelySession';
import type { SerializedMatchData } from '@/lib/bulletin/server-data';
import type { JobPosting } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase/profiles';
import type { SkillLabel } from '@/lib/bulletin/types';
import type { BulletinFilterOptions } from '@/lib/bulletin/filter-options';

interface BulletinPageClientProps {
  initialJobs: JobPosting[];
  initialScrapeTime: string | null;
  initialSkillLabels: Record<string, SkillLabel>;
  initialFilterOptions: BulletinFilterOptions;
  initialTotalJobs: number;
  initialTotalAvailable?: number;
  initialUserId?: string | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  // Provided when the user was authenticated server-side:
  initialMatchData?: SerializedMatchData;
  initialBookmarkedJobIds?: string[];
  initialProfile?: Profile | null;
}

/**
 * Client entry point for the bulletin page.
 *
 * Receives anonymous SSR jobs for CDN-cacheable HTML. Logged-out visitors keep
 * that shell. Visitors with a session cookie discard it before paint and see a
 * skeleton until their personalized fetch (profile filters + matches) is ready.
 */
export default function BulletinPageClient({
  initialJobs,
  initialScrapeTime,
  initialSkillLabels,
  initialFilterOptions,
  initialTotalJobs,
  initialTotalAvailable,
  initialUserId,
  isLoggedIn,
  isAdmin,
  initialMatchData,
  initialBookmarkedJobIds,
  initialProfile,
}: BulletinPageClientProps) {
  const locale = useLocale();
  const { checked, likely } = useLikelySession();
  const sessionCookie: boolean | null = checked ? likely : null;

  // Client-side auth/profile — used for reactivity after login/logout.
  // SSR values are used until auth resolves on the hydration frame; once a
  // session cookie is known, treat auth as pending rather than logged-out.
  const { user, role, loading: authLoading } = useAuth();
  const { profile: clientProfile } = useProfile();

  const effectiveUserId = authLoading ? (initialUserId ?? null) : (user?.id ?? null);
  const effectiveIsLoggedIn = authLoading ? (sessionCookie === true ? true : isLoggedIn) : !!user;
  const effectiveIsAdmin = authLoading ? isAdmin : role === 'admin';

  // Live profile from ProfileContext once loaded, falling back to SSR snapshot.
  const profile = effectiveUserId ? (clientProfile ?? initialProfile ?? null) : null;

  const filters = useBulletinFilters({
    initialProfile,
    initialUserId,
    isAdmin: effectiveIsAdmin,
    sessionCookie,
  });

  const data = useBulletinData(
    locale,
    effectiveUserId,
    {
      filters: filters.filters,
      hasAnyFilters: filters.hasAnyFilters,
      sortBy: filters.sortBy,
      currentPage: filters.currentPage,
      setCurrentPage: filters.setCurrentPage,
      filtersReady: filters.filtersReady,
      sessionCookie,
    },
    {
      jobs: initialJobs,
      scrapeTime: initialScrapeTime,
      total: initialTotalJobs,
      totalAvailable: initialTotalAvailable,
      userId: initialUserId,
      matchData: initialMatchData,
      bookmarkedJobIds: initialBookmarkedJobIds,
      skillLabels: initialSkillLabels,
      filterOptions: initialFilterOptions,
    },
  );

  return (
    <BulletinPageView
      isAdmin={effectiveIsAdmin}
      isLoggedIn={effectiveIsLoggedIn}
      userId={effectiveUserId}
      profile={profile}
      filters={filters}
      data={data}
    />
  );
}
