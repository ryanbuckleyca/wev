'use client';

import { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import InfoPopover from './InfoPopover';
import ProgressDonut from './ProgressDonut';
import ExpandablePills, { ExpandablePillGroup } from './ExpandablePills';
import { ScrollablePillsItem } from '@/components/ui/ScrollablePills';
import { getValueDefinition } from '@/lib/values';

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
  fadeBackground?: string;
  workType?: 'remote' | 'hybrid' | 'office';
  selectedWorkTypes?: string[];
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
  fadeBackground = 'var(--muted)',
  workType,
  selectedWorkTypes = [],
}: JobCardFooterProps) {
  const t = useTranslations();
  const tValues = useTranslations('values');

  const formatValueLabel = (value: string) => {
    return value
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase();
  };

  const getValueTranslations = (value: string) => {
    const fallbackDefinition = getValueDefinition(value);
    const fallbackName = formatValueLabel(value);

    const nameKey = `${value}.name`;
    const descriptionKey = `${value}.description`;
    const exampleKey = `${value}.example`;

    const name = tValues.has(nameKey) ? tValues(nameKey) : fallbackName;
    const description = tValues.has(descriptionKey)
      ? tValues(descriptionKey)
      : fallbackDefinition.description;
    const example = tValues.has(exampleKey) ? tValues(exampleKey) : fallbackDefinition.example;

    return {
      label: name.toLowerCase(),
      description,
      example,
    };
  };

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

    let tooltip = `${matchedCount} of ${totalCount} ${label} match your profile`;
    if (matchedNames) {
      tooltip += `<br/><br/><strong>Matched:</strong> ${matchedNames}`;
    }
    if (unmatchedNames) {
      tooltip += `<br/><br /><strong>Unmatched:</strong> ${unmatchedNames}`;
    }
    tooltip += `<br/><br/><em>Click > to expand details</em>`;

    return {
      label: `${matchedCount}/${totalCount} ${label}`,
      tooltip,
      isMatched: matchedCount > 0,
      icon,
      type: 'summary',
    };
  };

  const buildWorkTypePill = (): ScrollablePillsItem | undefined => {
    if (!workType) return undefined;

    const isMatched = selectedWorkTypes.includes(workType);
    const label =
      workType === 'remote'
        ? t('filters.workType.remote')
        : workType === 'hybrid'
          ? t('filters.workType.hybrid')
          : t('filters.workType.office');
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

  const valueSummaryLabel = t('matchDetails.values').toLowerCase();
  const skillSummaryLabel = t('matchDetails.skills').toLowerCase();

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
  const workTypePill = workType ? buildWorkTypePill() : undefined;

  const groups: ExpandablePillGroup[] = [
    { key: 'values', summary: valueSummaryPill, items: valueItems },
    { key: 'skills', summary: skillSummaryPill, items: skillItems },
  ];

  return (
    <div className="flex gap-4">
      {showTooltip && matchTooltipContent && (
        <div className="flex items-center justify-center pr-4 border-r border-border">
          <InfoPopover content={matchTooltipContent}>
            <div className="flex items-center gap-2">
              <ProgressDonut percentage={totalMatchPercentage} size="sm" text="" />
              <span className="text-sm font-medium text-foreground">{totalMatchPercentage}%</span>
            </div>
          </InfoPopover>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <ExpandablePills
          preItems={workTypePill ? [workTypePill] : []}
          groups={groups}
          variant="default"
          fadeBackground={fadeBackground}
        />
      </div>
    </div>
  );
}
