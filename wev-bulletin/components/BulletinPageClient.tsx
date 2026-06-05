'use client';

import { useLocale } from 'next-intl';
import BulletinPageView from '@/components/BulletinPageView';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useBulletinData } from '@/lib/hooks/useBulletinData';
import { useBulletinFilters } from '@/lib/hooks/useBulletinFilters';
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
 * Receives all initial data from the Server Component parent so the page
 * renders immediately with no loading states. Handles client-side interactivity:
 * URL-synced filters, pagination, and reactive auth (login/logout after mount).
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

  // Client-side auth/profile — used for reactivity after login/logout.
  // SSR values (isLoggedIn, isAdmin) are used until auth resolves so there's
  // no flash of the unauthenticated state on the initial render.
  const { user, role, loading: authLoading } = useAuth();
  const { profile: clientProfile } = useProfile();

  const effectiveUserId = authLoading ? (initialUserId ?? null) : (user?.id ?? null);
  const effectiveIsLoggedIn = authLoading ? isLoggedIn : !!user;
  const effectiveIsAdmin = authLoading ? isAdmin : role === 'admin';

  // Live profile from ProfileContext once loaded, falling back to SSR snapshot.
  const profile = effectiveUserId ? (clientProfile ?? initialProfile ?? null) : null;

  const filters = useBulletinFilters({
    initialProfile,
    initialUserId,
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
