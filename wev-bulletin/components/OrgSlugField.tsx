'use client';

import FormLabel from './FormLabel';
import ErrorMessage from './ErrorMessage';
import { cn } from '@/lib/utils';

interface OrgSlugFieldProps {
  slug: string;
  onSlugChange: (value: string) => void;
  onManualEdit: () => void;
  label: string;
  placeholder: string;
  preview?: string;
  error?: string;
  disabled?: boolean;
}

export default function OrgSlugField({
  slug,
  onSlugChange,
  onManualEdit,
  label,
  placeholder,
  preview,
  error,
  disabled,
}: OrgSlugFieldProps) {
  return (
    <div className="space-y-2">
      <FormLabel htmlFor="org-slug" required>
        {label}
      </FormLabel>
      <input
        id="org-slug"
        type="text"
        value={slug}
        onChange={(e) => {
          onSlugChange(e.target.value);
          onManualEdit();
        }}
        placeholder={placeholder}
        required
        disabled={disabled}
        className={cn(
          'w-full px-4 py-3 text-[13px] font-medium border border-border rounded-wev-btn',
          'bg-background text-foreground placeholder:text-muted-foreground',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all',
        )}
      />
      {preview && <p className="text-xs text-muted-foreground">{preview}</p>}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
