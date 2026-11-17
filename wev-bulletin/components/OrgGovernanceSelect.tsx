'use client';

import FormLabel from './FormLabel';
import ErrorMessage from './ErrorMessage';
import {
  EXCLUDED_CATEGORY,
  EXCLUDED_SUBTYPE,
  VALID_CATEGORIES,
  subtypesForCategory,
  type GovernanceCategory,
} from '@/lib/organizations/governance-taxonomy';
import { cn } from '@/lib/utils';

interface OrgGovernanceSelectProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  categoryLabel: (category: string) => string;
  subtypeLabel: (subtype: string) => string;
  /** When false, only EXCLUDED_NON_SSE is offered (matches the SSE gate). */
  isSse: boolean;
  error?: string;
  disabled?: boolean;
}

export default function OrgGovernanceSelect({
  value,
  onChange,
  label,
  placeholder,
  categoryLabel,
  subtypeLabel,
  isSse,
  error,
  disabled,
}: OrgGovernanceSelectProps) {
  const sseCategories = VALID_CATEGORIES.filter((c) => c !== EXCLUDED_CATEGORY);

  return (
    <div className="space-y-2">
      <FormLabel htmlFor="org-governance">{label}</FormLabel>
      <select
        id="org-governance"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'w-full px-4 py-3 text-[13px] font-medium border border-border rounded-wev-btn',
          'bg-background text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all',
        )}
      >
        <option value="">{placeholder}</option>
        {!isSse ? (
          <option value={EXCLUDED_SUBTYPE}>{subtypeLabel(EXCLUDED_SUBTYPE)}</option>
        ) : (
          sseCategories.map((category: GovernanceCategory) => (
            <optgroup key={category} label={categoryLabel(category)}>
              {subtypesForCategory(category).map((code) => (
                <option key={code} value={code}>
                  {subtypeLabel(code)}
                </option>
              ))}
            </optgroup>
          ))
        )}
      </select>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
