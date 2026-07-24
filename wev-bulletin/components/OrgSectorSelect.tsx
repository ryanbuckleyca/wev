'use client';

import FormLabel from './FormLabel';
import ErrorMessage from './ErrorMessage';
import { SECTORS_LIST } from '@/lib/sectors';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

interface OrgSectorSelectProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  error?: string;
  disabled?: boolean;
}

export default function OrgSectorSelect({
  value,
  onChange,
  label,
  placeholder,
  error,
  disabled,
}: OrgSectorSelectProps) {
  const t = useTranslations('taxonomy.sectors');

  return (
    <div className="space-y-2">
      <FormLabel htmlFor="org-sector">{label}</FormLabel>
      <select
        id="org-sector"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'w-full px-4 py-3 text-[13px] font-medium border border-border rounded-wev-btn',
          'bg-background text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all',
        )}
      >
        <option value="">{placeholder}</option>
        {SECTORS_LIST.map((sectorId) => (
          <option key={sectorId} value={sectorId}>
            {t(`${sectorId}.label`)}
          </option>
        ))}
      </select>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
