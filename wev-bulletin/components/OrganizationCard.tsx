'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { formatOrgLocationLabel, getOrganizationTypeLabel } from '@/lib/organizations/utils';
import { safeUrl } from '@/lib/url';
import SseBadge from './SseBadge';
import OrgValuesMatchFooter from './OrgValuesMatchFooter';
import Collapsible from './Collapsible';
import type { OrgIndexEntry } from '@/lib/organizations/types';

const DESCRIPTION_PREVIEW_LENGTH = 150;

interface Props {
  org: OrgIndexEntry;
  locale: string;
  sseBadgeLabel: string;
  jobCountLabel: string;
  noDescriptionLabel: string;
  websiteLabel: string;
  viewProfileLabel: string;
  showMoreLabel: string;
  showLessLabel: string;
  isLoggedIn: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CardHeaderProps {
  org: OrgIndexEntry;
  locale: string;
  sseBadgeLabel: string;
  jobCountLabel: string;
  noDescriptionLabel: string;
  showMoreLabel: string;
  showLessLabel: string;
  hasFooter: boolean;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  getTypeLabel: (type: string | null) => string;
  getSectorLabel: (sectorId: string | null) => string;
}

function OrganizationCardHeader({
  org,
  locale,
  sseBadgeLabel,
  jobCountLabel,
  noDescriptionLabel,
  showMoreLabel,
  showLessLabel,
  hasFooter,
  isExpanded,
  onExpandedChange,
  getTypeLabel,
  getSectorLabel,
}: CardHeaderProps) {
  const description = org.description || org.mission_statement || noDescriptionLabel;
  const typeLabel = getTypeLabel(org.type);
  const sectorLabel = getSectorLabel(org.sector_id);
  const metadata = [sectorLabel, typeLabel].filter(Boolean).join(' • ');

  const shouldTruncate = description.length > DESCRIPTION_PREVIEW_LENGTH;
  const preview = shouldTruncate
    ? description.slice(0, DESCRIPTION_PREVIEW_LENGTH).trimEnd()
    : description;

  return (
    <div
      className={`px-4 py-3 flex flex-col gap-3 bg-card ${
        hasFooter ? 'border-b border-border' : ''
      }`}
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex flex-col gap-1 w-full min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 max-w-full">
            <Link
              href={`/${locale}/organizations/${org.slug}`}
              className="text-primary-text font-semibold text-base hover:underline truncate"
            >
              {org.name}
            </Link>
            {org.is_sse ? <SseBadge label={sseBadgeLabel} /> : null}
          </div>
          {metadata ? (
            <div className="text-muted-foreground text-sm truncate">{metadata}</div>
          ) : null}
        </div>

        <div className="bg-primary-tint text-primary-text px-3 py-1 rounded-wev-pill text-sm font-medium whitespace-nowrap shrink-0">
          {jobCountLabel}
        </div>
      </div>

      <p className="text-sm text-foreground leading-6">
        {isExpanded || !shouldTruncate ? description : preview}
        {shouldTruncate ? (
          <>
            {!isExpanded ? '...' : ' '}
            <button
              type="button"
              onClick={() => onExpandedChange(!isExpanded)}
              className="ml-1 text-primary hover:underline font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
              aria-expanded={isExpanded}
            >
              {isExpanded ? showLessLabel : showMoreLabel}
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}

interface CardDetailsProps {
  org: OrgIndexEntry;
  locale: string;
  websiteLabel: string;
  viewProfileLabel: string;
}

function OrganizationCardDetails({
  org,
  locale,
  websiteLabel,
  viewProfileLabel,
}: CardDetailsProps) {
  const safeWebsite = safeUrl(org.website);

  return (
    <div className="py-4 px-5 bg-card flex flex-col gap-2">
      {safeWebsite ? (
        <div className="flex gap-1.5 text-sm">
          <span className="text-muted-foreground">{websiteLabel}</span>
          <a
            href={safeWebsite}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline truncate"
          >
            {org.website}
          </a>
        </div>
      ) : null}
      <div className="text-sm">
        <Link
          href={`/${locale}/organizations/${org.slug}`}
          className="text-primary hover:underline"
        >
          {viewProfileLabel}
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function OrganizationCard({
  org,
  locale,
  sseBadgeLabel,
  jobCountLabel,
  noDescriptionLabel,
  websiteLabel,
  viewProfileLabel,
  showMoreLabel,
  showLessLabel,
  isLoggedIn,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const tOrgs = useTranslations('organizations');
  const tSectors = useTranslations('taxonomy.sectors');

  const getTypeLabel = (orgType: string | null) => getOrganizationTypeLabel(orgType, tOrgs) ?? '';
  const getSectorLabel = (sectorId: string | null) =>
    sectorId ? tSectors(`${sectorId}.label`) : '';

  const locationLabel = formatOrgLocationLabel(org);
  const hasFooter = Boolean(org.values_list?.length) || Boolean(locationLabel);

  return (
    <article className="relative rounded-wev-card transition-all duration-300 bg-card border border-border hover:border-primary overflow-hidden flex flex-col">
      <OrganizationCardHeader
        org={org}
        locale={locale}
        sseBadgeLabel={sseBadgeLabel}
        jobCountLabel={jobCountLabel}
        noDescriptionLabel={noDescriptionLabel}
        showMoreLabel={showMoreLabel}
        showLessLabel={showLessLabel}
        hasFooter={hasFooter}
        isExpanded={isExpanded}
        onExpandedChange={setIsExpanded}
        getTypeLabel={getTypeLabel}
        getSectorLabel={getSectorLabel}
      />

      <Collapsible isOpen={isExpanded}>
        <OrganizationCardDetails
          org={org}
          locale={locale}
          websiteLabel={websiteLabel}
          viewProfileLabel={viewProfileLabel}
        />
      </Collapsible>

      {hasFooter && (
        <div className={`px-4 py-3 bg-muted ${isExpanded ? 'border-t border-border' : ''}`}>
          <OrgValuesMatchFooter
            values={org.values_list || []}
            valueScore={org.value_score}
            sharedValues={org.shared_values || []}
            isLoggedIn={isLoggedIn}
            fadeBackground="var(--muted)"
            locationLabel={locationLabel}
          />
        </div>
      )}
    </article>
  );
}
