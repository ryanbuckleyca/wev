'use client';

import { useTranslations } from 'next-intl';
import type { GovernanceIndexCard } from '@/lib/organizations/governance-index';
import { getGovernanceCategoryLabel } from '@/lib/organizations/governance-labels';

interface GovernanceIndexGridProps {
  categories: GovernanceIndexCard[];
  onSelectCategory: (categoryId: string) => void;
}

export default function GovernanceIndexGrid({
  categories,
  onSelectCategory,
}: GovernanceIndexGridProps) {
  const t = useTranslations('organizations');

  if (categories.length === 0) return null;

  return (
    <section aria-label={t('browseByGovernance')} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('browseByGovernance')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('browseByGovernanceHint')}</p>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none p-0 m-0">
        {categories.map((card) => {
          const label = getGovernanceCategoryLabel(card.id, t) ?? card.id;

          return (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => onSelectCategory(card.id)}
                className="w-full h-full text-left rounded-wev-card border border-border bg-card px-4 py-4 transition-colors hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-primary-text leading-snug">
                      {label}
                    </h3>
                    <span className="shrink-0 text-sm font-medium text-muted-foreground whitespace-nowrap">
                      {t('organizationCount', { count: card.orgCount })}
                    </span>
                  </div>

                  {card.sampleNames.length > 0 ? (
                    <p className="text-xs text-muted-foreground truncate">
                      {card.sampleNames.join(' · ')}
                    </p>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
