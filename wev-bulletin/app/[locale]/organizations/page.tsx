import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import {
  fetchOrganizationIndex,
  fetchOrganizationFilterOptions,
} from '@/lib/organizations/server-data';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { parseOrgIndexSearchParams } from '@/lib/organizations/params';
import { rolesIncludeAdmin } from '@/lib/auth';
import { fetchUserRolesFromService } from '@/lib/auth/server-user-roles';
import OrganizationIndexClient from '@/components/OrganizationIndexClient';
import PageLayout from '@/components/PageLayout';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

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
  const tAdmin = await getTranslations({ locale, namespace: 'admin.organizations' });

  const supabaseAuth = await createServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  let isAdmin = false;
  if (user) {
    const rolesResult = await fetchUserRolesFromService(user.id);
    isAdmin = rolesResult.ok && rolesIncludeAdmin(rolesResult.roles);
  }

  const urlSearchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawSearchParams)) {
    if (Array.isArray(value)) {
      value.forEach((v) => urlSearchParams.append(key, v));
    } else if (value !== undefined) {
      urlSearchParams.set(key, value);
    }
  }

  const {
    page,
    searchQuery,
    sseOnly,
    provinces,
    municipalities,
    orgTypes,
    languages,
    sortBy,
    activityDays,
  } = parseOrgIndexSearchParams(urlSearchParams, Boolean(user));

  const [initialData, filterOptions] = await Promise.all([
    fetchOrganizationIndex(
      {
        page,
        searchQuery,
        sseOnly,
        provinces,
        municipalities,
        orgTypes,
        languages,
        userId: user?.id ?? null,
        sortBy,
        activityDays,
      },
      user ? supabaseAuth : undefined,
    ),
    fetchOrganizationFilterOptions(activityDays),
  ]);

  return (
    <PageLayout maxWidth="lg">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold text-foreground">{t('indexTitle')}</h1>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/${locale}/admin/organizations`}
              className={cn(buttonVariants({ variant: 'secondary' }))}
            >
              {tAdmin('actions.manage')}
            </Link>
            <Link
              href={`/${locale}/admin/organizations/new`}
              className={cn(buttonVariants({ variant: 'default' }))}
            >
              {tAdmin('actions.addNew')}
            </Link>
          </div>
        )}
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
