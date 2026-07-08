'use client';

import { useTranslations } from 'next-intl';
import ExpandablePills from './ExpandablePills';
import { getValueTranslationsHelper } from '@/lib/values';

interface Props {
  values: string[];
}

export default function OrganizationValuesPills({ values }: Props) {
  const tValues = useTranslations('values');

  if (!values || values.length === 0) return null;

  const valueItems = values.map((value) => {
    const valueTranslations = getValueTranslationsHelper(value, tValues);
    return {
      label: valueTranslations.label,
      tooltip: `${valueTranslations.description}<br/><br/><em>${valueTranslations.example}</em>`,
      isMatched: false,
      type: 'value' as const,
    };
  });

  return (
    <ExpandablePills
      groups={[{ key: 'values', items: valueItems }]}
      variant="default"
      fadeBackground="var(--card)"
    />
  );
}
