import { getTranslations } from 'next-intl/server';
import {
  fetchOrganizationIndex,
  fetchOrganizationFilterOptions,
  fetchSectorIndexStats,
} from '@/lib/organizations/server-data';
import { parseOrgIndexSearchParams } from '@/lib/organizations/params';
import OrganizationIndexClient from '@/components/OrganizationIndexClient';
import OrganizationIndexAdminLinks from '@/components/OrganizationIndexAdminLinks';
import PageLayout from '@/components/PageLayout';
import { PUBLIC_REVALIDATE_SECONDS } from '@/lib/cache';

/** Prefer ISR for the default anonymous org index HTML. */
export const revalidate = PUBLIC_REVALIDATE_SECONDS;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/** Page title for the organizations index. */
export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'organizations' });
  return { title: t('indexTitle') };
}

/** Anonymous ISR org index; personalized sort and admin links hydrate client-side. */
export default async function OrganizationsIndexPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const rawSearchParams = await searchParams;
  const t = await getTranslations({ locale, namespace: 'organizations' });

  const urlSearchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawSearchParams)) {
    if (Array.isArray(value)) {
      value.forEach((v) => urlSearchParams.append(key, v));
    } else if (value !== undefined) {
      urlSearchParams.set(key, value);
    }
  }

  // Anonymous baseline — match scores / admin UI hydrate client-side via AuthContext.
  const {
    page,
    searchQuery,
    sseOnly,
    provinces,
    municipalities,
    orgTypes,
    languages,
    sectors,
    sortBy,
    activityDays,
  } = parseOrgIndexSearchParams(urlSearchParams, false);

  // Match OrganizationIndexClient: sector cards only when no user filters are active.
  const showSectorIndex =
    !searchQuery &&
    sseOnly &&
    provinces.length === 0 &&
    municipalities.length === 0 &&
    orgTypes.length === 0 &&
    languages.length === 0 &&
    sectors.length === 0 &&
    activityDays == null;

  const [initialData, filterOptions, sectorIndex] = await Promise.all([
    fetchOrganizationIndex({
      page,
      searchQuery,
      sseOnly,
      provinces,
      municipalities,
      orgTypes,
      languages,
      sectors,
      userId: null,
      sortBy,
      activityDays,
    }),
    fetchOrganizationFilterOptions(activityDays),
    showSectorIndex ? fetchSectorIndexStats({ sseOnly: true }) : Promise.resolve([]),
  ]);

  return (
    <PageLayout maxWidth="lg">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold text-foreground">{t('indexTitle')}</h1>
        <OrganizationIndexAdminLinks locale={locale} />
      </header>

      <OrganizationIndexClient
        initialData={initialData}
        filterOptions={filterOptions}
        sectorIndex={sectorIndex}
        locale={locale}
        initialHasMatchScores={false}
      />
    </PageLayout>
  );
}
