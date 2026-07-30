'use client';

import { useMemo, type ReactNode } from 'react';
import JobCardFooter from './JobCardFooter';
import MatchDetailsTooltip from './MatchDetailsTooltip';

interface Props {
  values: string[];
  /** Value match score in [0, 1], or null when unavailable. */
  valueScore: number | null;
  sharedValues: string[];
  isLoggedIn: boolean;
  fadeBackground?: string;
  className?: string;
  /** Location pill label (same style as job work-type pills). */
  locationLabel?: string | null;
  /** Org public language (`en` / `fr` / `bilingual`), same pill as jobs. */
  language?: string | null;
  selectedLanguages?: string[];
}

export function buildOrgValuesMatchTooltip(
  values: string[],
  scorePercent: number,
  sharedValues: string[],
): ReactNode {
  return (
    <MatchDetailsTooltip
      totalMatchPercentage={scorePercent}
      valueMatchPercentage={scorePercent}
      skillMatchPercentage={0}
      values={values}
      skills={[]}
      sharedValues={sharedValues}
      sharedSkills={[]}
      skillTerms={{}}
    />
  );
}

/**
 * Values-only match footer shared by org index cards and the org profile header.
 */
export default function OrgValuesMatchFooter({
  values,
  valueScore,
  sharedValues,
  isLoggedIn,
  fadeBackground = 'var(--muted)',
  className,
  locationLabel = null,
  language = null,
  selectedLanguages = [],
}: Props) {
  const scorePercent = useMemo(() => {
    if (valueScore == null) return null;
    return Math.round(valueScore * 100);
  }, [valueScore]);

  const matchTooltipContent = useMemo(() => {
    if (!isLoggedIn || scorePercent == null || values.length === 0) return null;
    return buildOrgValuesMatchTooltip(values, scorePercent, sharedValues);
  }, [isLoggedIn, scorePercent, values, sharedValues]);

  const hasLocation = Boolean(locationLabel?.trim());
  const hasLanguage = Boolean(language);
  if (values.length === 0 && !hasLocation && !hasLanguage) return null;

  const footer = (
    <JobCardFooter
      values={values}
      skills={[]}
      sharedValues={sharedValues}
      sharedSkills={[]}
      skillTerms={{}}
      skillDefinitions={{}}
      totalMatchPercentage={scorePercent ?? 0}
      matchTooltipContent={matchTooltipContent}
      showTooltip={Boolean(matchTooltipContent)}
      showMatchLoading={false}
      fadeBackground={fadeBackground}
      isLoggedIn={isLoggedIn}
      locationLabel={locationLabel}
      language={language}
      languageContext="organization"
      selectedLanguages={selectedLanguages}
    />
  );

  if (!className) return footer;

  return <div className={className}>{footer}</div>;
}
