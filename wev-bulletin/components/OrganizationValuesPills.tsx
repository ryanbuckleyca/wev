'use client';

import { useTranslations } from 'next-intl';
import ExpandablePills from './ExpandablePills';
import { getValueTranslationsHelper } from '@/lib/values';

interface Props {
  values: string[];
}

/** Escapes the minimal set of HTML entities that could break or inject into innerHTML. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function OrganizationValuesPills({ values }: Props) {
  const tValues = useTranslations('values');

  if (!values || values.length === 0) return null;

  const valueItems = values.map((value) => {
    const { label, description, example } = getValueTranslationsHelper(value, tValues);
    // tooltip is rendered via dangerouslySetInnerHTML in InfoPopover.
    // Content comes from translation files (developer-controlled), but we still
    // escape before interpolation so translator-supplied HTML characters don't
    // break the markup or create unexpected rendering.
    const tooltip = `${escapeHtml(description)}<br/><br/><em>${escapeHtml(example)}</em>`;
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
