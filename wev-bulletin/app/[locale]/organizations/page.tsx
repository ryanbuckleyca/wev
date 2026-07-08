import { getTranslations } from 'next-intl/server';
import {
  fetchOrganizationIndex,
  fetchOrganizationFilterOptions,
} from '@/lib/organizations/server-data';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { parseOrgIndexSearchParams } from '@/lib/organizations/params';
import OrganizationIndexClient from '@/components/OrganizationIndexClient';
import PageLayout from '@/components/PageLayout';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'organizations' });
  return { title: t('indexTitle') };
}

export default async function OrganizationsIndexPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const rawSearchParams = await searchParams;
  const t = await getTranslations({ locale, namespace: 'organizations' });

  const supabaseAuth = await createServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  // Normalise the Next.js searchParams shape (string | string[] | undefined) into
  // a URLSearchParams so we can reuse the shared parser.
  const urlSearchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawSearchParams)) {
    if (Array.isArray(value)) {
      value.forEach((v) => urlSearchParams.append(key, v));
    } else if (value !== undefined) {
      urlSearchParams.set(key, value);
    }
  }

  const { page, searchQuery, sseOnly, provinces, municipalities, orgTypes, sortBy } =
    parseOrgIndexSearchParams(urlSearchParams, Boolean(user));

  // Fetch initial page and filter options in parallel.
  const [initialData, filterOptions] = await Promise.all([
    fetchOrganizationIndex({
      page,
      searchQuery,
      sseOnly,
      provinces,
      municipalities,
      orgTypes,
      userId: user?.id ?? null,
      sortBy,
    }),
    fetchOrganizationFilterOptions(),
  ]);

  return (
    <PageLayout maxWidth="lg">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">{t('indexTitle')}</h1>
      </header>

      <OrganizationIndexClient
        initialData={initialData}
        filterOptions={filterOptions}
        locale={locale}
        initialHasMatchScores={Boolean(user)}
      />
    </PageLayout>
  );
}
