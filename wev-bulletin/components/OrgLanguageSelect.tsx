'use client';

import FormLabel from './FormLabel';
import ErrorMessage from './ErrorMessage';
import { ORG_LANGUAGES } from '@/lib/organizations/constants';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

interface OrgLanguageSelectProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
}

export default function OrgLanguageSelect({
  value,
  onChange,
  label,
  placeholder,
  hint,
  error,
  disabled,
}: OrgLanguageSelectProps) {
  const t = useTranslations('admin.organizations.languages');

  return (
    <div className="space-y-2">
      <FormLabel htmlFor="org-language">{label}</FormLabel>
      <select
        id="org-language"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'w-full px-4 py-3 text-[13px] font-medium border border-border rounded-wev-btn',
          'bg-background text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all',
        )}
      >
        <option value="">{placeholder}</option>
        {ORG_LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {t(language)}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
