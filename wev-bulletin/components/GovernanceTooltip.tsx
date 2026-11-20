'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import InfoPopover from '@/components/InfoPopover';
import { getGovernanceEntry } from '@/lib/organizations/governance-taxonomy';
import { hasPublicGovernanceSubtype } from '@/lib/organizations/governance-labels';

interface GovernanceTooltipProps {
  subtype: string | null | undefined;
  label?: string | null;
  children?: React.ReactNode;
  className?: string;
}

/**
 * GovernanceTooltip Component
 *
 * Renders an organization's governance subtype label with a lightweight
 * intent-delayed (350ms) popover displaying the canonical scope note from governance.json.
 */
export default function GovernanceTooltip({
  subtype,
  label: explicitLabel,
  children,
  className = '',
}: GovernanceTooltipProps) {
  const locale = useLocale();

  if (!subtype || !hasPublicGovernanceSubtype(subtype)) {
    if (children) return <>{children}</>;
    return explicitLabel ? <span>{explicitLabel}</span> : null;
  }

  const entry = getGovernanceEntry(subtype);
  if (!entry) {
    if (children) return <>{children}</>;
    return explicitLabel ? <span>{explicitLabel}</span> : null;
  }

  const isFr = locale.startsWith('fr');
  const label = explicitLabel || (isFr ? entry.label_fr : entry.label_en) || subtype;
  const scopeNote = (isFr ? entry.scope_note_fr : entry.scope_note_en) || entry.scope_note_en;

  if (!scopeNote) {
    if (children) return <>{children}</>;
    return <span>{label}</span>;
  }

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
          <div className="text-muted-foreground text-xs leading-relaxed">{scopeNote}</div>
        </div>
      }
    >
      {triggerContent}
    </InfoPopover>
  );
}
