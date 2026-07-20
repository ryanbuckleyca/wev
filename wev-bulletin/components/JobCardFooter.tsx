'use client';

import { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { getJobLanguageLabel, getWorkTypeLabel } from '@/lib/bulletin/filter-labels';
import InfoPopover from './InfoPopover';
import ProgressDonut from './ProgressDonut';
import ExpandablePills, { ExpandablePillGroup } from './ExpandablePills';
import { ScrollablePillsItem } from '@/components/ui/ScrollablePills';
import { getValueDefinition, getValueTranslationsHelper } from '@/lib/values';

interface JobCardFooterProps {
  values: string[];
  skills: string[];
  sharedValues: string[];
  sharedSkills: string[];
  skillTerms: Record<string, string>;
  skillDefinitions: Record<string, string>;
  totalMatchPercentage: number;
  matchTooltipContent: ReactNode | null;
  showTooltip: boolean;
  showMatchLoading?: boolean;
  fadeBackground?: string;
  workType?: 'remote' | 'hybrid' | 'office';
  selectedWorkTypes?: string[];
  language?: string | null;
  selectedLanguages?: string[];
  isLoggedIn?: boolean;
}

export default function JobCardFooter({
  values,
  skills,
  sharedValues,
  sharedSkills,
  skillTerms,
  skillDefinitions,
  totalMatchPercentage,
  matchTooltipContent,
  showTooltip,
  showMatchLoading = false,
  fadeBackground = 'var(--muted)',
  workType,
  selectedWorkTypes = [],
  language,
  selectedLanguages = [],
  isLoggedIn = true,
}: JobCardFooterProps) {
  const t = useTranslations();
  const tMatch = useTranslations('matchDetails');
  const tValues = useTranslations('values');

  const getValueTranslations = (value: string) => getValueTranslationsHelper(value, tValues);

  const formatSkillLabel = (skill: string) => {
    if (skillTerms[skill]) return skillTerms[skill];
    try {
      const parsed = new URL(skill);
      const slug = decodeURIComponent(parsed.pathname.split('/').pop() || skill);
      return slug.replace(/[-_]/g, ' ');
    } catch {
      return skill;
    }
  };

  const matchedValueCount = sharedValues.length;
  const totalValueCount = values.length;
  const matchedSkillCount = sharedSkills.filter((skill) => skills.includes(skill)).length;
  const totalSkillCount = skills.length;

  const buildSummaryPill = (
    matchedCount: number,
    totalCount: number,
    matchedNames: string,
    unmatchedNames: string,
    label: string,
    icon: 'heart' | 'briefcase',
  ): ScrollablePillsItem | null => {
    if (totalCount === 0) return null;

    let tooltip = '';
    
    if (isLoggedIn) {
      tooltip = `${matchedCount} of ${totalCount} ${label} match your profile`;
      if (matchedNames) {
        tooltip += `<br/><br/><strong>Matched:</strong> ${matchedNames}`;
      }
      if (unmatchedNames) {
        tooltip += `<br/><br /><strong>Unmatched:</strong> ${unmatchedNames}`;
      }
    } else {
      tooltip = `Includes ${totalCount} ${label}`;
      if (unmatchedNames) {
        tooltip += `<br/><br /><strong>${label.charAt(0).toUpperCase() + label.slice(1)}:</strong> ${unmatchedNames}`;
      }
    }
    
    tooltip += `<br/><br/><em>Click > to expand details</em>`;

    return {
      label: isLoggedIn ? `${matchedCount}/${totalCount} ${label}` : `${totalCount} ${label}`,
      tooltip,
      isMatched: matchedCount > 0,
      icon,
      type: 'summary',
    };
  };

  const buildWorkTypePill = (): ScrollablePillsItem | undefined => {
    if (!workType) return undefined;

    const isMatched = selectedWorkTypes.includes(workType);
    const label = getWorkTypeLabel(workType, t);
    const tooltip = isMatched
      ? `${label} matches your current work-style filter.`
      : `Does not match filter preferences for location.`;

    return {
      label,
      tooltip,
      isMatched,
      icon: 'location' as const,
      type: 'workType' as const,
    };
  };

  const buildLanguagePill = (): ScrollablePillsItem | undefined => {
    if (!language) return undefined;

    const langLabel = getJobLanguageLabel(language, t);

    // Only mark the pill as matched when a language filter is active and it matches.
    // If no language filter is selected, the pill is not active but we still
    // surface a descriptive tooltip indicating the job's required language.
    let isMatched = false;
    let tooltip = t('filters.language.tooltip.required', { lang: langLabel });

    if (selectedLanguages.length === 0) {
      // No language filter chosen: do not activate the pill, show required tooltip.
      isMatched = false;
      tooltip = t('filters.language.tooltip.required', { lang: langLabel });
    } else {
      isMatched = selectedLanguages.includes(language);
      tooltip = isMatched
        ? t('filters.language.tooltip.matchesFilter', { lang: langLabel })
        : t('filters.language.tooltip.doesNotMatch', { lang: langLabel });
    }

    return {
      label: langLabel,
      tooltip,
      isMatched,
      icon: 'globe' as const,
      type: 'language' as const,
    };
  };

  const matchedValueNames = sharedValues
    .map((value) => getValueTranslations(value).label)
    .join(', ');
  const unmatchedValueNames = values
    .filter((value) => !sharedValues.includes(value))
    .map((value) => getValueTranslations(value).label)
    .join(', ');

  const matchedSkillNames = sharedSkills
    .filter((skill) => skills.includes(skill))
    .map((skill) => formatSkillLabel(skill).toLowerCase())
    .join(', ');
  const unmatchedSkillNames = skills
    .filter((skill) => !sharedSkills.includes(skill))
    .map((skill) => formatSkillLabel(skill).toLowerCase())
    .join(', ');

  const valueSummaryLabel = tMatch('values').toLowerCase();
  const skillSummaryLabel = tMatch('skills').toLowerCase();

  const summaryItems = [
    buildSummaryPill(
      matchedValueCount,
      totalValueCount,
      matchedValueNames,
      unmatchedValueNames,
      valueSummaryLabel,
      'heart',
    ),
    buildSummaryPill(
      matchedSkillCount,
      totalSkillCount,
      matchedSkillNames,
      unmatchedSkillNames,
      skillSummaryLabel,
      'briefcase',
    ),
  ].filter(Boolean) as ScrollablePillsItem[];

  const valueSharedSet = new Set(sharedValues);
  const orderedValues = [
    ...values.filter((value) => valueSharedSet.has(value)),
    ...values.filter((value) => !valueSharedSet.has(value)),
  ];

  const valueItems = orderedValues.map((value) => {
    const valueTranslations = getValueTranslations(value);
    const isMatched = valueSharedSet.has(value);
    return {
      label: valueTranslations.label,
      tooltip: `${valueTranslations.description}<br/><br/><em>${valueTranslations.example}</em>`,
      isMatched,
      type: 'value' as const,
    };
  });

  const skillSharedSet = new Set(sharedSkills);
  const orderedSkills = [
    ...skills.filter((skill) => skillSharedSet.has(skill)),
    ...skills.filter((skill) => !skillSharedSet.has(skill)),
  ];

  const skillItems = orderedSkills.map((skill) => {
    const skillLabel = formatSkillLabel(skill).toLowerCase();
    const skillTooltip = skillDefinitions[skill];
    const isMatched = skillSharedSet.has(skill);
    return {
      label: skillLabel,
      tooltip: skillTooltip,
      isMatched,
      type: 'skill' as const,
    };
  });

  const valueSummaryPill = summaryItems.find((item) => item.icon === 'heart');
  const skillSummaryPill = summaryItems.find((item) => item.icon === 'briefcase');
  const workTypePill = buildWorkTypePill();
  const languagePill = buildLanguagePill();

  const preItems = [workTypePill, languagePill].filter(Boolean) as ScrollablePillsItem[];

  const groups: ExpandablePillGroup[] = [
    { key: 'values', summary: valueSummaryPill, items: valueItems },
    { key: 'skills', summary: skillSummaryPill, items: skillItems },
    // No separate location group in footer; location matching is shown in the tooltip only.
  ];

  return (
    <div className="flex gap-4">
      {showTooltip && matchTooltipContent && (
        <div className="flex items-center justify-center pr-4 border-r border-border">
          <InfoPopover ariaLabel={t('jobCard.viewMatchDetails')} content={matchTooltipContent}>
            <div className="flex items-center gap-2">
              <ProgressDonut percentage={totalMatchPercentage} size="sm" text="" />
              <span className="text-sm font-medium text-foreground">{totalMatchPercentage}%</span>
            </div>
          </InfoPopover>
        </div>
      )}

      {showMatchLoading && !showTooltip && (
        <div
          className="flex items-center justify-center pr-4 border-r border-border"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              aria-hidden="true"
              className="h-4 w-4 rounded-full border-2 border-border border-t-primary animate-spin"
            />
            <span>{t('common.loading')}</span>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <ExpandablePills
          preItems={preItems}
          groups={groups}
          variant="default"
          fadeBackground={fadeBackground}
        />
      </div>
    </div>
  );
}
