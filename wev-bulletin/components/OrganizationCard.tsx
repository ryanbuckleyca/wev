'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getOrganizationTypeLabel } from '@/lib/organizations/utils';
import { safeUrl } from '@/lib/url';
import SseBadge from './SseBadge';
import JobCardFooter from './JobCardFooter';
import MatchDetailsTooltip from './MatchDetailsTooltip';
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
  translateTooltip: (key: string, values?: Record<string, unknown>) => string;
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
}: CardHeaderProps) {
  const description = org.description || org.mission_statement || noDescriptionLabel;
  const typeLabel = getTypeLabel(org.type);
  const metadata = [org.location, typeLabel].filter(Boolean).join(' • ');

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
  translateTooltip,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const tOrgs = useTranslations('organizations');

  const getTypeLabel = (orgType: string | null) => getOrganizationTypeLabel(orgType, tOrgs) ?? '';

  const scoreData = useMemo(() => {
    if (org.value_score == null) return null;
    return { values: Math.round(org.value_score * 100) };
  }, [org.value_score]);

  // Only build the tooltip when the user is logged in and there's a score to show.
  const matchTooltipContent = useMemo(() => {
    if (!isLoggedIn || !scoreData) return null;
    return (
      <MatchDetailsTooltip
        totalMatchPercentage={scoreData.values}
        valueMatchPercentage={scoreData.values}
        skillMatchPercentage={0}
        workTypeMatchPercentage={0}
        locationMatchPercentage={0}
        jobWorkType={null}
        jobMunicipality={null}
        profileWorkTypes={[]}
        profileHasLocationValue={false}
        values={org.values_list || []}
        skills={[]}
        sharedValues={org.shared_values || []}
        sharedSkills={[]}
        skillTerms={{}}
        translate={(key, values) => translateTooltip(key, values)}
      />
    );
  }, [isLoggedIn, scoreData, org.values_list, org.shared_values, translateTooltip]);

  const hasFooter = Boolean(org.values_list?.length);

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
          <JobCardFooter
            values={org.values_list || []}
            skills={[]}
            sharedValues={org.shared_values || []}
            sharedSkills={[]}
            skillTerms={{}}
            skillDefinitions={{}}
            totalMatchPercentage={scoreData?.values ?? 0}
            matchTooltipContent={matchTooltipContent}
            showTooltip={Boolean(matchTooltipContent)}
            showMatchLoading={false}
            fadeBackground="var(--muted)"
          />
        </div>
      )}
    </article>
  );
}
