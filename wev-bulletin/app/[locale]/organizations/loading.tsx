import { getTranslations } from 'next-intl/server';
import PageLayout from '@/components/PageLayout';
import CardListSkeleton from '@/components/CardListSkeleton';
import CountPhraseSkeleton from '@/components/CountPhraseSkeleton';
import OrgListToolbar from '@/components/OrgListToolbar';
import SearchCardSkeleton from '@/components/SearchCardSkeleton';

export default async function OrganizationsLoading() {
  const t = await getTranslations('organizations');
  const tFilters = await getTranslations('filters');

  return (
    <PageLayout maxWidth="lg">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">{t('indexTitle')}</h1>
      </header>

      <SearchCardSkeleton
        label={t('searchLabel')}
        placeholder={t('searchPlaceholder')}
        inputId="org-search-loading"
        filtersLabel={tFilters('showFilters')}
      />

      <div className="flex flex-col gap-4">
        <OrgListToolbar
          countContent={<CountPhraseSkeleton className="w-32" />}
          sortBy="org-asc"
          sortDisabled
        />

        <CardListSkeleton count={4} />
      </div>
    </PageLayout>
  );
}
