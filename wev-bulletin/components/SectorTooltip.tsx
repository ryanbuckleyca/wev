'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import InfoPopover from '@/components/InfoPopover';
import { canonicalizeSectorId, getSectorEntry } from '@/lib/sectors';

interface SectorTooltipProps {
  sectorId: string | null;
  label?: string | null;
  children?: React.ReactNode;
  className?: string;
}

/**
 * SectorTooltip Component
 *
 * Renders an organization's sector label with a lightweight mouseover popover
 * directly displaying the canonical inclusions list from the master taxonomy spreadsheet.
 */
export default function SectorTooltip({
  sectorId,
  label: explicitLabel,
  children,
  className = '',
}: SectorTooltipProps) {
  const locale = useLocale();
  const t = useTranslations('taxonomy.sectors');
  const canonicalId = sectorId ? (canonicalizeSectorId(sectorId) ?? sectorId) : null;

  if (!canonicalId) {
    if (children) return <>{children}</>;
    return explicitLabel ? <span>{explicitLabel}</span> : null;
  }

  const entry = getSectorEntry(canonicalId);
  const label =
    explicitLabel ||
    (t.has(`${canonicalId}.label`) ? t(`${canonicalId}.label`) : (entry?.label_en ?? canonicalId));

  const isFr = locale.startsWith('fr');
  const inclusionsList: string[] =
    isFr &&
    entry &&
    'inclusions_fr' in entry &&
    Array.isArray(entry.inclusions_fr) &&
    entry.inclusions_fr.length > 0
      ? (entry.inclusions_fr as string[])
      : (entry?.inclusions ?? []);

  if (inclusionsList.length === 0) {
    if (children) return <>{children}</>;
    return <span>{label}</span>;
  }

  const inclusionsText = inclusionsList.join(', ');
  const includesHeader = t.has('includes') ? t('includes') : isFr ? 'Comprend :' : 'Includes:';

  const triggerContent = children ?? (
    <span
      className={`cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-2 hover:text-foreground transition-colors ${className}`}
    >
      {label}
    </span>
  );

  return (
    <InfoPopover
      hoverable
      ariaLabel={label}
      content={
        <div className="flex flex-col gap-1.5 text-left">
          <div className="font-semibold text-foreground text-xs leading-snug">{label}</div>
          <div className="text-muted-foreground text-xs leading-relaxed">
            <span className="font-medium text-foreground">{includesHeader}</span> {inclusionsText}
          </div>
        </div>
      }
    >
      {triggerContent}
    </InfoPopover>
  );
}
