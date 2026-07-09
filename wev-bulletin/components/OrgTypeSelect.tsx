'use client';

import FormLabel from './FormLabel';
import ErrorMessage from './ErrorMessage';
import { ORG_TYPES } from '@/lib/organizations/constants';
import { orgTypeI18nKey } from '@/lib/organizations/org-type';
import { cn } from '@/lib/utils';

interface OrgTypeSelectProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  typeLabel: (orgType: string) => string;
  error?: string;
  disabled?: boolean;
}

export default function OrgTypeSelect({
  value,
  onChange,
  label,
  placeholder,
  typeLabel,
  error,
  disabled,
}: OrgTypeSelectProps) {
  return (
    <div className="space-y-2">
      <FormLabel htmlFor="org-type">{label}</FormLabel>
      <select
        id="org-type"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'w-full px-4 py-3 text-[13px] font-medium border border-border rounded-wev-btn',
          'bg-background text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all',
        )}
      >
        <option value="">{placeholder}</option>
        {ORG_TYPES.map((orgType) => (
          <option key={orgType} value={orgType}>
            {typeLabel(orgTypeI18nKey(orgType))}
          </option>
        ))}
      </select>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
