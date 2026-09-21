'use client';

import { useTranslations } from 'next-intl';
import { sectorBlurb, type SectorIndexCard } from '@/lib/organizations/sector-index';
import { getOrganizationTypeLabel } from '@/lib/organizations/utils';

interface SectorIndexGridProps {
  sectors: SectorIndexCard[];
  locale: string;
  onSelectSector: (sectorId: string) => void;
}

function typeMixLabel(
  typeCounts: SectorIndexCard['typeCounts'],
  getTypeLabel: (type: string | null) => string,
): string | null {
  if (typeCounts.length === 0) return null;
  return typeCounts
    .slice(0, 3)
    .map(({ type, count }) => `${count} ${getTypeLabel(type)}`)
    .join(' · ');
}

export default function SectorIndexGrid({ sectors, locale, onSelectSector }: SectorIndexGridProps) {
  const t = useTranslations('organizations');
  const tSectors = useTranslations('taxonomy.sectors');
  const getTypeLabel = (orgType: string | null) => getOrganizationTypeLabel(orgType, t) ?? '';

  if (sectors.length === 0) return null;

  return (
    <section aria-label={t('browseBySector')} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('browseBySector')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('browseBySectorHint')}</p>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none p-0 m-0">
        {sectors.map((sector) => {
          const label = tSectors(`${sector.id}.label`);
          const blurb = sectorBlurb(sector.id, locale);
          const mix = typeMixLabel(sector.typeCounts, getTypeLabel);

          return (
            <li key={sector.id}>
              <button
                type="button"
                onClick={() => onSelectSector(sector.id)}
                className="w-full h-full text-left rounded-wev-card border border-border bg-card px-4 py-4 transition-colors hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-primary-text leading-snug">
                      {label}
                    </h3>
                    <span className="shrink-0 text-sm font-medium text-muted-foreground whitespace-nowrap">
                      {t('organizationCount', { count: sector.orgCount })}
                    </span>
                  </div>

                  {blurb ? (
                    <p className="text-sm text-foreground leading-5 line-clamp-2">{blurb}</p>
                  ) : null}

                  {mix ? <p className="text-xs text-muted-foreground">{mix}</p> : null}

                  {sector.sampleNames.length > 0 ? (
                    <p className="text-xs text-muted-foreground truncate">
                      {sector.sampleNames.join(' · ')}
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
