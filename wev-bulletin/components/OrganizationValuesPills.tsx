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
    const { label, description, example } = getValueTranslationsHelper(value, tValues);
    // tooltip is rendered via dangerouslySetInnerHTML in InfoPopover.
    // Content comes exclusively from translation files (developer-controlled),
    // so HTML injection here is intentional and safe.
    const tooltip = `${description}<br/><br/><em>${example}</em>`;
    return {
      label,
      tooltip,
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
