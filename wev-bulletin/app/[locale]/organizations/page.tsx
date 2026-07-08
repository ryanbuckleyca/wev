import { getTranslations } from 'next-intl/server';
import {
  fetchOrganizationIndex,
  fetchOrganizationFilterOptions,
} from '@/lib/organizations/server-data';
import { createClient as createServerClient } from '@/lib/supabase/server';
import OrganizationIndexClient from '@/components/OrganizationIndexClient';
import PageLayout from '@/components/PageLayout';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'organizations' });

  return {
    title: t('indexTitle'),
  };
}

function getStringParam(value: string | string[] | undefined, fallback = '') {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function getArrayParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

export default async function OrganizationsIndexPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const rawSearchParams = await searchParams;
  const t = await getTranslations({ locale, namespace: 'organizations' });
  const supabaseAuth = await createServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  const page = Math.max(1, parseInt(getStringParam(rawSearchParams.page, '1'), 10) || 1);
  const sortBy = getStringParam(rawSearchParams.sortBy, user ? 'value-match-desc' : 'org-asc');

  // Fetch initial page (SSE-only default) and filter options in parallel
  const [initialData, filterOptions] = await Promise.all([
    fetchOrganizationIndex({
      page,
      searchQuery: getStringParam(rawSearchParams.q),
      sseOnly: getStringParam(rawSearchParams.sse, 'true') === 'true',
      provinces: getArrayParam(rawSearchParams.province),
      municipalities: getArrayParam(rawSearchParams.municipality),
      orgTypes: getArrayParam(rawSearchParams.type),
      userId: user?.id ?? null,
      sortBy: user || !sortBy.includes('match') ? sortBy : 'org-asc',
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
